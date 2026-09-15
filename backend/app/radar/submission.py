"""Atomic run admission and retry, separate from provider execution."""

from datetime import datetime
from uuid import UUID

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.models.digest_run import (
    DigestRun,
    DigestRunStatus,
    DigestRunTrigger,
)
from app.radar import stage_inputs
from app.radar.errors import (
    RadarDigestNotFoundError,
    RadarRunAlreadyActiveError,
    RadarRunNotRetryableError,
)
from app.radar.prompt_builder import RadarPromptBuilder
from app.repositories.digest_repository import DigestRepository
from app.repositories.digest_run_repository import DigestRunRepository
from app.repositories.run_state_repository import RunStateRepository
from app.services import subscription_access_service as access
from app.services import subscription_observation_service as observation
from app.services.rate_limit_service import enforce


class RunSubmission:
    def __init__(
        self,
        db: Session,
        *,
        settings: Settings,
        prompt_builder: RadarPromptBuilder,
        model_name: str,
        history_limit: int,
    ) -> None:
        self.db = db
        self.settings = settings
        self.prompt_builder = prompt_builder
        self.model_name = model_name
        self.history_limit = history_limit
        self.digests = DigestRepository(db)
        self.runs = DigestRunRepository(db)
        self.state = RunStateRepository(db)

    def start_digest(
        self,
        *,
        digest_id: UUID,
        owner_id: UUID,
        scheduled_for: datetime | None = None,
        time_zone: str = "UTC",
        commit: bool = True,
    ) -> DigestRun:
        digest = self.digests.get_for_owner(digest_id=digest_id, owner_id=owner_id)
        if digest is None:
            raise RadarDigestNotFoundError("Digest not found")

        observation.lock(self.db, owner_id)
        self.db.refresh(digest)
        if self.runs.has_running_for_owner(owner_id=owner_id):
            raise RadarRunAlreadyActiveError(
                "Another digest run is already in progress for your account. "
                "Wait for it to finish before starting a new run."
            )

        self._reserve_run_budget(owner_id=owner_id)
        digest_snapshot = stage_inputs.digest_snapshot(
            digest=digest, scheduled_for=scheduled_for, time_zone=time_zone
        )
        history_context = self.runs.build_history_context(
            digest_id=digest.id, limit=self.history_limit
        )
        feedback_context = self.runs.build_feedback_context(digest_id=digest.id)
        first_prompt = self.prompt_builder.build_discovery_relevance(
            digest_snapshot=digest_snapshot,
            history_context=history_context,
            feedback_context=feedback_context,
        )
        run = self.state.create_running(
            digest_id=digest.id,
            owner_id=owner_id,
            digest_snapshot=digest_snapshot,
            history_context=history_context,
            feedback_context=feedback_context,
            model_name=self.model_name,
            prompt_version=first_prompt.version,
        )
        if scheduled_for is not None:
            run.trigger = DigestRunTrigger.SCHEDULED
            run.scheduled_for = scheduled_for

        access.reserve(
            self.db, run, schedule=run.digest.schedule, settings=self.settings
        )

        observation.reserve(self.db, run, schedule=digest.schedule)
        if not commit:
            return run
        try:
            self.db.commit()
        except IntegrityError as exc:
            self.db.rollback()
            if self.runs.has_running_for_owner(owner_id=owner_id):
                raise RadarRunAlreadyActiveError(
                    "Another digest run is already in progress for your account. "
                    "Wait for it to finish before starting a new run."
                ) from exc
            raise
        return self.runs.get(run.id) or run

    def retry_digest(
        self, *, digest_id: UUID, run_id: UUID, owner_id: UUID
    ) -> DigestRun:

        observation.lock(self.db, owner_id)
        run = self.runs.get_owned(digest_id=digest_id, run_id=run_id, owner_id=owner_id)
        if run is None:
            raise RadarDigestNotFoundError("Digest run not found")
        if run.status != DigestRunStatus.FAILED:
            raise RadarRunNotRetryableError("Only a failed radar run can be retried")
        if self.runs.has_running_for_owner(owner_id=owner_id):
            raise RadarRunAlreadyActiveError(
                "Another digest run is already in progress for your account. "
                "Wait for it to finish before retrying this run."
            )
        self._reserve_run_budget(owner_id=owner_id)
        if not self.state.claim_failed_retry(run_id=run.id):
            self.db.rollback()
            raise RadarRunNotRetryableError(
                "This run was already retried. Refresh its progress."
            )
        self.state.requeue_failed(run=run)

        access.reserve(
            self.db, run, schedule=run.digest.schedule, settings=self.settings
        )

        observation.reserve(self.db, run, schedule=run.digest.schedule)
        try:
            self.db.commit()
        except IntegrityError as exc:
            self.db.rollback()
            raise RadarRunAlreadyActiveError(
                "Another digest run is already in progress for your account."
            ) from exc
        return self.runs.get(run_id) or run

    def _reserve_run_budget(self, *, owner_id: UUID) -> None:
        # Count accepted starts/retries atomically with enqueue. Failed enqueue rolls back.
        enforce(
            self.db,
            self.settings,
            "radar-hour",
            str(owner_id),
            self.settings.radar_runs_per_hour,
            3600,
            commit=False,
        )
        enforce(
            self.db,
            self.settings,
            "radar-day",
            str(owner_id),
            self.settings.radar_runs_per_day,
            86400,
            commit=False,
        )
