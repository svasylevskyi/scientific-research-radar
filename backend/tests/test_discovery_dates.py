"""Publication-window selection happens before content capture and paid summaries."""

from dataclasses import replace
from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest
from sqlalchemy import select

from app.models.digest import Digest
from app.models.digest_run import DigestRunStageType, DigestRunStatus
from app.models.source_content import RunSourceContent
from app.radar import stage_inputs, validation
from app.radar.contracts import DiscoveryRelevanceOutput, DigestBriefingOutput, TrendAnalysisOutput
from app.radar.prompt_builder import RadarPromptBuilder
from app.repositories.digest_run_repository import DigestRunRepository
from test_digest_runs import (
    RecordingRadarClient, _authorization, _create_digest, _execute_next,
    _override_runner, _register,
)
from test_research_stages import two_papers

START, END = date(2026, 8, 29), date(2026, 9, 29)
EXCLUDED_ID = "ieeexplore:11660753"


@pytest.mark.parametrize("published,status", [
    (date(2026, 8, 20), "reject"),
    (START - timedelta(days=1), "reject"),
    (START, "summarize"),
    (END, "summarize"),
    (END + timedelta(days=1), "reject"),
    (None, "summarize"),
])
def test_inclusive_publication_window_does_not_use_update_date(published, status):
    output = two_papers()
    output.search.papers[0].published_date = published
    output.search.papers[0].updated_date = END
    output.search.papers[1].published_date = START
    validation.exclude_out_of_period_papers(output=output, reporting_from=START, reporting_to=END)
    assessment = output.relevance.assessments[0]
    assert assessment.recommended_status == status
    assert output.search.papers[0].published_date == published
    assert output.relevance.assessments[1].recommended_status == "mention_briefly"
    selected = {paper["external_id"] for paper in stage_inputs.summary_input(output)}
    assert (output.search.papers[0].external_id in selected) == (status != "reject")
    if status == "reject":
        reason = output.search.papers[0].warnings[-1]
        assert str(published) in reason and str(START) in reason and str(END) in reason
        assert assessment.best_digest_placement == "reject"
        assert assessment.rationale.startswith(reason)
        assert reason in assessment.caveats


@pytest.mark.parametrize("previous_status", ["summarize", "mention_briefly", "archive", "reject"])
def test_exclusions_preserve_candidates_and_are_idempotent(previous_status):
    output = two_papers()
    output.search.papers[0].published_date = date(2026, 8, 20)
    output.relevance.assessments[0].recommended_status = previous_status
    before = output.model_copy(deep=True)
    validation.exclude_out_of_period_papers(output=output, reporting_from=START, reporting_to=END)
    saved = output.model_dump(mode="json")
    validation.exclude_out_of_period_papers(output=output, reporting_from=START, reporting_to=END)
    assert output.model_dump(mode="json") == saved
    assert len(output.search.papers) == len(before.search.papers)
    assert output.search.papers[0].citations == before.search.papers[0].citations
    assert before.relevance.assessments[0].rationale in output.relevance.assessments[0].rationale


def test_invalid_window_fails_before_mutating_selection():
    output = two_papers()
    before = output.model_dump(mode="json")
    with pytest.raises(validation.RadarOutputValidationError, match="Invalid reporting interval"):
        validation.exclude_out_of_period_papers(output=output, reporting_from=END, reporting_to=START)
    assert output.model_dump(mode="json") == before


def test_scheduled_filter_uses_rolling_window_in_occurrence_timezone():
    digest = SimpleNamespace(
        id=uuid4(), owner_id=uuid4(), topic="Research", description=None,
        include_keywords=[], exclude_keywords=[], target_audience=["general"],
        reporting_from=START, reporting_to=END, maximum_papers=3, frequency=None,
        created_at=datetime.now(timezone.utc), updated_at=datetime.now(timezone.utc),
    )
    # Warsaw is already September 30, regardless of when a delayed worker runs.
    snapshot = stage_inputs.digest_snapshot(
        digest=digest, scheduled_for=datetime(2026, 9, 29, 22, 30, tzinfo=timezone.utc),
        time_zone="Europe/Warsaw",
    )
    assert (snapshot["reporting_from"], snapshot["reporting_to"]) == ("2026-08-30", "2026-09-30")
    output = two_papers()
    output.search.papers[0].published_date = START
    output.search.papers[1].published_date = date(2026, 9, 30)
    validation.exclude_out_of_period_papers(
        output=output, reporting_from=date.fromisoformat(snapshot["reporting_from"]),
        reporting_to=date.fromisoformat(snapshot["reporting_to"]),
    )
    assert [a.recommended_status for a in output.relevance.assessments] == ["reject", "mention_briefly"]


def test_discovery_prompt_requires_date_selection_without_foundational_exception():
    prompt = RadarPromptBuilder().build_discovery_relevance(
        digest_snapshot={"reporting_from": START.isoformat(), "reporting_to": END.isoformat()},
        history_context=[], feedback_context=[],
    )
    assert "inclusive publication-date window" in prompt.user
    assert "older foundational context" not in prompt.user
    assert "never guess a date" in prompt.user
    assert str(START) in prompt.user and str(END) in prompt.user


