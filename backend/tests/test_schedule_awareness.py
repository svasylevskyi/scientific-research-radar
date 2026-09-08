from datetime import datetime, timedelta, timezone
from uuid import UUID

import pytest
from sqlalchemy import select

from app.core.config import Settings
from app.models.digest import Digest
from app.models.digest_run import DigestRun, DigestRunStatus
from app.scheduler.dispatch import ScheduleDispatcher
from test_scheduler_delivery import setup_schedule, NOW
from test_digest_runs import RecordingRadarClient, _execute_next


@pytest.mark.parametrize("fails", [False, True])
def test_last_scheduled_run_exhaustion_is_visible_before_cutoff(client, db_session_factory, fails):
    auth, digest = setup_schedule(client, ends_at=(NOW + timedelta(hours=1)).isoformat())
    fake = RecordingRadarClient(fail_stage="discovery_relevance") if fails else RecordingRadarClient()
    path = f"/api/v1/digests/{digest['id']}"
    assert client.get(path, headers=auth).json()["schedule_exhausted"] is False
    assert ScheduleDispatcher(Settings(), db_session_factory, fake).tick(NOW) == 1
    _execute_next(db_session_factory, fake)
    detail = client.get(path, headers=auth).json()
    assert detail["schedule_exhausted"] is True
    assert detail["schedule_next_at"] is None
    with db_session_factory() as db:
        run = db.scalar(select(DigestRun))
        assert run.status == (DigestRunStatus.FAILED if fails else DigestRunStatus.COMPLETED)
        assert "schedule_exhausted" not in run.digest_snapshot
    extended = client.put(path + "/schedule", headers=auth, json={**detail["schedule"], "ends_at": (NOW + timedelta(days=5)).isoformat()})
    assert extended.status_code == 200 and extended.json()["schedule_exhausted"] is False
    assert client.delete(path + "/schedule", headers=auth).status_code == 204
    assert client.get(path, headers=auth).json()["schedule_exhausted"] is False


def test_nonfinal_run_and_open_ended_schedule_remain_active(client, db_session_factory):
    auth, digest = setup_schedule(client)
    fake = RecordingRadarClient()
    assert ScheduleDispatcher(Settings(), db_session_factory, fake).tick(NOW) == 1
    _execute_next(db_session_factory, fake)
    detail = client.get(f"/api/v1/digests/{digest['id']}", headers=auth).json()
    assert detail["schedule_exhausted"] is False
    assert detail["schedule_next_at"] is not None


def test_expired_schedule_is_visible_even_if_dispatcher_has_not_cleaned_cursor(client, db_session_factory):
    auth, digest = setup_schedule(client)
    with db_session_factory() as db:
        saved = db.get(Digest, UUID(digest["id"]))
        now = datetime.now(timezone.utc)
        saved.schedule = {**saved.schedule, "starts_at": (now - timedelta(days=2)).isoformat(), "ends_at": (now - timedelta(days=1)).isoformat()}
        saved.schedule_next_at = now - timedelta(days=2)
        db.commit()
    detail = client.get(f"/api/v1/digests/{digest['id']}", headers=auth).json()
    assert detail["schedule_exhausted"] is True


def test_deferred_final_occurrence_is_not_exhausted(client, db_session_factory):
    auth, digest = setup_schedule(client, ends_at=(NOW + timedelta(hours=1)).isoformat())
    # A due cursor remains a pending occurrence, even when no later recurrence fits.
    with db_session_factory() as db:
        db.get(Digest, UUID(digest["id"])).schedule_next_at = NOW
        db.commit()
    assert client.get(f"/api/v1/digests/{digest['id']}", headers=auth).json()["schedule_exhausted"] is False


@pytest.mark.parametrize("other_digest", [False, True])
def test_scheduled_start_is_discoverable_and_still_blocks_a_racing_manual_request(client, db_session_factory, other_digest):
    from test_digests import _digest_payload
    from test_digest_runs import _override_runner
    auth, scheduled = setup_schedule(client)
    current = client.post("/api/v1/digests", json=_digest_payload(topic="Another topic"), headers=auth).json() if other_digest else scheduled
    assert client.get("/api/v1/digest-runs/active", headers=auth).json() is None
    fake = RecordingRadarClient()
    _override_runner(fake)
    assert ScheduleDispatcher(Settings(), db_session_factory, fake).tick(NOW) == 1
    active = client.get("/api/v1/digest-runs/active", headers=auth).json()
    assert active["digest_id"] == scheduled["id"] and active["status"] == "queued"
    blocked = client.post(f"/api/v1/digests/{current['id']}/runs", headers=auth)
    assert blocked.status_code == 409 and "already in progress" in blocked.json()["detail"]
    assert fake.calls == []
