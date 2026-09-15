"""Explicit discovery → summaries → trends → briefing orchestration.

Each stage resumes a saved checkpoint or constructs input, executes a request,
validates the output, then persists it. Quality gates can extend validation
without acquiring responsibility for retries, accounting, or quota settlement.
"""

import logging
from datetime import datetime
from uuid import UUID

from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.models.digest_run import DigestRun, DigestRunStageStatus, DigestRunStageType
from app.radar import stage_inputs, validation
from app.radar.client import RadarClient
from app.radar.contracts import (
    DigestBriefingOutput,
    DiscoveryRelevanceOutput,
    PaperSummariesOutput,
    TrendAnalysisOutput,
)
from app.radar.errors import (
    RadarDigestNotFoundError as RadarDigestNotFoundError,
)
from app.radar.errors import (
    RadarOutputValidationError as RadarOutputValidationError,
)
from app.radar.errors import (
    RadarRunAlreadyActiveError as RadarRunAlreadyActiveError,
)
from app.radar.errors import (
    RadarRunNotRetryableError as RadarRunNotRetryableError,
)
from app.radar.lease import RunLease
from app.radar.lifecycle import RunLifecycle
from app.radar.prompt_builder import RadarPromptBuilder
from app.radar.request_execution import StageRequestExecutor
from app.radar.submission import RunSubmission

logger = logging.getLogger(__name__)


