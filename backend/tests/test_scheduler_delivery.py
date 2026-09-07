from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest
from sqlalchemy import select, func

from app.core.config import Settings
from app.models.digest import Digest
from app.models.digest_email_delivery import DigestEmailDelivery
from app.models.digest_run import DigestRun
from app.models.user import User
from app.scheduler.recurrence import around, occurrence
from app.scheduler.dispatch import ScheduleDispatcher
from app.scheduler.delivery import BriefingDeliveryWorker
from app.schemas.digest_schedule import DigestSchedule
from app.services.email_service import EmailDeliveryError
from test_digests import _authorization, _digest_payload, _register
from test_digest_runs import _execute_next, RecordingRadarClient
from app.services.briefing_email import briefing_email

NOW = datetime(2030, 2, 10, 12, tzinfo=timezone.utc)


def setup_schedule(client, **changes):
    auth = _authorization(_register(client, "scheduled@example.com", "Scheduled User"))
    digest = client.post("/api/v1/digests", json=_digest_payload(), headers=auth).json()
    schedule = {"frequency": "daily", "starts_at": "2030-02-01T12:00:00Z", "time_zone": "UTC", "send_email": True} | changes
    result = client.put(f"/api/v1/digests/{digest['id']}/schedule", json=schedule, headers=auth)
    assert result.status_code == 200
    return auth, digest


@pytest.mark.parametrize("frequency,start,expected", [
    ("monthly", "2030-01-31T10:00:00Z", ["2030-02-28T10:00:00+00:00", "2030-03-31T10:00:00+00:00"]),
    ("quarterly", "2030-01-31T10:00:00Z", ["2030-04-30T10:00:00+00:00", "2030-07-31T10:00:00+00:00"]),
    ("daily", "2030-02-01T12:00:00Z", ["2030-02-02T12:00:00+00:00", "2030-02-03T12:00:00+00:00"]),
    ("weekly", "2030-02-01T12:00:00Z", ["2030-02-08T12:00:00+00:00", "2030-02-15T12:00:00+00:00"]),
])
def test_calendar_recurrence(frequency, start, expected):
    schedule = DigestSchedule(frequency=frequency, starts_at=start, time_zone="UTC")
    assert [occurrence(schedule, i).isoformat() for i in (1, 2)] == expected


def test_dst_and_exclusive_end():
    schedule = DigestSchedule(frequency="daily", starts_at="2026-03-28T02:30:00+01:00", time_zone="Europe/Warsaw")
    assert occurrence(schedule, 1).isoformat() == "2026-03-29T01:30:00+00:00"  # 03:30 after gap
    assert occurrence(schedule, 2).isoformat() == "2026-03-30T00:30:00+00:00"  # restores 02:30
    schedule.ends_at = occurrence(schedule, 2)
    assert around(schedule, schedule.ends_at) == (None, None)
    latest, following = around(schedule, occurrence(schedule, 1))
    assert latest == occurrence(schedule, 1)
    assert following is None


def test_dispatch_coalesces_blocks_per_owner_and_rolls_dates(client, db_session_factory):
    auth, digest = setup_schedule(client)
    dispatcher = ScheduleDispatcher(Settings(), db_session_factory, SimpleNamespace(model_name="test"))
    assert dispatcher.tick(NOW) == 1
    assert dispatcher.tick(NOW) == 0
    assert dispatcher.tick(NOW + timedelta(days=1)) == 0  # active user: deferred
    with db_session_factory() as db:
        run = db.scalar(select(DigestRun))
        assert run.trigger == "scheduled"
        assert run.digest_snapshot["reporting_to"] == "2030-02-10"
        assert run.digest_snapshot["reporting_from"] == "2030-01-27"
        assert "schedule" not in run.digest_snapshot and "schedule_next_at" not in run.digest_snapshot
        assert run.scheduled_for.replace(tzinfo=timezone.utc) == NOW
        assert db.scalar(select(func.count()).select_from(DigestEmailDelivery)) == 1
    # Remove schedule after enqueueing: no future runs; current run retains its choice.
    assert client.delete(f"/api/v1/digests/{digest['id']}/schedule", headers=auth).status_code == 204
    assert dispatcher.tick(NOW + timedelta(days=20)) == 0


def test_email_opt_out_and_inactive_or_ended_schedule(client, db_session_factory):
    _, digest = setup_schedule(client, send_email=False)
    dispatcher = ScheduleDispatcher(Settings(), db_session_factory, SimpleNamespace(model_name="test"))
    with db_session_factory() as db:
        owner = db.get(User, UUID(digest["owner_id"]))
        owner.is_active = False
        db.commit()
    assert dispatcher.tick(NOW) == 0
    with db_session_factory() as db:
        db.get(User, UUID(digest["owner_id"])).is_active = True
        db.commit()
    assert dispatcher.tick(NOW) == 1
    with db_session_factory() as db:
        assert db.scalar(select(func.count()).select_from(DigestEmailDelivery)) == 0


