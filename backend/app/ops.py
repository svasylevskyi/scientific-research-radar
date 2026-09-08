"""Container probes and read-only deployment checks; never enqueue work or send mail."""
import os
from pathlib import Path
import sys
import time


def heartbeat() -> None:
    path = os.environ.get("RADAR_HEARTBEAT_FILE")
    if path:
        Path(path).touch()


def main() -> None:
    command = sys.argv[1]
    if command == "worker-health":
        age = time.time() - Path(os.environ["RADAR_HEARTBEAT_FILE"]).stat().st_mtime
        from app.core.config import get_settings
        settings = get_settings()
        maximum_age = max(150, settings.openai_request_timeout_seconds + 30,
                          settings.scheduler_poll_seconds + settings.smtp_timeout_seconds + 30)
        if age > maximum_age:
            raise SystemExit("Worker heartbeat is stale")
        return

    from sqlalchemy import text
    from app.db.session import engine
    if command == "ready":
        from urllib.request import urlopen
        with urlopen("http://127.0.0.1:8000/health", timeout=3) as response:
            if response.status != 200:
                raise SystemExit(1)
        with engine.connect() as db:
            db.execute(text("SELECT 1 FROM alembic_version")).all()
    elif command == "active":
        with engine.connect() as db:
            print(db.scalar(text("SELECT count(*) FROM digest_runs WHERE status IN ('queued', 'running')")))
    else:
        raise SystemExit("Unknown operational command")


if __name__ == "__main__":
    main()
