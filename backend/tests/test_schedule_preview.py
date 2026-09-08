from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import UUID

import pytest
from sqlalchemy import func, select

from app.core.config import Settings
from app.models.digest import Digest
from app.models.digest_run import DigestRun, DigestRunStatus
from app.models.rate_limit import RateLimitBucket
from app.scheduler.dispatch import ScheduleDispatcher
from app.services.schedule_preview_service import schedule_preview
from app.services.rate_limit_service import window_key
from test_scheduler_delivery import setup_schedule, NOW
from test_digests import _register, _authorization, _digest_payload


def preview(db_session_factory, digest_id, now=NOW):
    with db_session_factory() as db:
        return schedule_preview(db, Settings(), db.get(Digest, UUID(digest_id)), now=now)


@pytest.mark.parametrize("schedule,now,expected", [
    ({"frequency": "daily", "starts_at": "2026-03-28T02:30:00+01:00", "time_zone": "Europe/Warsaw"},
     "2026-03-27T00:00:00+00:00", ["2026-03-28T01:30:00+00:00", "2026-03-29T01:30:00+00:00", "2026-03-30T00:30:00+00:00"]),
    ({"frequency": "monthly", "starts_at": "2030-01-31T10:00:00Z"},
     "2030-01-30T00:00:00+00:00", ["2030-01-31T10:00:00+00:00", "2030-02-28T10:00:00+00:00", "2030-03-31T10:00:00+00:00"]),
    ({"frequency": "quarterly", "starts_at": "2030-01-31T10:00:00Z"},
     "2030-01-30T00:00:00+00:00", ["2030-01-31T10:00:00+00:00", "2030-04-30T10:00:00+00:00", "2030-07-31T10:00:00+00:00"]),
    ({"frequency": "weekly", "starts_at": "2030-02-01T12:00:00Z", "ends_at": "2030-02-15T12:00:00Z"},
     "2030-01-30T00:00:00+00:00", ["2030-02-01T12:00:00+00:00", "2030-02-08T12:00:00+00:00"]),
])
def test_preview_uses_calendar_rules_and_exclusive_cutoff(client, db_session_factory, schedule, now, expected):
    _, digest = setup_schedule(client, **schedule)
    # Restore the intended test cursor even if this fixture's dates predate the real clock.
    with db_session_factory() as db:
        db.get(Digest, UUID(digest["id"])).schedule_next_at = datetime.fromisoformat(schedule["starts_at"].replace("Z", "+00:00")).astimezone(timezone.utc)
        db.commit()
    result = preview(db_session_factory, digest["id"], datetime.fromisoformat(now))
    assert result.state == "scheduled"
    assert [date.isoformat() for date in result.upcoming_runs] == expected


def test_overdue_preview_matches_dispatch_coalescing_without_side_effects(client, db_session_factory):
    _, digest = setup_schedule(client)
    first = preview(db_session_factory, digest["id"])
    second = preview(db_session_factory, digest["id"])
    assert first.state == "due" and first.next_scheduled_at == NOW
    assert first.upcoming_runs == second.upcoming_runs == [NOW + timedelta(days=i) for i in range(3)]
    with db_session_factory() as db:
        assert db.scalar(select(func.count()).select_from(DigestRun)) == 0
        # Preview never reserves run allowance.
        for scope, seconds in (("radar-hour", 3600), ("radar-day", 86400)):
            key, _ = window_key(Settings(), scope, digest["owner_id"], seconds, NOW)
            assert db.get(RateLimitBucket, key) is None
        cursor_before = db.get(Digest, UUID(digest["id"])).schedule_next_at
    assert ScheduleDispatcher(Settings(), db_session_factory, SimpleNamespace(model_name="test")).tick(NOW) == 1
    with db_session_factory() as db:
        assert db.scalar(select(DigestRun)).scheduled_for.replace(tzinfo=timezone.utc) == first.next_scheduled_at
        assert cursor_before != db.get(Digest, UUID(digest["id"])).schedule_next_at


