from datetime import date, timedelta
from typing import Annotated

import pytest
from fastapi import Depends
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

from app.api.routes.digest_runs import get_radar_runner
from app.db.session import get_db
from app.main import app
from app.models.digest_run import (
    DigestRun,
    DigestRunBriefing,
    DigestRunPaper,
    DigestRunStatus,
    DigestRunTrendAnalysis,
    Paper,
)
from app.radar.client import DryRunRadarClient, OpenAIRadarClient, RadarClientResult
from app.radar.contracts import RadarOutput
from app.radar.prompt_builder import (
    PROMPT_DIRECTORY,
    RadarPrompt,
    RadarPromptBuilder,
)
from app.radar.runner import RadarRunner

PASSWORD = "correct-horse-battery-staple"


def _register(client: TestClient, email: str, full_name: str):
    return client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "full_name": full_name,
            "password": PASSWORD,
            "password_confirmation": PASSWORD,
        },
    )


def _authorization(response) -> dict[str, str]:
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _create_digest(client: TestClient, authorization: dict[str, str]):
    today = date.today()
    response = client.post(
        "/api/v1/digests",
        json={
            "topic": "AI agents for software engineering",
            "description": "Track evidence about agentic software delivery.",
            "include_keywords": ["coding agents", "benchmarks"],
            "exclude_keywords": ["opinion"],
            "target_audience": ["builders_technical_teams"],
            "reporting_from": (today - timedelta(days=14)).isoformat(),
            "reporting_to": today.isoformat(),
            "frequency": "weekly",
            "maximum_papers": 20,
        },
        headers=authorization,
    )
    assert response.status_code == 201
    return response.json()


class RecordingRadarClient:
    model_name = "recording-dry-run"

    def __init__(self) -> None:
        self.prompts: list[RadarPrompt] = []

    def execute(self, prompt: RadarPrompt) -> RadarClientResult:
        self.prompts.append(prompt)
        dry_result = DryRunRadarClient().execute(prompt)
        return RadarClientResult(
            output=dry_result.output,
            response_id=f"recorded-response-{len(self.prompts)}",
            model_name=self.model_name,
        )


class FailingRadarClient:
    model_name = "failing-test-client"

    def execute(self, prompt: RadarPrompt) -> RadarClientResult:
        del prompt
        raise RuntimeError("Deliberate test failure")


def _override_runner(radar_client):
    def dependency(
        db: Annotated[Session, Depends(get_db)],
    ) -> RadarRunner:
        return RadarRunner(
            db,
            client=radar_client,
            prompt_builder=RadarPromptBuilder(),
            history_limit=3,
        )

    app.dependency_overrides[get_radar_runner] = dependency


def test_run_now_uses_one_client_call_and_persists_each_stage(
    client: TestClient,
    db_session_factory: sessionmaker[Session],
) -> None:
    user = _register(client, "runner@example.com", "Radar Runner")
    authorization = _authorization(user)
    digest = _create_digest(client, authorization)
    radar_client = RecordingRadarClient()
    _override_runner(radar_client)

    response = client.post(
        f"/api/v1/digests/{digest['id']}/runs", headers=authorization
    )

    assert response.status_code == 201
    result = response.json()
    assert len(radar_client.prompts) == 1
    assert digest["topic"] in radar_client.prompts[0].user
    assert result["status"] == "completed"
    assert result["model_name"] == "recording-dry-run"
    assert result["paper_count"] == 1
    assert result["search_data"]["queries"]
    assert result["relevance_data"]["methodology"]
    assert result["paper_results"][0]["search_data"]["access_status"] == "metadata_only"
    assert result["paper_results"][0]["relevance_data"]["topic_relevance_score"] == 8
    assert result["paper_results"][0]["summary_data"]["concise_summary"]
    assert result["paper_results"][0]["summary_data"]["summary_basis"] == "metadata_only"
    assert result["trend_analysis"]["overview"]
    assert result["briefing"]["executive_summary"]

    with db_session_factory() as db:
        assert db.scalar(select(func.count()).select_from(DigestRun)) == 1
        assert db.scalar(select(func.count()).select_from(Paper)) == 1
        assert db.scalar(select(func.count()).select_from(DigestRunPaper)) == 1
        assert db.scalar(select(func.count()).select_from(DigestRunTrendAnalysis)) == 1
        assert db.scalar(select(func.count()).select_from(DigestRunBriefing)) == 1


