"""Pure stage decisions and a durable partial-batch retry across new boundaries."""

import json
import re
from dataclasses import replace
from datetime import datetime, timedelta, timezone
from uuid import UUID

import pytest
from app.models.digest_run import DigestRunStageType, DigestRunStatus
from app.models.radar_request import RadarRequest
from app.radar import stage_inputs, validation
from app.radar.contracts import DiscoveryRelevanceOutput, PaperSummariesOutput
from app.radar.errors import RadarOutputValidationError
from app.repositories.digest_run_repository import DigestRunRepository
from app.repositories.run_state_repository import RunStateRepository
from sqlalchemy import select
from test_digest_runs import (
    RecordingRadarClient,
    _authorization,
    _create_digest,
    _override_runner,
    _register,
    _runner,
    _stage_output,
)


def two_papers():
    discovery = _stage_output(DiscoveryRelevanceOutput)
    original = discovery.search.papers[0]
    assessment = discovery.relevance.assessments[0]
    second_id = "doi:10.1234/second"
    return discovery.model_copy(
        update={
            "search": discovery.search.model_copy(
                update={
                    "papers": [
                        original,
                        original.model_copy(update={"external_id": second_id}),
                    ]
                }
            ),
            "relevance": discovery.relevance.model_copy(
                update={
                    "assessments": [
                        assessment,
                        assessment.model_copy(
                            update={
                                "external_id": second_id,
                                "recommended_status": "mention_briefly",
                            }
                        ),
                    ]
                }
            ),
        }
    )


def test_inputs_keep_discovery_order_and_exclude_unsummarized_papers():
    discovery = two_papers()
    before = discovery.model_dump(mode="json")
    selected = stage_inputs.summary_input(discovery)
    assert [item["external_id"] for item in selected] == [
        p.external_id for p in discovery.search.papers
    ]
    assert selected[1]["relevance"]["recommended_status"] == "mention_briefly"
    summaries = _stage_output(PaperSummariesOutput)
    assert len(stage_inputs.trend_input(discovery, summaries)) == 1
    briefing = stage_inputs.briefing_input(discovery, summaries)
    assert (
        briefing[0]["suggested_digest_bullet"]
        == summaries.paper_summaries[0].suggested_digest_bullet
    )
    assert discovery.model_dump(mode="json") == before


def test_discovery_limit_and_exact_summary_membership_remain_acceptance_rules():
    discovery = two_papers()
    validation.validate_discovery(output=discovery, maximum_papers=2)
    with pytest.raises(RadarOutputValidationError, match="more papers"):
        validation.validate_discovery(output=discovery, maximum_papers=1)
    summaries = _stage_output(PaperSummariesOutput)
    with pytest.raises(RadarOutputValidationError, match="exactly one summary"):
        validation.validate_summaries(
            output=summaries, expected_ids={"different-paper"}
        )
    with pytest.raises(RadarOutputValidationError, match="unknown papers: a, z"):
        validation.validate_references(
            referenced_ids={"z", "a"}, known_ids=set(), stage="trend analysis"
        )


class PartialBatchClient(RecordingRadarClient):
    failed_once = False
    batches = []

    def execute(self, prompt, **kwargs):
        if kwargs["response_format"] is PaperSummariesOutput:
            batch = json.loads(
                re.findall(r"```json\n(.*?)\n```", prompt.user, re.S)[-1]
            )
            ids = [p["external_id"] for p in batch]
            self.batches.append(ids)
            fail = ids == ["doi:10.1234/second"] and not self.failed_once
            self.fail_stage = DigestRunStageType.PAPER_SUMMARIES if fail else None
            if fail:
                self.failed_once = True
        result = super().execute(prompt, **kwargs)
        if kwargs["response_format"] is DiscoveryRelevanceOutput:
            return replace(result, output=two_papers())
        if kwargs["response_format"] is PaperSummariesOutput:
            output = result.output.model_copy(
                update={
                    "paper_summaries": [
                        result.output.paper_summaries[0].model_copy(
                            update={"external_id": ids[0]}
                        )
                    ]
                }
            )
            return replace(result, output=output)
        return result


def test_partial_summary_checkpoint_retries_only_missing_batch(
    client, db_session_factory
):
    radar = PartialBatchClient()
    radar.batches = []
    headers = _authorization(_register(client, "partial-batch@example.com", "Research"))
    digest = _create_digest(client, headers)
    _override_runner(radar)
    queued = client.post(f"/api/v1/digests/{digest['id']}/runs", headers=headers)
    assert queued.status_code == 202
    run_id = UUID(queued.json()["id"])

    def execute():
        with db_session_factory() as db:
            run = RunStateRepository(db).claim_next(
                worker_id="batch-worker",
                lease_expires_at=datetime.now(timezone.utc) + timedelta(minutes=1),
            )
            assert run.id == run_id
            runner = _runner(db, radar, worker_id="batch-worker")
            runner.summary_batch_size = 1
            runner.execute_run(run_id=run_id)

    execute()
    with db_session_factory() as db:
        run = DigestRunRepository(db).get(run_id)
        assert run.status == DigestRunStatus.FAILED
        summary_stage = next(
            s for s in run.stages if s.stage == DigestRunStageType.PAPER_SUMMARIES
        )
        assert summary_stage.progress_current == 1
        assert len(summary_stage.result_data["paper_summaries"]) == 1
    retried = client.post(
        f"/api/v1/digests/{digest['id']}/runs/{run_id}/retry", headers=headers
    )
    assert retried.status_code == 202
    execute()
    with db_session_factory() as db:
        run = DigestRunRepository(db).get(run_id)
        assert run.status == DigestRunStatus.COMPLETED
        summary_stage = next(
            s for s in run.stages if s.stage == DigestRunStageType.PAPER_SUMMARIES
        )
        assert summary_stage.progress_current == 2
        assert len(summary_stage.response_ids) == 2
        assert summary_stage.usage_data["input_tokens"] == 200
        requests = list(
            db.scalars(select(RadarRequest).where(RadarRequest.run_id == run_id))
        )
        assert len(requests) == 6
        assert sum(r.outcome == "accepted" for r in requests) == 5
        assert run.request_count == 5
    assert radar.batches == [
        [two_papers().search.papers[0].external_id],
        ["doi:10.1234/second"],
        ["doi:10.1234/second"],
    ]
