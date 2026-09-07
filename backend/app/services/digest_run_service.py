from uuid import UUID

from sqlalchemy.orm import Session

from app.models.digest_run import DigestRun, DigestRunStatus
from app.models.user import User
from app.repositories.digest_repository import DigestRepository
from app.repositories.digest_run_repository import DigestRunRepository
from app.services.digest_service import DigestService


class DigestRunNotFoundError(ValueError):
    pass


class DigestRunFeedbackUnavailableError(ValueError):
    pass


class DigestRunHistoryService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.digests = DigestRepository(db)
        self.runs = DigestRunRepository(db)
        self.digest_service = DigestService(db)

    def list_owned(
        self,
        *,
        owner: User,
        digest_id: UUID,
        offset: int,
        limit: int,
    ) -> tuple[list[DigestRun], int]:
        self._require_digest(owner=owner, digest_id=digest_id)
        return (
            self.runs.list_owned(
                digest_id=digest_id,
                owner_id=owner.id,
                offset=offset,
                limit=limit,
            ),
            self.runs.count_owned(digest_id=digest_id, owner_id=owner.id),
        )

    def get_owned(
        self, *, owner: User, digest_id: UUID, run_id: UUID
    ) -> DigestRun:
        self._require_digest(owner=owner, digest_id=digest_id)
        run = self.runs.get_owned(
            digest_id=digest_id, run_id=run_id, owner_id=owner.id
        )
        if run is None:
            raise DigestRunNotFoundError("Digest run not found")
        return run

    def get_active(self, *, owner: User) -> DigestRun | None:
        return self.runs.get_active_owned(owner_id=owner.id)

    def update_feedback(
        self,
        *,
        owner: User,
        digest_id: UUID,
        run_id: UUID,
        feedback_text: str,
    ) -> DigestRun:
        run = self.get_owned(owner=owner, digest_id=digest_id, run_id=run_id)
        if run.status != DigestRunStatus.COMPLETED:
            raise DigestRunFeedbackUnavailableError(
                "Feedback can only be provided for a completed radar run"
            )
        if not self.runs.save_feedback_if_latest(
            run=run, feedback_text=feedback_text
        ):
            self.db.rollback()
            raise DigestRunFeedbackUnavailableError(
                "Feedback can only be updated for the latest radar run"
            )
        self.db.commit()
        self.db.expire_all()
        return self.runs.get_owned(
            digest_id=digest_id, run_id=run_id, owner_id=owner.id
        ) or run

    def list_for_admin(
        self,
        *,
        actor: User,
        digest_id: UUID,
        offset: int,
        limit: int,
    ) -> tuple[list[DigestRun], int]:
        digest = self.digest_service.get_for_admin(actor=actor, digest_id=digest_id)
        return (
            self.runs.list_owned(
                digest_id=digest_id,
                owner_id=digest.owner_id,
                offset=offset,
                limit=limit,
            ),
            self.runs.count_owned(digest_id=digest_id, owner_id=digest.owner_id),
        )

    def get_for_admin(
        self, *, actor: User, digest_id: UUID, run_id: UUID
    ) -> DigestRun:
        digest = self.digest_service.get_for_admin(actor=actor, digest_id=digest_id)
        run = self.runs.get_owned(
            digest_id=digest_id, run_id=run_id, owner_id=digest.owner_id
        )
        if run is None:
            raise DigestRunNotFoundError("Digest run not found")
        return run

    def _require_digest(self, *, owner: User, digest_id: UUID) -> None:
        if self.digests.get_for_owner(digest_id=digest_id, owner_id=owner.id) is None:
            raise DigestRunNotFoundError("Digest not found")