class RadarRunner:
    def __init__(
        self,
        db: Session,
        *,
        client: RadarClient,
        prompt_builder: RadarPromptBuilder,
        history_limit: int,
        summary_batch_size: int,
        reasoning_efforts: dict[DigestRunStageType, str],
        worker_id: str | None = None,
        lease_seconds: int = 60,
        settings: Settings | None = None,
    ) -> None:
        settings = settings or get_settings()
        self.prompt_builder = prompt_builder
        self.summary_batch_size = summary_batch_size
        self.reasoning_efforts = reasoning_efforts
        self.lifecycle = RunLifecycle(db, worker_id=worker_id)
        self.requests = StageRequestExecutor(
            db,
            client=client,
            lease=RunLease(db, worker_id=worker_id, lease_seconds=lease_seconds),
        )
        self.submission = RunSubmission(
            db,
            settings=settings,
            prompt_builder=prompt_builder,
            model_name=client.model_name,
            history_limit=history_limit,
        )

    def start_digest(
        self,
        *,
        digest_id: UUID,
        owner_id: UUID,
        scheduled_for: datetime | None = None,
        time_zone: str = "UTC",
        commit: bool = True,
    ) -> DigestRun:
        return self.submission.start_digest(
            digest_id=digest_id,
            owner_id=owner_id,
            scheduled_for=scheduled_for,
            time_zone=time_zone,
            commit=commit,
        )

    def retry_digest(
        self, *, digest_id: UUID, run_id: UUID, owner_id: UUID
    ) -> DigestRun:
        return self.submission.retry_digest(
            digest_id=digest_id, run_id=run_id, owner_id=owner_id
        )

    def execute_run(self, *, run_id: UUID) -> None:
        run = self.lifecycle.running(run_id)
        if run is None:
            return

        active_stage: DigestRunStageType | None = None
        try:
            active_stage = DigestRunStageType.DISCOVERY_RELEVANCE
            discovery = self._execute_discovery(run)

            active_stage = DigestRunStageType.PAPER_SUMMARIES
            summaries = self._execute_summaries(run_id=run_id, discovery=discovery)

            active_stage = DigestRunStageType.TREND_ANALYSIS
            trend = self._execute_trends(
                run_id=run_id,
                discovery=discovery,
                summaries=summaries,
            )

            active_stage = DigestRunStageType.DIGEST_BRIEFING
            self._execute_briefing(
                run_id=run_id,
                discovery=discovery,
                summaries=summaries,
                trend=trend,
            )

            self.lifecycle.complete_run(run_id)
        except Exception as exc:
            logger.exception("Radar run %s failed during %s", run_id, active_stage)
            self.lifecycle.fail(run_id=run_id, active_stage=active_stage, error=exc)

    def _execute_discovery(self, run: DigestRun) -> DiscoveryRelevanceOutput:
        stage = self.lifecycle.stage(run, DigestRunStageType.DISCOVERY_RELEVANCE)
        if stage.status == DigestRunStageStatus.COMPLETED and stage.result_data:
            return DiscoveryRelevanceOutput.model_validate(stage.result_data)

        self.lifecycle.begin_stage(stage=stage)
        prompt = self.prompt_builder.build_discovery_relevance(
            digest_snapshot=run.digest_snapshot,
            history_context=run.history_context,
            feedback_context=run.feedback_context,
        )
        result = self.requests.execute(
            run=run,
            stage=stage,
            prompt=prompt,
            response_format=DiscoveryRelevanceOutput,
            use_web_search=True,
            reasoning_effort=self.reasoning_efforts[stage.stage],
        )
        validation.validate_discovery(
            output=result.output,
            maximum_papers=int(run.digest_snapshot["maximum_papers"]),
        )
        self.lifecycle.save_discovery_relevance(run=run, stage=stage, result=result)
        return result.output

    def _execute_summaries(
        self,
        *,
        run_id: UUID,
        discovery: DiscoveryRelevanceOutput,
    ) -> PaperSummariesOutput:
        run = self.lifecycle.reload(run_id)
        stage = self.lifecycle.stage(run, DigestRunStageType.PAPER_SUMMARIES)
        if stage.status == DigestRunStageStatus.COMPLETED and stage.result_data:
            return PaperSummariesOutput.model_validate(stage.result_data)

        papers = stage_inputs.summary_input(discovery)
        existing = list((stage.result_data or {}).get("paper_summaries", []))
        completed_ids = {item["external_id"] for item in existing}
        remaining = [
            paper for paper in papers if paper["external_id"] not in completed_ids
        ]
        self.lifecycle.begin_summaries(
            stage=stage, existing=existing, progress_total=len(papers)
        )

        for start in range(0, len(remaining), self.summary_batch_size):
            batch = remaining[start : start + self.summary_batch_size]
            prompt = self.prompt_builder.build_paper_summaries(
                digest_snapshot=run.digest_snapshot,
                feedback_context=run.feedback_context,
                papers=batch,
            )
            result = self.requests.execute(
                run=run,
                stage=stage,
                prompt=prompt,
                response_format=PaperSummariesOutput,
                use_web_search=False,
                reasoning_effort=self.reasoning_efforts[stage.stage],
            )
            validation.validate_summaries(
                output=result.output,
                expected_ids={paper["external_id"] for paper in batch},
            )
            self.lifecycle.save_summary_batch(
                run=run,
                stage=stage,
                result=result,
                progress_total=len(papers),
            )

        self.lifecycle.complete_summary_stage(stage=stage, progress_total=len(papers))
        return PaperSummariesOutput.model_validate(stage.result_data)

    def _execute_trends(
        self,
        *,
        run_id: UUID,
        discovery: DiscoveryRelevanceOutput,
        summaries: PaperSummariesOutput,
    ) -> TrendAnalysisOutput:
        run = self.lifecycle.reload(run_id)
        stage = self.lifecycle.stage(run, DigestRunStageType.TREND_ANALYSIS)
        if stage.status == DigestRunStageStatus.COMPLETED and stage.result_data:
            return TrendAnalysisOutput.model_validate(stage.result_data)

        self.lifecycle.begin_stage(stage=stage)
        prompt = self.prompt_builder.build_trend_analysis(
            digest_snapshot=run.digest_snapshot,
            history_context=run.history_context,
            feedback_context=run.feedback_context,
            papers=stage_inputs.trend_input(discovery, summaries),
        )
        result = self.requests.execute(
            run=run,
            stage=stage,
            prompt=prompt,
            response_format=TrendAnalysisOutput,
            use_web_search=False,
            reasoning_effort=self.reasoning_efforts[stage.stage],
        )
        validation.validate_trends(
            output=result.output,
            known_ids={paper.external_id for paper in discovery.search.papers},
        )
        self.lifecycle.save_trend_analysis(run=run, stage=stage, result=result)
        return result.output

    def _execute_briefing(
        self,
        *,
        run_id: UUID,
        discovery: DiscoveryRelevanceOutput,
        summaries: PaperSummariesOutput,
        trend: TrendAnalysisOutput,
    ) -> DigestBriefingOutput:
        run = self.lifecycle.reload(run_id)
        stage = self.lifecycle.stage(run, DigestRunStageType.DIGEST_BRIEFING)
        if stage.status == DigestRunStageStatus.COMPLETED and stage.result_data:
            return DigestBriefingOutput.model_validate(stage.result_data)

        self.lifecycle.begin_stage(stage=stage)
        prompt = self.prompt_builder.build_digest_briefing(
            digest_snapshot=run.digest_snapshot,
            feedback_context=run.feedback_context,
            papers=stage_inputs.briefing_input(discovery, summaries),
            trend_analysis=trend.trend_analysis.model_dump(mode="json"),
        )
        result = self.requests.execute(
            run=run,
            stage=stage,
            prompt=prompt,
            response_format=DigestBriefingOutput,
            use_web_search=False,
            reasoning_effort=self.reasoning_efforts[stage.stage],
        )
        validation.validate_briefing(
            output=result.output,
            known_ids={paper.external_id for paper in discovery.search.papers},
        )
        self.lifecycle.save_digest_briefing(run=run, stage=stage, result=result)
        return result.output
