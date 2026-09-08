from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError

from app.models.digest import Digest
from app.models.digest_email_delivery import DigestEmailDelivery
from app.models.user import User
from app.radar.client import build_radar_client
from app.radar.prompt_builder import RadarPromptBuilder
from app.radar.runner import RadarRunner, RadarRunAlreadyActiveError
from app.schemas.digest_schedule import DigestSchedule
from app.scheduler.recurrence import around, utc
from app.services.rate_limit_service import RateLimitExceeded


class ScheduleDispatcher:
    def __init__(self, settings, session_factory, client=None):
        self.settings = settings
        self.sessions = session_factory
        self.client = client or build_radar_client(settings)

    def tick(self, now=None):
        now = utc(now or datetime.now(timezone.utc))
        with self.sessions() as db:
            ids = list(db.scalars(select(Digest.id).join(User, Digest.owner_id == User.id).where(
                Digest.schedule_next_at <= now, User.is_active.is_(True)
            ).order_by(Digest.schedule_next_at, Digest.id).limit(100)))
        queued = 0
        for digest_id in ids:
            with self.sessions() as db:
                digest = db.get(Digest, digest_id)
                if not digest or not digest.schedule or not digest.schedule_next_at or utc(digest.schedule_next_at) > now:
                    continue
                schedule = DigestSchedule.model_validate(digest.schedule)
                due, following = around(schedule, now)
                # Compare-and-swap serializes dispatch against other dispatchers and schedule edits.
                claimed = db.execute(update(Digest).where(
                    Digest.id == digest_id, Digest.schedule_next_at == digest.schedule_next_at
                ).values(schedule_next_at=following), execution_options={"synchronize_session": False})
                if claimed.rowcount != 1:
                    db.rollback()
                    continue
                # Reload after taking the row lock: an edit may have committed while we were waiting.
                db.refresh(digest)
                schedule = DigestSchedule.model_validate(digest.schedule)
                due, following = around(schedule, now)
                digest.schedule_next_at = following
                owner = db.get(User, digest.owner_id)
                if not owner or not owner.is_active:
                    db.rollback()
                    continue
                if due is None:
                    db.commit()
                    continue
                try:
                    run = RadarRunner(db, settings=self.settings, client=self.client, prompt_builder=RadarPromptBuilder(),
                        history_limit=self.settings.radar_history_runs,
                        summary_batch_size=self.settings.openai_radar_summary_batch_size,
                        reasoning_efforts={}).start_digest(
                            digest_id=digest_id, owner_id=digest.owner_id,
                            scheduled_for=due, time_zone=schedule.time_zone, commit=False)
                    if schedule.send_email:
                        db.add(DigestEmailDelivery(run_id=run.id, next_attempt_at=now))
                    db.commit()
                    queued += 1
                except (RadarRunAlreadyActiveError, RateLimitExceeded, IntegrityError):
                    # Keep the occurrence due until this user's other run finishes.
                    db.rollback()
        return queued
