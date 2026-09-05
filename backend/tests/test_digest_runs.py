from datetime import date, timedelta
from types import SimpleNamespace
from typing import Annotated

import openai
import pytest
from fastapi import Depends
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

from app.api.routes.digest_runs import get_radar_runner
from app.core.config import Settings, get_settings
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
from app.radar.client import OpenAIRadarClient, RadarClientResult
from app.radar.contracts import RadarOutput
from app.radar.prompt_builder import (
    PROMPT_DIRECTORY,
    RadarPrompt,
    RadarPromptBuilder,
)
from app.radar.runner import RadarRunner

PASSWORD = "correct-horse-battery-staple"


def _radar_output() -> RadarOutput:
    external_id = "doi:10.1234/radar.test"
    return RadarOutput.model_validate(
        {
            "search": {
                "queries": ["AI agents software engineering benchmarks"],
                "sources_used": ["Crossref"],
                "papers": [
                    {
                        "source_name": "Crossref",
                        "external_id": external_id,
                        "title": "Evaluating AI Agents for Software Engineering",
                        "authors": ["Ada Researcher"],
                        "abstract": "A test record used to verify structured persistence.",
                        "published_date": date.today(),
                        "updated_date": date.today(),
                        "venue_or_source": "Journal of Test Research",
                        "url": "https://doi.org/10.1234/radar.test",
                        "pdf_url": None,
                        "doi": "10.1234/radar.test",
                        "access_status": "metadata_only",
                        "license": None,
                        "full_text_available": False,
                        "discovery_reason": "Matches the digest topic and reporting period.",
                        "matched_keywords": ["AI agents", "benchmarks"],
                        "possible_duplicate_of": None,
                        "factual_note": "Metadata-only test fixture.",
                        "warnings": ["Full text was not evaluated."],
                        "citations": [
                            {
                                "title": "Canonical DOI record",
                                "url": "https://doi.org/10.1234/radar.test",
                            }
                        ],
                    }
                ],
                "deduplication_notes": [],
                "coverage_notes": ["The fixture contains one paper."],
                "next_step_recommendations": ["Search additional scholarly indexes."],
            },
            "relevance": {
                "methodology": "Scored topic fit, novelty, and practical value.",
                "assessments": [
                    {
                        "external_id": external_id,
                        "topic_relevance_score": 9,
                        "novelty_signal_score": 7,
                        "practical_value_score": 8,
                        "score": 86,
                        "confidence_score": 6,
                        "recommended_status": "summarize",
                        "best_digest_placement": "top_paper",
                        "rationale": "Directly addresses evaluation of coding agents.",
                        "criteria": ["Topic match", "Audience value"],
                        "evidence_used": ["Title", "Bibliographic metadata"],
                        "potential_value_for_audience": "Supports benchmark selection.",
                        "caveats": ["Findings were not verified from full text."],
                        "next_step_recommendations": ["Review the source paper."],
                    }
                ],
                "recommendations": ["Verify findings against the source."],
                "quality_warnings": ["Assessment is based on limited source material."],
            },
            "paper_summaries": [
                {
                    "external_id": external_id,
                    "summary_basis": "metadata_only",
                    "paper_type": "unclear",
                    "concise_summary": "The paper appears relevant to evaluation of software-engineering agents.",
                    "why_this_paper_matters": ["It addresses the configured topic."],
                    "methods": [],
                    "key_findings": [],
                    "limitations": ["Only metadata was available."],
                    "implications": ["The full paper should be reviewed before use."],
                    "recommendations": ["Read the canonical source."],
                    "suggested_digest_bullet": "A relevant evaluation paper was identified.",
                    "follow_up_questions": ["Which benchmarks are evaluated?"],
                    "related_search_terms": ["coding agent benchmark"],
                    "warnings": ["No detailed findings were inferred."],
                    "confidence_score": 6,
                }
            ],
            "trend_analysis": {
                "overview": "The available evidence is insufficient to establish a broad trend.",
                "overall_confidence": "low",
                "analysis_limitations": ["Only one paper is represented."],
                "themes": [
                    {
                        "title": "Agent evaluation",
                        "summary": "Evaluation remains a visible research concern.",
                        "evidence_type": "single_paper_signal",
                        "evidence_external_ids": [external_id],
                        "observed_pattern": "One relevant evaluation paper was identified.",
                        "interpretation": "More evidence is required before calling this a trend.",
                        "confidence": "low",
                        "relevance_to_audience": "Useful as an item to monitor.",
                        "caveats": ["Single-paper signal."],
                    }
                ],
                "emerging_items": [],
                "repeated_limitations_or_unresolved_problems": [],
                "contradictions_or_competing_approaches": [],
                "weak_signals": [],
                "changes_vs_previous_digest": [],
                "practical_implications": [],
                "recommendations": ["Continue monitoring evaluation research."],
                "recommended_next_searches": [
                    {
                        "query": "software engineering agent benchmark evaluation",
                        "reason": "Broaden the evidence base.",
                        "priority": "high",
                    }
                ],
            },
            "digest_briefing": {
                "title": "AI agents for software engineering",
                "executive_summary": "One relevant paper was identified, with limited source access.",
                "highlights": ["Agent evaluation is a signal worth monitoring."],
                "main_signal": {
                    "title": "Evaluation evidence",
                    "summary": "A paper directly related to agent evaluation was found.",
                    "why_it_matters": "Reliable evaluation is necessary for adoption decisions.",
                    "supporting_external_ids": [external_id],
                    "confidence": "low",
                    "caveats": ["The result is based on metadata."],
                },
                "top_paper_external_ids": [external_id],
                "secondary_paper_external_ids": [],
                "recommendations": [
                    {
                        "action": "Review the source paper.",
                        "reason": "Detailed findings were not available.",
                        "priority": "high",
                        "related_external_ids": [external_id],
                    }
                ],
                "recommended_next_searches": [
                    {
                        "query": "software engineering agent benchmark evaluation",
                        "reason": "Broaden the evidence base.",
                        "priority": "high",
                    }
                ],
                "source_basis": "metadata_only",
                "transparency_note": "AI-assisted briefing; verify the original source.",
                "quality_warnings": ["Only metadata was available."],
                "content_markdown": "# AI agents for software engineering\n\nOne relevant paper was identified.",
            },
        }
    )


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
    model_name = "recording-test-model"

    def __init__(self) -> None:
        self.prompts: list[RadarPrompt] = []

    def execute(self, prompt: RadarPrompt) -> RadarClientResult:
        self.prompts.append(prompt)
        return RadarClientResult(
            output=_radar_output(),
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
    assert result["model_name"] == "recording-test-model"
    assert result["paper_count"] == 1
    assert result["search_data"]["queries"]
    assert result["relevance_data"]["methodology"]
    assert result["paper_results"][0]["search_data"]["access_status"] == "metadata_only"
    assert result["paper_results"][0]["relevance_data"]["topic_relevance_score"] == 9
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
    _override_runner(RecordingRadarClient())
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


def test_missing_openai_configuration_prevents_a_run(
    client: TestClient,
    monkeypatch,
) -> None:
    def fail_if_called(self, prompt):
        del self, prompt
        raise AssertionError("A live OpenAI client must not run in tests")

    monkeypatch.setattr(OpenAIRadarClient, "execute", fail_if_called)
    app.dependency_overrides[get_settings] = lambda: Settings(
        environment="test",
        openai_api_key=None,
    )
    user = _register(client, "no.openai@example.com", "No OpenAI Calls")
    authorization = _authorization(user)
    digest = _create_digest(client, authorization)

    response = client.post(
        f"/api/v1/digests/{digest['id']}/runs", headers=authorization
    )
    assert response.status_code == 503
    assert response.json()["detail"] == (
        "OpenAI is not configured. Set OPENAI_API_KEY before running a digest."
    )


def test_openai_client_makes_one_responses_request_with_structured_output(
    monkeypatch,
) -> None:
    calls: list[dict] = []
    output = _radar_output()

    class FakeResponses:
        def parse(self, **kwargs):
            calls.append(kwargs)
            return SimpleNamespace(
                output_parsed=output,
                id="response-123",
            )

    class FakeOpenAI:
        def __init__(self, **kwargs):
            assert kwargs == {
                "api_key": "test-key",
                "timeout": 600,
                "max_retries": 0,
            }
            self.responses = FakeResponses()

    monkeypatch.setattr(openai, "OpenAI", FakeOpenAI)
    radar_client = OpenAIRadarClient(
        api_key="test-key",
        model_name="gpt-6-astra",
        reasoning_effort="high",
        timeout_seconds=600,
        max_output_tokens=60000,
    )

    result = radar_client.execute(
        RadarPrompt(system="System prompt", user="Run prompt", version="test")
    )

    assert result.output == output
    assert result.response_id == "response-123"
    assert len(calls) == 1
    assert calls[0]["model"] == "gpt-6-astra"
    assert calls[0]["reasoning"] == {"effort": "high"}
    assert calls[0]["tools"] == [
        {"type": "web_search", "search_context_size": "high"}
    ]
    assert calls[0]["tool_choice"] == "required"
    assert calls[0]["store"] is False
    assert calls[0]["text_format"] is RadarOutput


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
    output = _radar_output()
    invalid = output.model_dump()
    invalid["digest_briefing"]["top_paper_external_ids"] = ["unknown-paper"]

    with pytest.raises(ValueError, match="unknown papers"):
        RadarOutput.model_validate(invalid)