def test_completed_run_email_uses_profile_and_retries_without_regeneration(client, db_session_factory):
    _, digest = setup_schedule(client)
    fake = RecordingRadarClient()
    dispatcher = ScheduleDispatcher(Settings(), db_session_factory, fake)
    dispatcher.tick(NOW)
    messages = []
    sender = SimpleNamespace(send=lambda email: messages.append(email))
    delivery = BriefingDeliveryWorker(Settings(frontend_base_url="https://radar.example.com"), db_session_factory, sender)
    assert not delivery.run_once(NOW)  # never email partial runs
    _execute_next(db_session_factory, fake)
    calls = len(fake.calls)
    with db_session_factory() as db:
        db.get(User, UUID(digest["owner_id"])).email = "new-verified@example.com"
        db.commit()
    def fail(email):
        raise EmailDeliveryError("SMTP test failure")
    delivery.sender = SimpleNamespace(send=fail)
    assert delivery.run_once(NOW)
    assert not delivery.run_once(NOW + timedelta(seconds=1))
    delivery.sender = sender
    assert delivery.run_once(NOW + timedelta(minutes=3))
    assert not delivery.run_once(NOW + timedelta(minutes=4))
    assert len(messages) == 1
    assert messages[0].recipient == "new-verified@example.com"
    assert f"https://radar.example.com/digests/{digest['id']}?run_id=" in messages[0].html
    assert "Executive summary" in messages[0].html and "Papers to read" in messages[0].text
    assert len(fake.calls) == calls
    with db_session_factory() as db:
        job = db.scalar(select(DigestEmailDelivery))
        assert job.status == "sent" and job.attempts == 2 and job.sent_at


def test_parallel_dispatchers_create_only_one_run(tmp_path):
    from concurrent.futures import ThreadPoolExecutor
    from sqlalchemy.orm import sessionmaker
    from app.db.base import Base
    from app.db.session import build_engine
    from datetime import date
    engine = build_engine(f"sqlite:///{tmp_path}/dispatch.db")
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine, expire_on_commit=False)
    with sessions() as db:
        owner = User(id=uuid4(), email="parallel@example.com", full_name="Owner", password_hash="fixture")
        db.add(owner)
        db.flush()
        db.add(Digest(id=uuid4(), owner_id=owner.id, topic="Research", target_audience=["general"],
            reporting_from=date(2029, 1, 1), reporting_to=date(2029, 1, 15), maximum_papers=20,
            schedule={"starts_at": "2030-02-01T12:00:00Z", "frequency": "daily", "time_zone": "UTC"},
            schedule_next_at=NOW - timedelta(days=1)))
        db.commit()
    dispatcher = ScheduleDispatcher(Settings(), sessions, SimpleNamespace(model_name="fake"))
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sum(pool.map(lambda _: dispatcher.tick(NOW), range(2))) == 1
    with sessions() as db:
        assert db.scalar(select(func.count()).select_from(DigestRun)) == 1
        assert db.scalar(select(func.count()).select_from(DigestEmailDelivery)) == 1
    engine.dispose()


def test_expired_schedule_stops_without_catchup(client, db_session_factory):
    _, digest = setup_schedule(client, ends_at=NOW.isoformat())
    dispatcher = ScheduleDispatcher(Settings(), db_session_factory, SimpleNamespace(model_name="test"))
    assert dispatcher.tick(NOW) == 0
    with db_session_factory() as db:
        assert db.get(Digest, UUID(digest["id"])).schedule_next_at is None


def test_email_failure_limit_lease_recovery_and_account_disable(client, db_session_factory):
    _, digest = setup_schedule(client)
    fake = RecordingRadarClient()
    ScheduleDispatcher(Settings(), db_session_factory, fake).tick(NOW)
    _execute_next(db_session_factory, fake)
    def fail(email):
        raise EmailDeliveryError("Test")
    worker = BriefingDeliveryWorker(Settings(), db_session_factory, SimpleNamespace(send=fail))
    with db_session_factory() as db:
        job = db.scalar(select(DigestEmailDelivery))
        job.status = "sending"
        job.claim_token = "old-worker"
        job.claimed_until = NOW - timedelta(seconds=1)
        db.commit()
    for i in range(5):
        assert worker.run_once(NOW + timedelta(hours=i))
    assert not worker.run_once(NOW + timedelta(days=1))
    with db_session_factory() as db:
        job = db.scalar(select(DigestEmailDelivery))
        assert job.status == "failed" and job.attempts == 5
        job.status = "pending"
        job.next_attempt_at = NOW
        db.get(User, UUID(digest["owner_id"])).is_active = False
        db.commit()
    assert worker.run_once(NOW + timedelta(days=1))
    with db_session_factory() as db:
        assert db.scalar(select(DigestEmailDelivery)).status == "cancelled"


def test_email_escapes_untrusted_content_and_rejects_unsafe_links():
    run = SimpleNamespace(id=uuid4(), digest_id=uuid4(), briefing=SimpleNamespace(
        title="Title\nInjected: header", executive_summary='<img src=x onerror="alert(1)">',
        data={"highlights": ["<script>bad</script>"], "top_paper_external_ids": ["paper"]}),
        paper_results=[SimpleNamespace(paper=SimpleNamespace(external_id="paper", title="<b>Title</b>", url="javascript:alert(1)"))])
    message = briefing_email(run, "verified@example.com", "https://radar.example.com")
    assert "<script>" not in message.html and "<img" not in message.html
    assert "&lt;script&gt;" in message.html and "javascript:" not in message.html
    assert "\n" not in message.subject
    assert message.message_id == briefing_email(run, "verified@example.com", "https://radar.example.com").message_id
