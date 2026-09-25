"""Execution checkpoints and terminal transactions.

Stage output and accepted usage commit together. Terminal quota settlement and
status changes commit together. Callbacks independently commit provider evidence.
"""

import logging
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.digest_run import (
    DigestRun,
    DigestRunStage,
    DigestRunStageType,
    DigestRunStatus,
)
from app.radar.client import RadarClientError, RadarClientResult
from app.radar.contracts import (
    DigestBriefingOutput,
    DiscoveryRelevanceOutput,
    PaperSummariesOutput,
    TrendAnalysisOutput,
)
from app.radar.errors import RadarOutputValidationError
from app.radar.lease import RunLease
from app.repositories.digest_run_repository import DigestRunRepository
from app.repositories.radar_request_repository import RadarRequestRepository
from app.repositories.run_result_repository import RunResultRepository
from app.repositories.run_state_repository import RunStateRepository
from app.services import subscription_access_service as access
from app.services import subscription_observation_service as observation
from app.services.research_quality_service import assess_run
from app.services.source_verification_service import verify_automatically

logger = logging.getLogger(__name__)


class RunLifecycle:
    def __init__(self, db: Session, *, worker_id: str | None = None, lease_seconds: int = 60) -> None:
        self.db = db
        self.worker_id = worker_id
        self.runs = DigestRunRepository(db)
        self.state = RunStateRepository(db)
        self.results = RunResultRepository(db)
        self.requests = RadarRequestRepository(db)
        self.lease = RunLease(db, worker_id=worker_id, lease_seconds=lease_seconds)

    def running(self, run_id: UUID) -> DigestRun | None:
        run = self.runs.get(run_id)
        return run if run and run.status == DigestRunStatus.RUNNING else None

    def begin_stage(self, *, stage: DigestRunStage, progress_total: int = 1) -> None:
        self.state.mark_stage_running(stage=stage, progress_total=progress_total)
        self.db.commit()

    def begin_summaries(
        self,
        *,
        stage: DigestRunStage,
        existing: list[dict[str, Any]],
        progress_total: int,
    ) -> None:
        self.state.mark_stage_running(stage=stage, progress_total=progress_total)
        stage.result_data = {"paper_summaries": existing}
        stage.progress_current = len(existing)
        self.db.commit()

    def mark_failed(
        self, *, run: DigestRun, stage: DigestRunStage, message: str
    ) -> None:
        at = datetime.now(timezone.utc)
        self.state.fail_stage(stage=stage, message=message, at=at)
        access.settle(self.db, run, success=False)
        observation.settle(self.db, run, success=False)
        self.state.fail_run(run=run, message=message, at=at)

    def complete_run(self, run_id: UUID) -> None:
        run = self.reload(run_id)
        self.lease.poll(run)
        sources = verify_automatically(self.db, run)
        run = self.reload(run_id)
        # Fence completion again after bounded external metadata requests.
        self.lease.renew(run)
        assess_run(run, sources.findings if sources else None)
        access.settle(self.db, run, success=True)
        observation.settle(self.db, run, success=True)
        self.state.mark_completed(run=run)
        self.db.commit()

    def fail(
        self, *, run_id: UUID, active_stage: DigestRunStageType | None, error: Exception
    ) -> None:
        self.db.rollback()
        failed_run = self.runs.get(run_id)
        if failed_run is None or active_stage is None:
            return
        if self.worker_id is not None and failed_run.worker_id != self.worker_id:
            logger.warning(
                "Worker %s no longer owns radar run %s; leaving recovery to its current worker",
                self.worker_id,
                run_id,
            )
            return
        failed_stage = self.stage(failed_run, active_stage)
        self.requests.reject_latest(run_id=run_id, stage_id=failed_stage.id)
        if isinstance(error, RadarOutputValidationError):
            self.state.clear_active_response(stage=failed_stage)
        message = f"{active_stage.value.replace('_', ' ').capitalize()} failed: {error}"
        self.mark_failed(run=failed_run, stage=failed_stage, message=message)
        self.db.commit()

    def save_discovery_relevance(
        self,
        *,
        run: DigestRun,
        stage: DigestRunStage,
        result: RadarClientResult[DiscoveryRelevanceOutput],
    ) -> None:
        self.results.save_discovery_relevance(run=run, stage=stage, result=result)
        self.db.commit()

    def save_summary_batch(
        self,
        *,
        run: DigestRun,
        stage: DigestRunStage,
        result: RadarClientResult[PaperSummariesOutput],
        progress_total: int,
    ) -> None:
        self.results.save_summary_batch(
            run=run, stage=stage, result=result, progress_total=progress_total
        )
        self.db.commit()

    def complete_summary_stage(
        self,
        *,
        stage: DigestRunStage,
        progress_total: int,
    ) -> None:
        self.results.complete_summary_stage(stage=stage, progress_total=progress_total)
        self.db.commit()

    def save_trend_analysis(
        self,
        *,
        run: DigestRun,
        stage: DigestRunStage,
        result: RadarClientResult[TrendAnalysisOutput],
    ) -> None:
        self.results.save_trend_analysis(run=run, stage=stage, result=result)
        self.db.commit()

    def save_digest_briefing(
        self,
        *,
        run: DigestRun,
        stage: DigestRunStage,
        result: RadarClientResult[DigestBriefingOutput],
    ) -> None:
        self.results.save_digest_briefing(run=run, stage=stage, result=result)
        self.db.commit()

    def reload(self, run_id: UUID) -> DigestRun:
        self.db.expire_all()
        run = self.runs.get(run_id)
        if run is None:
            raise RadarClientError("The radar run could not be reloaded")
        return run

    @staticmethod
    def stage(run: DigestRun, stage_type: DigestRunStageType) -> DigestRunStage:
        for stage in run.stages:
            if stage.stage == stage_type:
                return stage
        raise RadarClientError(f"Missing persisted stage: {stage_type.value}")
