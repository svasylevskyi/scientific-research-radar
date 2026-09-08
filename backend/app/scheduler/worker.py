"""Run separately from the API and radar worker: python -m app.scheduler.worker."""
import logging
import time
from urllib.parse import urlsplit

from app.ops import heartbeat
from app.core.config import get_settings
from app.db.session import SessionLocal
from app.scheduler.dispatch import ScheduleDispatcher
from app.scheduler.delivery import BriefingDeliveryWorker

logger = logging.getLogger(__name__)


def main():
    logging.basicConfig(level=logging.INFO)
    settings = get_settings()
    public_url = urlsplit(settings.frontend_base_url)
    if settings.environment == "production" and (
        public_url.scheme != "https" or public_url.hostname in ("localhost", "127.0.0.1", "::1")
    ):
        raise ValueError("Set FRONTEND_BASE_URL to the public HTTPS website URL before starting the scheduler in production")
    dispatcher = ScheduleDispatcher(settings, SessionLocal)
    delivery = BriefingDeliveryWorker(settings, SessionLocal)
    logger.info("Schedule dispatcher and briefing delivery started")
    while True:
        healthy = True
        try:
            dispatcher.tick()
        except Exception:
            healthy = False
            logger.exception("Schedule dispatch tick failed")
        try:
            # One delivery per tick keeps dispatch responsive when mail is slow.
            delivery.run_once()
        except Exception:
            healthy = False
            logger.exception("Briefing delivery tick failed")
        if healthy:
            heartbeat()
        time.sleep(settings.scheduler_poll_seconds)


if __name__ == "__main__":
    main()