def test_queued_running_and_final_ended_states(client, db_session_factory):
    _, digest = setup_schedule(client, ends_at=(NOW + timedelta(hours=1)).isoformat(), send_email=False)
    assert ScheduleDispatcher(Settings(), db_session_factory, SimpleNamespace(model_name="test")).tick(NOW) == 1
    queued = preview(db_session_factory, digest["id"])
    assert queued.state == "queued" and queued.active_run_id and queued.exhausted
    assert queued.upcoming_runs == [] and queued.send_email is False
    with db_session_factory() as db:
        db.scalar(select(DigestRun)).status = DigestRunStatus.RUNNING
        db.commit()
    assert preview(db_session_factory, digest["id"]).state == "running"
    with db_session_factory() as db:
        db.scalar(select(DigestRun)).status = DigestRunStatus.COMPLETED
        db.commit()
    result = preview(db_session_factory, digest["id"])
    assert result.state == "ended" and result.active_run_id is None


def test_waiting_for_another_run_only_when_due(client, db_session_factory):
    auth, scheduled = setup_schedule(client)
    other = client.post("/api/v1/digests", headers=auth, json=_digest_payload()).json()
    from test_digest_runs import _override_runner, RecordingRadarClient
    _override_runner(RecordingRadarClient())
    assert client.post(f"/api/v1/digests/{other['id']}/runs", headers=auth).status_code == 202
    waiting = preview(db_session_factory, scheduled["id"])
    assert waiting.state == "waiting_for_run" and str(waiting.waiting_digest_id) == other["id"]
    assert preview(db_session_factory, scheduled["id"], datetime(2030, 1, 1, tzinfo=timezone.utc)).state == "scheduled"


def test_usage_wait_uses_both_shared_windows_without_charging(client, db_session_factory):
    _, digest = setup_schedule(client)
    settings = Settings()
    keys = []
    with db_session_factory() as db:
        for scope, seconds, limit in (("radar-hour", 3600, settings.radar_runs_per_hour), ("radar-day", 86400, settings.radar_runs_per_day)):
            key, deadline = window_key(settings, scope, digest["owner_id"], seconds, NOW)
            keys.append(key)
            db.add(RateLimitBucket(key=key, expires_at=deadline, count=limit))
        db.commit()
    result = preview(db_session_factory, digest["id"])
    assert result.state == "waiting_for_allowance"
    assert result.allowance_available_at == datetime(2030, 2, 11, tzinfo=timezone.utc)
    with db_session_factory() as db:
        assert [db.get(RateLimitBucket, key).count for key in keys] == [settings.radar_runs_per_hour, settings.radar_runs_per_day]
    assert preview(db_session_factory, digest["id"], NOW + timedelta(days=1)).state == "due"


def test_preview_api_is_owner_scoped_and_updates_after_edits(client, db_session_factory):
    auth, digest = setup_schedule(client)
    path = f"/api/v1/digests/{digest['id']}/schedule/preview"
    result = client.get(path, headers=auth)
    assert result.status_code == 200 and result.json()["state"] == "scheduled"
    assert result.json()["time_zone"] == "UTC" and result.json()["send_email"] is True
    outsider = _authorization(_register(client, "outsider@example.com", "Outsider"))
    assert client.get(path, headers=outsider).status_code == 404
    assert client.get(path).status_code == 401
    changed = client.put(f"/api/v1/digests/{digest['id']}/schedule", headers=auth,
        json={"frequency": "monthly", "starts_at": "2031-01-31T10:00:00Z", "time_zone": "UTC", "send_email": False})
    assert changed.status_code == 200
    refreshed = client.get(path, headers=auth).json()
    assert refreshed["next_scheduled_at"].startswith("2031-01-31") and refreshed["send_email"] is False
    assert client.delete(f"/api/v1/digests/{digest['id']}/schedule", headers=auth).status_code == 204
    assert client.get(path, headers=auth).json()["state"] == "not_scheduled"


def test_expired_cursor_is_not_shown_as_an_upcoming_job(client, db_session_factory):
    _, digest = setup_schedule(client, ends_at=NOW.isoformat())
    result = preview(db_session_factory, digest["id"])
    assert result.state == "ended" and result.upcoming_runs == []