def test_completed_history_is_added_to_the_next_single_request(
    client: TestClient,
) -> None:
    user = _register(client, "history@example.com", "History Owner")
    authorization = _authorization(user)
    digest = _create_digest(client, authorization)
    radar_client = RecordingRadarClient()
    _override_runner(radar_client)

    first = client.post(f"/api/v1/digests/{digest['id']}/runs", headers=authorization)
    second = client.post(f"/api/v1/digests/{digest['id']}/runs", headers=authorization)

    assert first.status_code == 201
    assert second.status_code == 201
    assert len(radar_client.prompts) == 2
    assert second.json()["history_context"][0]["run_id"] == first.json()["id"]
    assert first.json()["id"] in radar_client.prompts[1].user

    listed = client.get(
        f"/api/v1/digests/{digest['id']}/runs", headers=authorization
    )
    assert listed.status_code == 200
    assert listed.json()["total"] == 2
    detail = client.get(
        f"/api/v1/digests/{digest['id']}/runs/{first.json()['id']}",
        headers=authorization,
    )
    assert detail.status_code == 200


def test_failed_execution_is_recorded_in_history(client: TestClient) -> None:
    user = _register(client, "failure@example.com", "Failure Owner")
    authorization = _authorization(user)
    digest = _create_digest(client, authorization)
    _override_runner(FailingRadarClient())

    response = client.post(
        f"/api/v1/digests/{digest['id']}/runs", headers=authorization
    )
    assert response.status_code == 502

    history = client.get(
        f"/api/v1/digests/{digest['id']}/runs", headers=authorization
    )
    assert history.status_code == 200
    assert history.json()["total"] == 1
    assert history.json()["items"][0]["status"] == DigestRunStatus.FAILED
    assert "Deliberate test failure" in history.json()["items"][0]["error_message"]


def test_run_history_is_owner_scoped(client: TestClient) -> None:
    owner = _register(client, "run.owner@example.com", "Run Owner")
    other = _register(client, "run.other@example.com", "Other Owner")
    owner_access = _authorization(owner)
    digest = _create_digest(client, owner_access)
    run = client.post(
        f"/api/v1/digests/{digest['id']}/runs", headers=owner_access
    ).json()
    other_access = _authorization(other)

    assert client.post(
        f"/api/v1/digests/{digest['id']}/runs", headers=other_access
    ).status_code == 404
    assert client.get(
        f"/api/v1/digests/{digest['id']}/runs", headers=other_access
    ).status_code == 404
    assert client.get(
        f"/api/v1/digests/{digest['id']}/runs/{run['id']}", headers=other_access
    ).status_code == 404


def test_default_test_configuration_never_uses_the_openai_client(
    client: TestClient,
    monkeypatch,
) -> None:
    def fail_if_called(self, prompt):
        del self, prompt
        raise AssertionError("A live OpenAI client must not run in tests")

    monkeypatch.setattr(OpenAIRadarClient, "execute", fail_if_called)
    user = _register(client, "no.openai@example.com", "No OpenAI Calls")
    authorization = _authorization(user)
    digest = _create_digest(client, authorization)

    response = client.post(
        f"/api/v1/digests/{digest['id']}/runs", headers=authorization
    )
    assert response.status_code == 201
    assert response.json()["model_name"] == "dry-run"


def test_consolidated_prompt_is_versioned_compliant_and_archived() -> None:
    prompt = RadarPromptBuilder().build(
        digest_snapshot={"topic": "Transparent AI evaluation", "maximum_papers": 5},
        history_context=[],
    )

    assert prompt.version == "2026-09-05.3"
    assert "five connected stages" in prompt.system
    assert "untrusted data" in prompt.system
    assert "Public accessibility does not mean" in prompt.system
    assert "could reasonably substitute for a paper" in prompt.system
    assert "maximum number of papers returned and persisted" in prompt.user
    assert "Do not treat a publicly reachable page" in prompt.user
    assert "Transparent AI evaluation" in prompt.user
    assert (PROMPT_DIRECTORY / "archive" / "system.v2026-09-05.1.md").is_file()
    assert (PROMPT_DIRECTORY / "archive" / "radar_run.v2026-09-05.1.md").is_file()


def test_radar_contract_rejects_unknown_cross_stage_paper_references() -> None:
    output = DryRunRadarClient().execute(
        RadarPrompt(system="test", user="test", version="test")
    ).output
    invalid = output.model_dump()
    invalid["digest_briefing"]["top_paper_external_ids"] = ["unknown-paper"]

    with pytest.raises(ValueError, match="unknown papers"):
        RadarOutput.model_validate(invalid)
