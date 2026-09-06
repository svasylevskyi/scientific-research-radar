from uuid import UUID

from sqlalchemy.orm import Session

from app.models.digest_run import DigestRun, DigestRunStageStatus
from app.models.user import User
from app.repositories.digest_repository import DigestRepository
from app.repositories.digest_run_repository import DigestRunRepository


class DigestRunNotFoundError(ValueError):
    pass


class DigestRunHistoryService:
    def __init__(self, db: Session) -> None:
        self.digests = DigestRepository(db)
        self.runs = DigestRunRepository(db)

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

    def _require_digest(self, *, owner: User, digest_id: UUID) -> None:
        if self.digests.get_for_owner(digest_id=digest_id, owner_id=owner.id) is None:
            raise DigestRunNotFoundError("Digest not found")


def fail_interrupted_development_runs(db: Session) -> int:
    repository = DigestRunRepository(db)
    interrupted = repository.list_running()
    for run in interrupted:
        stage = next(
            (
                item
                for item in run.stages
                if item.status == DigestRunStageStatus.RUNNING
            ),
            next(
                (
                    item
                    for item in run.stages
                    if item.status == DigestRunStageStatus.PENDING
                ),
                None,
            ),
        )
        if stage is not None:
            repository.mark_failed(
                run=run,
                stage=stage,
                message=(
                    "Radar execution was interrupted by an API restart. "
                    "Completed stages remain available; start a new run when ready."
                ),
            )
        else:
            repository.mark_completed(run=run)
    if interrupted:
        db.commit()
    return len(interrupted)
