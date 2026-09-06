from datetime import date, timedelta
from types import SimpleNamespace
from typing import Annotated
from uuid import UUID

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
    DigestRunStage,
    DigestRunStageStatus,
    DigestRunStageType,
    DigestRunStatus,
    DigestRunTrendAnalysis,
    Paper,
)
from app.radar.client import OpenAIRadarClient, RadarClientResult, RadarTokenUsage
from app.radar.contracts import (
    DigestBriefingOutput,
    DiscoveryRelevanceOutput,
    PaperSummariesOutput,
    RadarOutput,
    TrendAnalysisOutput,
)
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


def _stage_output(response_format):
    output = _radar_output()
    if response_format is DiscoveryRelevanceOutput:
        return DiscoveryRelevanceOutput(search=output.search, relevance=output.relevance)
    if response_format is PaperSummariesOutput:
        return PaperSummariesOutput(paper_summaries=output.paper_summaries)
    if response_format is TrendAnalysisOutput:
        return TrendAnalysisOutput(trend_analysis=output.trend_analysis)
    if response_format is DigestBriefingOutput:
        return DigestBriefingOutput(digest_briefing=output.digest_briefing)
    raise AssertionError(f"Unexpected response format: {response_format}")


class RecordingRadarClient:
    model_name = "recording-test-model"

    def __init__(self, fail_stage: DigestRunStageType | None = None) -> None:
        self.calls: list[dict] = []
        self.fail_stage = fail_stage

    def execute(
        self,
        prompt: RadarPrompt,
        *,
        response_format,
        use_web_search: bool,
        reasoning_effort: str,
    ) -> RadarClientResult:
        self.calls.append(
            {
                "prompt": prompt,
                "response_format": response_format,
                "use_web_search": use_web_search,
                "reasoning_effort": reasoning_effort,
            }
        )
        if prompt.stage == self.fail_stage:
            raise RuntimeError("Deliberate test failure")
        return RadarClientResult(
            output=_stage_output(response_format),
            response_id=f"recorded-response-{len(self.calls)}",
            model_name=self.model_name,
            usage=RadarTokenUsage(input_tokens=100, output_tokens=50),
        )


def _runner(db: Session, radar_client) -> RadarRunner:
    return RadarRunner(
        db,
        client=radar_client,
        prompt_builder=RadarPromptBuilder(),
        history_limit=3,
        summary_batch_size=5,
        reasoning_efforts={
            DigestRunStageType.DISCOVERY_RELEVANCE: "medium",
            DigestRunStageType.PAPER_SUMMARIES: "low",
            DigestRunStageType.TREND_ANALYSIS: "medium",
            DigestRunStageType.DIGEST_BRIEFING: "low",
        },
    )


def _override_runner(radar_client):
    def dependency(
        db: Annotated[Session, Depends(get_db)],
    ) -> RadarRunner:
        return _runner(db, radar_client)

    app.dependency_overrides[get_radar_runner] = dependency