class DateFilteringClient(RecordingRadarClient):
    def __init__(self, *, all_outside=False, leak_stage=None, fail_stage=None):
        super().__init__(fail_stage=fail_stage)
        self.all_outside = all_outside
        self.leak_stage = leak_stage

    def execute(self, prompt, **kwargs):
        result = super().execute(prompt, **kwargs)
        if kwargs["response_format"] is DiscoveryRelevanceOutput:
            output = two_papers()
            if self.all_outside:
                output.search.papers[0].published_date = date.today() - timedelta(days=20)
            output.search.papers[1].external_id = EXCLUDED_ID
            output.search.papers[1].published_date = date.today() - timedelta(days=20)
            output.relevance.assessments[1].external_id = EXCLUDED_ID
            return replace(result, output=output)
        if kwargs["response_format"] is TrendAnalysisOutput:
            if self.all_outside:
                result.output.trend_analysis.themes = []
                result.output.trend_analysis.overview = "No eligible papers were found."
            elif self.leak_stage == DigestRunStageType.TREND_ANALYSIS:
                result.output.trend_analysis.themes[0].evidence_external_ids = [EXCLUDED_ID]
        if kwargs["response_format"] is DigestBriefingOutput:
            if self.all_outside:
                briefing = result.output.digest_briefing
                briefing.main_signal = None
                briefing.top_paper_external_ids = []
                briefing.recommendations = []
                briefing.highlights = []
                briefing.executive_summary = briefing.content_markdown = "No eligible papers were found."
            elif self.leak_stage == DigestRunStageType.DIGEST_BRIEFING:
                result.output.digest_briefing.top_paper_external_ids = [EXCLUDED_ID]
        return result


def queue(client, radar):
    headers = _authorization(_register(client, "date-filter@example.com", "Research"))
    digest = _create_digest(client, headers)
    _override_runner(radar)
    queued = client.post(f"/api/v1/digests/{digest['id']}/runs", headers=headers)
    assert queued.status_code == 202
    return headers, digest, UUID(queued.json()["id"])


@pytest.mark.parametrize("mode,check_dates", [("off", False), ("observe", False), ("enforce", True)])
@pytest.mark.parametrize("all_outside", [False, True])
def test_persisted_selection_skips_content_and_paid_summaries(
    client, db_session_factory, mode, check_dates, all_outside,
):
    radar = DateFilteringClient(all_outside=all_outside)
    _, _, run_id = queue(client, radar)
    with db_session_factory() as db:
        run = DigestRunRepository(db).get(run_id)
        run.quality_config = {**run.quality_config, "config": {
            **run.quality_config["config"], "mode": mode, "check_reporting_dates": check_dates,
        }}
        db.commit()
    _execute_next(db_session_factory, radar)
    with db_session_factory() as db:
        run = DigestRunRepository(db).get(run_id)
        assert run.status == DigestRunStatus.COMPLETED, run.error_message
        discovery = next(s for s in run.stages if s.stage == DigestRunStageType.DISCOVERY_RELEVANCE)
        saved = DiscoveryRelevanceOutput.model_validate(discovery.result_data)
        assert saved.relevance.assessments[1].recommended_status == "reject"
        assert "Excluded by reporting-period rule" in saved.search.papers[1].warnings[-1]
        records = list(db.scalars(select(RunSourceContent).where(RunSourceContent.run_id == run_id)))
        assert len(records) == (0 if all_outside else 1)
        assert all(row.external_id != EXCLUDED_ID for row in records)
        rejected = next(item for item in run.paper_results if item.paper.external_id == EXCLUDED_ID)
        assert rejected.summary_data is None
        assert rejected.relevance_data["recommended_status"] == "reject"
        assert "reporting_period" not in {finding["code"] for finding in run.quality_findings}
        assert run.request_count == (3 if all_outside else 4)
    assert len(radar.calls) == (3 if all_outside else 4)
    assert all(EXCLUDED_ID not in call["prompt"].user for call in radar.calls[1:])


def test_persisted_rejection_survives_retry_and_digest_date_edits(client, db_session_factory):
    radar = DateFilteringClient(fail_stage=DigestRunStageType.PAPER_SUMMARIES)
    headers, digest, run_id = queue(client, radar)
    _execute_next(db_session_factory, radar)
    with db_session_factory() as db:
        run = DigestRunRepository(db).get(run_id)
        assert run.status == DigestRunStatus.FAILED
        checkpoint = next(s for s in run.stages if s.stage == DigestRunStageType.DISCOVERY_RELEVANCE).result_data
        db.get(Digest, UUID(digest["id"])).reporting_from = date.today() - timedelta(days=100)
        db.commit()
    radar.fail_stage = None
    response = client.post(f"/api/v1/digests/{digest['id']}/runs/{run_id}/retry", headers=headers)
    assert response.status_code == 202
    _execute_next(db_session_factory, radar)
    with db_session_factory() as db:
        run = DigestRunRepository(db).get(run_id)
        assert run.status == DigestRunStatus.COMPLETED, run.error_message
        assert next(s for s in run.stages if s.stage == DigestRunStageType.DISCOVERY_RELEVANCE).result_data == checkpoint
        assert next(p for p in run.paper_results if p.paper.external_id == EXCLUDED_ID).summary_data is None
    assert sum(call["response_format"] is DiscoveryRelevanceOutput for call in radar.calls) == 1


@pytest.mark.parametrize("stage", [DigestRunStageType.TREND_ANALYSIS, DigestRunStageType.DIGEST_BRIEFING])
def test_persisted_rejected_candidate_cannot_be_cited_by_later_stages(client, db_session_factory, stage):
    radar = DateFilteringClient(leak_stage=stage)
    _, _, run_id = queue(client, radar)
    _execute_next(db_session_factory, radar)
    with db_session_factory() as db:
        run = DigestRunRepository(db).get(run_id)
        assert run.status == DigestRunStatus.FAILED
        assert f"referenced unknown papers: {EXCLUDED_ID}" in run.error_message
        failed = next(s for s in run.stages if s.stage == stage)
        assert failed.active_response_id is None
