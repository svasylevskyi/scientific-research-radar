"""Queue, stage, and lease state. Quota settlement belongs to lifecycle orchestration."""

from datetime import datetime, timezone
from typing import Any, cast
from uuid import UUID, uuid4

from sqlalchemy import or_, select, update
from sqlalchemy.engine import CursorResult
from sqlalchemy.orm import Session

from app.models.digest_run import (
    RADAR_STAGE_ORDER,
    DigestRun,
    DigestRunStage,
    DigestRunStageStatus,
    DigestRunStageType,
    DigestRunStatus,
    DigestRunTrigger,
)
from app.radar.client import RadarTokenUsage
from app.repositories.digest_run_repository import DigestRunRepository


class RunStateRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def create_running(
        self,
        *,
        digest_id: UUID,
        owner_id: UUID,
        digest_snapshot: dict[str, Any],
        history_context: list[dict[str, Any]],
        feedback_context: list[dict[str, Any]],
        model_name: str,
        prompt_version: str,
    ) -> DigestRun:
        run = DigestRun(
            id=uuid4(),
            digest_id=digest_id,
            owner_id=owner_id,
            status=DigestRunStatus.QUEUED,
            trigger=DigestRunTrigger.MANUAL,
            digest_snapshot=digest_snapshot,
            history_context=history_context,
            feedback_context=feedback_context,
            model_name=model_name,
            prompt_version=prompt_version,
            started_at=datetime.now(timezone.utc),
        )
        run.stages = [
            DigestRunStage(
                id=uuid4(),
                stage=stage_type,
                position=position,
                status=DigestRunStageStatus.PENDING,
                progress_current=0,
                progress_total=1,
                response_ids=[],
                usage_data=self._empty_usage(),
                model_name=model_name,
                prompt_version=prompt_version,
            )
            for position, stage_type in enumerate(RADAR_STAGE_ORDER, start=1)
        ]
        self.db.add(run)
        self.db.flush()
        return run

    def mark_stage_running(
        self,
        *,
        stage: DigestRunStage,
        progress_total: int = 1,
    ) -> None:
        stage.status = DigestRunStageStatus.RUNNING
        stage.progress_current = 0
        stage.progress_total = progress_total
        stage.error_message = None
        stage.started_at = datetime.now(timezone.utc)
        stage.completed_at = None

    def clear_active_response(self, *, stage: DigestRunStage) -> None:
        stage.active_response_id = None

    def mark_completed(self, *, run: DigestRun) -> None:
        run.status = DigestRunStatus.COMPLETED
        run.error_message = None
        run.completed_at = datetime.now(timezone.utc)
        run.worker_id = None
        run.lease_expires_at = None

    def fail_stage(self, *, stage: DigestRunStage, message: str, at: datetime) -> None:
        stage.status = DigestRunStageStatus.FAILED
        stage.error_message = message[:2000]
        stage.completed_at = at

    def fail_run(self, *, run: DigestRun, message: str, at: datetime) -> None:
        run.status = DigestRunStatus.FAILED
        run.error_message = message[:2000]
        run.completed_at = at
        run.worker_id = None
        run.lease_expires_at = None

    def claim_next(
        self, *, worker_id: str, lease_expires_at: datetime
    ) -> DigestRun | None:
        now = datetime.now(timezone.utc)
        candidate = self.db.scalar(
            select(DigestRun.id)
            .where(
                DigestRun.status.in_((DigestRunStatus.QUEUED, DigestRunStatus.RUNNING)),
                or_(
                    DigestRun.lease_expires_at.is_(None),
                    DigestRun.lease_expires_at < now,
                ),
            )
            .order_by(DigestRun.started_at, DigestRun.id)
            .limit(1)
        )
        if candidate is None:
            return None
        claimed = self.db.execute(
            update(DigestRun)
            .where(
                DigestRun.id == candidate,
                DigestRun.status.in_((DigestRunStatus.QUEUED, DigestRunStatus.RUNNING)),
                or_(
                    DigestRun.lease_expires_at.is_(None),
                    DigestRun.lease_expires_at < now,
                ),
            )
            .values(
                status=DigestRunStatus.RUNNING,
                worker_id=worker_id,
                lease_expires_at=lease_expires_at,
            )
        )
        self.db.commit()
        return (
            DigestRunRepository(self.db).get(candidate)
            if cast(CursorResult[Any], claimed).rowcount == 1
            else None
        )

    def renew_lease(
        self, *, run_id: UUID, worker_id: str, lease_expires_at: datetime
    ) -> bool:
        result = self.db.execute(
            update(DigestRun)
            .where(
                DigestRun.id == run_id,
                DigestRun.worker_id == worker_id,
                DigestRun.status == DigestRunStatus.RUNNING,
            )
            .values(lease_expires_at=lease_expires_at)
            .execution_options(synchronize_session=False)
        )
        return cast(CursorResult[Any], result).rowcount == 1

    def requeue_failed(self, *, run: DigestRun) -> None:
        failed = next(
            (
                stage
                for stage in run.stages
                if stage.status == DigestRunStageStatus.FAILED
            ),
            None,
        )
        if failed is None:
            raise ValueError("This run has no failed stage to retry")
        # Older releases retained completed responses rejected by runner validation.
        # Recover these existing failures on explicit retry without dropping live jobs
        # retained after polling timeouts or connection failures.
        rejected_prefixes = (
            "Discovery relevance failed: The discovery stage returned more papers",
            "Paper summaries failed: The summary stage must return exactly one summary",
            "Trend analysis failed: The trend analysis referenced unknown papers:",
            "Digest briefing failed: The digest briefing referenced unknown papers:",
        )
        legacy_discovery_mismatch = (
            failed.stage == DigestRunStageType.DISCOVERY_RELEVANCE
            and "validation error for DiscoveryRelevanceOutput"
            in (failed.error_message or "")
            and "Every searched paper must have one relevance assessment"
            in (failed.error_message or "")
        )
        if legacy_discovery_mismatch or (failed.error_message or "").startswith(
            rejected_prefixes
        ):
            self.clear_active_response(stage=failed)
        failed.status = DigestRunStageStatus.PENDING
        failed.error_message = None
        failed.completed_at = None
        run.status = DigestRunStatus.QUEUED
        run.error_message = None
        run.completed_at = None
        run.worker_id = None
        run.lease_expires_at = None

    @staticmethod
    def _empty_usage() -> dict[str, int]:
        return RadarTokenUsage().as_dict()

    def claim_failed_retry(self, *, run_id: UUID) -> bool:
        claimed = self.db.execute(
            update(DigestRun)
            .where(DigestRun.id == run_id, DigestRun.status == DigestRunStatus.FAILED)
            .values(status=DigestRunStatus.QUEUED),
            execution_options={"synchronize_session": False},
        )
        return cast(CursorResult[Any], claimed).rowcount == 1
