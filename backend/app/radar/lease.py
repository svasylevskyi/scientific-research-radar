"""Worker ownership fencing and liveness at provider callback boundaries."""

from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.models.digest_run import DigestRun
from app.ops import heartbeat
from app.radar.client import RadarClientError
from app.repositories.run_state_repository import RunStateRepository


class RunLease:
    def __init__(
        self, db: Session, *, worker_id: str | None, lease_seconds: int
    ) -> None:
        self.db = db
        self.worker_id = worker_id
        self.lease_seconds = lease_seconds
        self.state = RunStateRepository(db)

    def poll(self, run: DigestRun) -> None:
        self.renew(run)
        self.db.commit()

    def renew(self, run: DigestRun) -> None:
        heartbeat()
        if self.worker_id is not None:
            renewed = self.state.renew_lease(
                run_id=run.id,
                worker_id=self.worker_id,
                lease_expires_at=datetime.now(timezone.utc)
                + timedelta(seconds=self.lease_seconds),
            )
            if not renewed:
                self.db.rollback()
                raise RadarClientError(
                    "This worker lost its radar run lease; another worker may resume it"
                )
