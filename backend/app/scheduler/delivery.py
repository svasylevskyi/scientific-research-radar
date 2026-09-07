import logging
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from sqlalchemy import and_, or_, select, update

from app.models.digest_email_delivery import DigestEmailDelivery as Delivery
from app.models.digest_run import DigestRun
from app.models.user import User
from app.repositories.digest_run_repository import DigestRunRepository
from app.services.briefing_email import briefing_email
from app.services.email_service import EmailService

logger = logging.getLogger(__name__)


class BriefingDeliveryWorker:
    def __init__(self, settings, session_factory, sender=None):
        self.settings = settings
        self.sessions = session_factory
        self.sender = sender or EmailService(settings)

    def run_once(self, now=None):
        now = now or datetime.now(timezone.utc)
        token = str(uuid4())
        eligible = or_(
            and_(Delivery.status == "pending", Delivery.next_attempt_at <= now),
            and_(Delivery.status == "sending", Delivery.claimed_until <= now),
        )
        with self.sessions() as db:
            db.execute(update(Delivery).where(
                Delivery.status == "sending", Delivery.claimed_until <= now, Delivery.attempts >= 5
            ).values(status="failed", claim_token=None, claimed_until=None,
                last_error="Email delivery could not be confirmed. Automatic retries exhausted."))
            db.commit()
            run_id = db.scalar(select(Delivery.run_id).join(DigestRun).where(
                eligible, DigestRun.status == "completed"
            ).order_by(Delivery.next_attempt_at, Delivery.run_id).limit(1))
            if not run_id:
                return False
            claim = db.execute(update(Delivery).where(Delivery.run_id == run_id, eligible).values(
                status="sending", claim_token=token, claimed_until=now + timedelta(minutes=5),
                attempts=Delivery.attempts + 1,
            ))
            if claim.rowcount != 1:
                db.rollback()
                return False
            db.commit()
        with self.sessions() as db:
            delivery = db.get(Delivery, run_id)
            run = DigestRunRepository(db).get(run_id)
            if not delivery or not run:
                return True
            owner = db.get(User, run.owner_id)
            if not owner or not owner.is_active:
                values = dict(status="cancelled", last_error="Account is inactive.")
            else:
                try:
                    self.sender.send(briefing_email(run, owner.email, self.settings.frontend_base_url))
                    values = dict(status="sent", sent_at=datetime.now(timezone.utc), last_error=None)
                except Exception:
                    logger.exception("Briefing email delivery failed for run %s", run_id)
                    terminal = delivery.attempts >= 5
                    values = dict(status="failed" if terminal else "pending",
                        last_error="Email could not be delivered." + (" Automatic retries exhausted." if terminal else " A retry is scheduled."),
                        next_attempt_at=now + timedelta(minutes=2 ** min(delivery.attempts, 6)))
            db.execute(update(Delivery).where(Delivery.run_id == run_id, Delivery.claim_token == token).values(
                **values, claim_token=None, claimed_until=None
            ))
            db.commit()
        return True
