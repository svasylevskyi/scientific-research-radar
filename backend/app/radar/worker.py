import logging
import os
import socket
import time
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from sqlalchemy.orm import Session, sessionmaker

from app.core.config import Settings, get_settings
from app.db.session import SessionLocal
from app.models.digest_run import DigestRunStageType
from app.radar.client import build_radar_client
from app.radar.prompt_builder import RadarPromptBuilder
from app.radar.runner import RadarRunner
from app.repositories.digest_run_repository import DigestRunRepository

logger = logging.getLogger(__name__)


class RadarWorker:
    def __init__(
        self,
        settings: Settings,
        *,
        worker_id: str | None = None,
        session_factory: sessionmaker[Session] = SessionLocal,
    ) -> None:
        self.settings = settings
        self.worker_id = worker_id or (
            f"{socket.gethostname()}:{os.getpid()}:{uuid4().hex[:8]}"
        )
        self.client = build_radar_client(settings)
        self.session_factory = session_factory

    def run_once(self) -> bool:
        with self.session_factory() as db:
            repository = DigestRunRepository(db)
            run = repository.claim_next(
                worker_id=self.worker_id,
                lease_expires_at=datetime.now(timezone.utc)
                + timedelta(seconds=self.settings.radar_worker_lease_seconds),
            )
            if run is None:
                return False
            logger.info("Worker %s claimed radar run %s", self.worker_id, run.id)
            RadarRunner(
                db,
                client=self.client,
                prompt_builder=RadarPromptBuilder(),
                history_limit=self.settings.radar_history_runs,
                summary_batch_size=self.settings.openai_radar_summary_batch_size,
                reasoning_efforts={
                    DigestRunStageType.DISCOVERY_RELEVANCE: self.settings.openai_radar_discovery_reasoning_effort,
                    DigestRunStageType.PAPER_SUMMARIES: self.settings.openai_radar_summary_reasoning_effort,
                    DigestRunStageType.TREND_ANALYSIS: self.settings.openai_radar_trend_reasoning_effort,
                    DigestRunStageType.DIGEST_BRIEFING: self.settings.openai_radar_briefing_reasoning_effort,
                },
                worker_id=self.worker_id,
                lease_seconds=self.settings.radar_worker_lease_seconds,
            ).execute_run(run_id=run.id)
            return True

    def run_forever(self) -> None:
        logger.info("Radar worker %s started", self.worker_id)
        while True:
            if not self.run_once():
                time.sleep(self.settings.radar_worker_poll_interval_seconds)


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    RadarWorker(get_settings()).run_forever()


if __name__ == "__main__":
    main()