def test_run_now_executes_four_stages_and_persists_progress(
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

    assert response.status_code == 202
    assert response.json()["status"] == "running"
    assert len(response.json()["stages"]) == 4
    assert len(radar_client.calls) == 4
    assert radar_client.calls[0]["use_web_search"] is True
    assert all(not call["use_web_search"] for call in radar_client.calls[1:])

    detail = client.get(
        f"/api/v1/digests/{digest['id']}/runs/{response.json()['id']}",
        headers=authorization,
    )
    assert detail.status_code == 200
    result = detail.json()
    assert result["status"] == "completed"
    assert result["current_stage"] is None
    assert [stage["status"] for stage in result["stages"]] == ["completed"] * 4
    assert result["paper_results"][0]["summary_data"]["concise_summary"]
    assert result["trend_analysis"]["overview"]
    assert result["briefing"]["executive_summary"]

    with db_session_factory() as db:
        assert db.scalar(select(func.count()).select_from(DigestRun)) == 1
        assert db.scalar(select(func.count()).select_from(DigestRunStage)) == 4
        assert db.scalar(select(func.count()).select_from(Paper)) == 1
        assert db.scalar(select(func.count()).select_from(DigestRunPaper)) == 1
        assert db.scalar(select(func.count()).select_from(DigestRunTrendAnalysis)) == 1
        assert db.scalar(select(func.count()).select_from(DigestRunBriefing)) == 1


def test_completed_history_is_added_only_to_relevant_later_stages(
    client: TestClient,
) -> None:
    user = _register(client, "history@example.com", "History Owner")
    authorization = _authorization(user)
    digest = _create_digest(client, authorization)
    radar_client = RecordingRadarClient()
    _override_runner(radar_client)

    first = client.post(f"/api/v1/digests/{digest['id']}/runs", headers=authorization)
    second = client.post(f"/api/v1/digests/{digest['id']}/runs", headers=authorization)

    assert first.status_code == 202
    assert second.status_code == 202
    assert len(radar_client.calls) == 8
    second_discovery = radar_client.calls[4]["prompt"]
    assert first.json()["id"] in second_discovery.user
    assert "Previous completed runs" in second_discovery.user
    assert "Previous completed runs" not in radar_client.calls[5]["prompt"].user

    listed = client.get(
        f"/api/v1/digests/{digest['id']}/runs", headers=authorization
    )
    assert listed.status_code == 200
    assert listed.json()["total"] == 2


def test_failed_stage_preserves_completed_and_pending_stage_history(
    client: TestClient,
) -> None:
    user = _register(client, "failure@example.com", "Failure Owner")
    authorization = _authorization(user)
    digest = _create_digest(client, authorization)
    radar_client = RecordingRadarClient(DigestRunStageType.PAPER_SUMMARIES)
    _override_runner(radar_client)

    response = client.post(
        f"/api/v1/digests/{digest['id']}/runs", headers=authorization
    )
    assert response.status_code == 202

    detail = client.get(
        f"/api/v1/digests/{digest['id']}/runs/{response.json()['id']}",
        headers=authorization,
    ).json()
    assert detail["status"] == DigestRunStatus.FAILED
    assert [stage["status"] for stage in detail["stages"]] == [
        DigestRunStageStatus.COMPLETED,
        DigestRunStageStatus.FAILED,
        DigestRunStageStatus.PENDING,
        DigestRunStageStatus.PENDING,
    ]
    assert "Deliberate test failure" in detail["stages"][1]["error_message"]
    assert detail["search_data"]["queries"]
    assert detail["paper_results"][0]["summary_data"] is None
    assert detail["trend_analysis"] is None
    assert detail["briefing"] is None


def test_one_active_run_per_user_is_enforced_across_digests(
    client: TestClient,
    db_session_factory: sessionmaker[Session],
) -> None:
    first_user = _register(client, "active@example.com", "Active Owner")
    first_access = _authorization(first_user)
    first_digest = _create_digest(client, first_access)
    second_digest = _create_digest(client, first_access)
    radar_client = RecordingRadarClient()
    _override_runner(radar_client)

    with db_session_factory() as db:
        active = _runner(db, radar_client).start_digest(
            digest_id=UUID(first_digest["id"]),
            owner_id=UUID(first_user.json()["user"]["id"]),
        )
        active_id = str(active.id)

    blocked = client.post(
        f"/api/v1/digests/{second_digest['id']}/runs", headers=first_access
    )
    assert blocked.status_code == 409
    assert "Only one" not in blocked.json()["detail"]
    assert "already in progress" in blocked.json()["detail"]
    active_response = client.get("/api/v1/digest-runs/active", headers=first_access)
    assert active_response.status_code == 200
    assert active_response.json()["id"] == active_id
    delete_active = client.delete(
        f"/api/v1/digests/{first_digest['id']}", headers=first_access
    )
    assert delete_active.status_code == 409
    assert "while its radar run is in progress" in delete_active.json()["detail"]

    other_user = _register(client, "other.active@example.com", "Other Owner")
    other_access = _authorization(other_user)
    other_digest = _create_digest(client, other_access)
    assert client.post(
        f"/api/v1/digests/{other_digest['id']}/runs", headers=other_access
    ).status_code == 202


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


def test_missing_openai_configuration_prevents_a_run(client: TestClient) -> None:
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


def test_openai_client_starts_background_structured_response(monkeypatch) -> None:
    calls: list[dict] = []
    retrieved: list[str] = []
    output = _stage_output(DiscoveryRelevanceOutput)

    class FakeResponses:
        def parse(self, **kwargs):
            calls.append(kwargs)
            return SimpleNamespace(
                output_parsed=None,
                id="response-123",
                status="queued",
                usage=None,
            )

        def retrieve(self, response_id):
            retrieved.append(response_id)
            return SimpleNamespace(
                output_text=output.model_dump_json(),
                id=response_id,
                status="completed",
                usage=None,
            )

    class FakeOpenAI:
        def __init__(self, **kwargs):
            assert kwargs == {
                "api_key": "test-key",
                "timeout": 60,
                "max_retries": 0,
            }
            self.responses = FakeResponses()

    monkeypatch.setattr(openai, "OpenAI", FakeOpenAI)
    radar_client = OpenAIRadarClient(
        api_key="test-key",
        model_name="gpt-6-astra",
        request_timeout_seconds=60,
        background_poll_timeout_seconds=900,
        background_poll_interval_seconds=0,
        max_output_tokens=30000,
        max_search_tool_calls=8,
        search_context_size="medium",
    )
    prompt = RadarPrompt(
        stage=DigestRunStageType.DISCOVERY_RELEVANCE,
        system="System prompt",
        user="Run prompt",
        version="test",
    )

    result = radar_client.execute(
        prompt,
        response_format=DiscoveryRelevanceOutput,
        use_web_search=True,
        reasoning_effort="medium",
    )

    assert result.output == output
    assert result.response_id == "response-123"
    assert retrieved == ["response-123"]
    assert calls[0]["background"] is True
    assert calls[0]["reasoning"] == {"effort": "medium"}
    assert calls[0]["tools"] == [
        {"type": "web_search", "search_context_size": "medium"}
    ]
    assert calls[0]["max_tool_calls"] == 8
    assert calls[0]["store"] is False
    assert calls[0]["text_format"] is DiscoveryRelevanceOutput


def test_stage_prompts_are_versioned_compact_and_compliant() -> None:
    builder = RadarPromptBuilder()
    discovery = builder.build_discovery_relevance(
        digest_snapshot={"topic": "Transparent AI evaluation", "maximum_papers": 5},
        history_context=[],
    )
    summaries = builder.build_paper_summaries(
        digest_snapshot={"topic": "Transparent AI evaluation"},
        papers=[],
    )

    assert discovery.version == "2026-09-06.1"
    assert "untrusted data" in discovery.system
    assert "Public accessibility does not establish" in discovery.system
    assert "could substitute for a source" in discovery.system
    assert "Stage 1 of 4" in discovery.user
    assert "Web search is enabled only for this stage" in discovery.user
    assert "Stage 2 of 4" in summaries.user
    assert "Do not search for or add papers" in summaries.user
    assert "Transparent AI evaluation" in discovery.user
    for filename in (
        "shared_system.md",
        "discovery_relevance.md",
        "paper_summaries.md",
        "trend_analysis.md",
        "digest_briefing.md",
        "system.md",
        "radar_run.md",
    ):
        assert (PROMPT_DIRECTORY / filename).is_file()


def test_radar_contract_rejects_unknown_cross_stage_paper_references() -> None:
    output = _radar_output()
    invalid = output.model_dump()
    invalid["digest_briefing"]["top_paper_external_ids"] = ["unknown-paper"]

    with pytest.raises(ValueError, match="unknown papers"):
        RadarOutput.model_validate(invalid)


def test_stage_briefing_contract_rejects_overlapping_paper_selections() -> None:
    briefing = _radar_output().digest_briefing.model_dump()
    briefing["secondary_paper_external_ids"] = briefing[
        "top_paper_external_ids"
    ].copy()

    with pytest.raises(ValueError, match="must not overlap"):
        DigestBriefingOutput.model_validate({"digest_briefing": briefing})
