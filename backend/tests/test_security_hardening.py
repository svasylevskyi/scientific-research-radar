from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from threading import Barrier
from uuid import UUID, uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.orm import sessionmaker

from app.core.config import Settings
from app.core.security import create_access_token, decode_token, hash_password, hash_token
from app.db.base import Base
from app.db.session import build_engine
from app.models.auth_session import AuthSession
from app.models.rate_limit import RateLimitBucket
from app.models.user import User
from app.services.auth_service import AuthService, AuthenticationError, RefreshConflict
from app.services.rate_limit_service import allowed, enforce
from app.services.user_profile_service import UserProfileService, CurrentPasswordInvalidError
from test_auth import register, REGISTER_PAYLOAD


def bearer(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def file_sessions(tmp_path):
    engine = build_engine(f"sqlite:///{tmp_path}/security.db")
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as db:
        db.add(User(id=uuid4(), email=REGISTER_PAYLOAD["email"], full_name="Security Test", password_hash=hash_password(REGISTER_PAYLOAD["password"])))
        db.commit()
    yield factory
    engine.dispose()


def login_service(factory):
    with factory() as db:
        return AuthService(db, Settings()).login(email=REGISTER_PAYLOAD["email"], password=REGISTER_PAYLOAD["password"])


def test_logout_immediately_invalidates_access_but_not_other_device(client):
    first = register(client).json()["access_token"]
    second = client.post("/api/v1/auth/login", json={"email": REGISTER_PAYLOAD["email"], "password": REGISTER_PAYLOAD["password"]}).json()["access_token"]
    assert client.post("/api/v1/auth/logout").status_code == 200
    assert client.get("/api/v1/users/me", headers=bearer(second)).status_code == 401
    assert client.get("/api/v1/users/me", headers=bearer(first)).status_code == 200


def test_refresh_race_does_not_clear_cookie_and_late_replay_persists_revocation(client, db_session_factory):
    registered = register(client)
    original = registered.cookies["research_radar_refresh"]
    rotated = client.post("/api/v1/auth/refresh")
    current = rotated.cookies["research_radar_refresh"]
    client.cookies.set("research_radar_refresh", original)
    conflict = client.post("/api/v1/auth/refresh")
    assert conflict.status_code == 409 and "set-cookie" not in conflict.headers
    assert client.get("/api/v1/users/me", headers=bearer(rotated.json()["access_token"])).status_code == 200
    with db_session_factory() as db:
        db.scalar(select(AuthSession)).rotated_at = datetime.now(UTC) - timedelta(minutes=1)
        db.commit()
    assert client.post("/api/v1/auth/refresh").status_code == 401
    client.cookies.set("research_radar_refresh", current)
    assert client.post("/api/v1/auth/refresh").status_code == 401
    assert client.get("/api/v1/users/me", headers=bearer(rotated.json()["access_token"])).status_code == 401
    with db_session_factory() as db:
        assert db.scalar(select(AuthSession)).revoked_at is not None


@pytest.mark.parametrize("expired_field", ["created_at", "expires_at"])
def test_absolute_and_idle_expiration(client, db_session_factory, expired_field):
    access = register(client).json()["access_token"]
    with db_session_factory() as db:
        session = db.scalar(select(AuthSession))
        setattr(session, expired_field, datetime.now(UTC) - timedelta(days=31))
        db.commit()
    assert client.get("/api/v1/users/me", headers=bearer(access)).status_code == 401
    assert client.post("/api/v1/auth/refresh").status_code == 401


def test_refresh_cannot_extend_absolute_deadline(client, db_session_factory):
    register(client)
    created = datetime.now(UTC) - timedelta(days=29)
    with db_session_factory() as db:
        db.scalar(select(AuthSession)).created_at = created
        db.commit()
    response = client.post("/api/v1/auth/refresh")
    assert response.status_code == 200
    claims = decode_token(response.cookies["research_radar_refresh"], expected_type="refresh", settings=Settings())
    assert claims.expires_at <= created + timedelta(days=30)


def test_legacy_access_requires_renewal(client):
    registered = register(client).json()
    token, _ = create_access_token(UUID(registered["user"]["id"]), Settings())
    assert client.get("/api/v1/users/me", headers=bearer(token)).status_code == 401
    renewed = client.post("/api/v1/auth/refresh")
    assert renewed.status_code == 200
    assert client.get("/api/v1/users/me", headers=bearer(renewed.json()["access_token"])).status_code == 200


def test_cookie_endpoints_require_header_and_trusted_browser_origin(client):
    register(client)
    for path in ("/api/v1/auth/refresh", "/api/v1/auth/logout"):
        assert client.post(path, headers={"X-Radar-Request": ""}).status_code == 403
        assert client.post(path, headers={"Origin": "https://evil.example"}).status_code == 403
        assert client.post(path, headers={"Origin": "null"}).status_code == 403
    assert client.post("/api/v1/auth/refresh", headers={"Origin": "http://localhost:5173"}).status_code == 200
    assert client.post("/api/v1/auth/refresh").status_code == 200


def test_login_throttle_is_account_scoped_and_has_retry_guidance(client):
    register(client)
    for _ in range(10):
        assert client.post("/api/v1/auth/login", json={"email": REGISTER_PAYLOAD["email"].upper(), "password": "wrong"}).status_code == 401
    limited = client.post("/api/v1/auth/login", json={"email": REGISTER_PAYLOAD["email"], "password": REGISTER_PAYLOAD["password"]})
    assert limited.status_code == 429 and int(limited.headers["Retry-After"]) > 0
    assert client.post("/api/v1/auth/login", json={"email": "other@example.com", "password": "wrong"}).status_code == 401
    assert client.get("/health").status_code == 200


def test_untrusted_forwarded_ip_cannot_bypass_limit(client, monkeypatch):
    from app.api.security import POLICIES
    monkeypatch.setitem(POLICIES, "login-ip", (2, 900))
    for i in range(2):
        assert client.post("/api/v1/auth/login", json={"email": f"missing{i}@example.com", "password": "wrong"}, headers={"X-Forwarded-For": f"192.0.2.{i}"}).status_code == 401
    assert client.post("/api/v1/auth/login", json={"email": "another@example.com", "password": "wrong"}, headers={"X-Forwarded-For": "192.0.2.100"}).status_code == 429


def test_validation_does_not_echo_passwords_and_responses_are_not_cached(client):
    response = client.post("/api/v1/auth/register", json={**REGISTER_PAYLOAD, "password": "secret"})
    assert response.status_code == 422
    assert "secret" not in response.text and all("input" not in e for e in response.json()["detail"])
    assert response.headers["Cache-Control"] == "no-store"


def test_concurrent_refresh_has_one_winner(file_sessions):
    initial = login_service(file_sessions)
    barrier = Barrier(2)
    def refresh(_):
        with file_sessions() as db:
            barrier.wait()
            try:
                return AuthService(db, Settings()).refresh(initial.refresh_token)
            except RefreshConflict:
                return None
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(refresh, range(2)))
    winner = [r for r in results if r is not None]
    assert len(winner) == 1
    with file_sessions() as db:
        session = db.scalar(select(AuthSession))
        assert session.token_hash == hash_token(winner[0].refresh_token)
        assert session.revoked_at is None
    with file_sessions() as db:
        assert AuthService(db, Settings()).refresh(winner[0].refresh_token)


def test_concurrent_logout_and_refresh_cannot_resurrect_session(file_sessions):
    initial = login_service(file_sessions)
    barrier = Barrier(2)
    def execute(kind):
        with file_sessions() as db:
            barrier.wait()
            try:
                service = AuthService(db, Settings())
                return service.logout(initial.refresh_token) if kind else service.refresh(initial.refresh_token)
            except AuthenticationError:
                return None
    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(execute, range(2)))
    with file_sessions() as db:
        assert db.scalar(select(AuthSession)).revoked_at is not None


def test_concurrent_password_changes_only_one_wins(file_sessions):
    barrier = Barrier(2)
    def change(index):
        with file_sessions() as db:
            user = db.scalar(select(User))
            barrier.wait()
            try:
                UserProfileService(db).change_password(user=user, current_password=REGISTER_PAYLOAD["password"], new_password=f"New-password-{index}A!")
                return True
            except CurrentPasswordInvalidError:
                return False
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sum(pool.map(change, range(2))) == 1


def test_atomic_rate_limit_across_independent_sessions(file_sessions):
    def attempt(_):
        with file_sessions() as db:
            return allowed(db, Settings(), "test", "user@example.com", 5, 3600)
    with ThreadPoolExecutor(max_workers=8) as pool:
        assert sum(pool.map(attempt, range(24))) == 5
    with file_sessions() as db:
        bucket = db.scalar(select(RateLimitBucket))
        assert bucket.count == 5 and "user" not in bucket.key
        assert allowed(db, Settings(), "test", "other@example.com", 5, 3600)


def test_rate_budget_rolls_back_with_failed_enqueue(file_sessions):
    with file_sessions() as db:
        enforce(db, Settings(), "radar-hour", "owner", 1, 3600, commit=False)
        db.rollback()
    with file_sessions() as db:
        assert allowed(db, Settings(), "radar-hour", "owner", 1, 3600)
        assert not allowed(db, Settings(), "radar-hour", "owner", 1, 3600)


def test_expired_rate_window_allows_retry(file_sessions, monkeypatch):
    import app.services.rate_limit_service as limits
    fixed = datetime(2030, 1, 1, 12, tzinfo=UTC)
    class Clock(datetime):
        @classmethod
        def now(cls, tz=None): return fixed
    monkeypatch.setattr(limits, "datetime", Clock)
    with file_sessions() as db:
        assert allowed(db, Settings(), "window", "owner", 1, 60)
        assert not allowed(db, Settings(), "window", "owner", 1, 60)
        fixed += timedelta(seconds=60)
        assert allowed(db, Settings(), "window", "owner", 1, 60)


def test_run_limits_cover_manual_retries_and_schedules(client, db_session_factory, monkeypatch):
    from app.core.config import get_settings
    from app.models.digest import Digest
    from app.models.digest_run import DigestRun, DigestRunStatus, DigestRunStageStatus
    from app.scheduler.dispatch import ScheduleDispatcher
    from test_scheduler_delivery import setup_schedule, NOW
    from test_digest_runs import RecordingRadarClient, _override_runner
    settings = get_settings()
    monkeypatch.setattr(settings, "radar_runs_per_hour", 1)
    auth, digest = setup_schedule(client)
    fake = RecordingRadarClient()
    _override_runner(fake)
    path = f"/api/v1/digests/{digest['id']}/runs"
    first = client.post(path, headers=auth)
    assert first.status_code == 202
    with db_session_factory() as db:
        run = db.get(DigestRun, UUID(first.json()["id"]))
        run.status = DigestRunStatus.FAILED
        run.stages[0].status = DigestRunStageStatus.FAILED
        db.commit()
        before = db.get(Digest, UUID(digest["id"])).schedule_next_at
    assert client.post(path, headers=auth).status_code == 429
    assert client.post(path + f"/{first.json()['id']}/retry", headers=auth).status_code == 429
    assert ScheduleDispatcher(settings, db_session_factory, fake).tick(NOW) == 0
    with db_session_factory() as db:
        assert db.get(Digest, UUID(digest["id"])).schedule_next_at == before
    assert client.get(path, headers=auth).status_code == 200
    assert client.get("/api/v1/digest-runs/active", headers=auth).status_code == 200
    assert fake.calls == []


def test_concurrent_retry_only_enqueues_and_charges_once(file_sessions):
    from app.schemas.digest import DigestCreate
    from app.services.digest_service import DigestService
    from app.models.digest_run import DigestRun, DigestRunStatus, DigestRunStageStatus
    from app.radar.runner import RadarRunNotRetryableError, RadarRunAlreadyActiveError
    from test_digests import _digest_payload
    from test_digest_runs import _runner, RecordingRadarClient
    with file_sessions() as db:
        owner = db.scalar(select(User))
        owner_id = owner.id
        digest = DigestService(db).create(owner=owner, values=DigestCreate.model_validate(_digest_payload()))
        digest_id = digest.id
        run = _runner(db, RecordingRadarClient()).start_digest(digest_id=digest_id, owner_id=owner_id)
        run_id = run.id
        run.status = DigestRunStatus.FAILED
        run.stages[0].status = DigestRunStageStatus.FAILED
        db.commit()
    barrier = Barrier(2)
    def retry(_):
        with file_sessions() as db:
            runner = _runner(db, RecordingRadarClient())
            original = runner.runs.get_owned
            def read(**kwargs):
                result = original(**kwargs)
                barrier.wait()
                return result
            runner.runs.get_owned = read
            try:
                runner.retry_digest(digest_id=digest_id, run_id=run_id, owner_id=owner_id)
                return True
            except (RadarRunNotRetryableError, RadarRunAlreadyActiveError):
                return False
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sum(pool.map(retry, range(2))) == 1
    with file_sessions() as db:
        assert db.get(DigestRun, run_id).status == DigestRunStatus.QUEUED
        assert sorted(db.scalars(select(RateLimitBucket.count))) == [2, 2]


@pytest.mark.parametrize("action", ["deactivate", "role"])
def test_admin_security_changes_invalidate_existing_sessions(client, db_session_factory, action):
    from test_digests import _super_admin_login, _authorization
    registered = register(client)
    old_access = registered.json()["access_token"]
    old_refresh = registered.cookies["research_radar_refresh"]
    user_id = registered.json()["user"]["id"]
    admin_headers = _authorization(_super_admin_login(client, db_session_factory))
    if action == "role":
        assert client.put(f"/api/v1/admin/users/{user_id}/role", json={"role": "admin"}, headers=admin_headers).status_code == 200
    else:
        assert client.patch(f"/api/v1/admin/users/{user_id}", json={"is_active": False}, headers=admin_headers).status_code == 200
        assert client.patch(f"/api/v1/admin/users/{user_id}", json={"is_active": True}, headers=admin_headers).status_code == 200
    assert client.get("/api/v1/users/me", headers=bearer(old_access)).status_code == 401
    client.cookies.set("research_radar_refresh", old_refresh)
    assert client.post("/api/v1/auth/refresh").status_code == 401


def test_registration_and_verification_throttles_are_enforced(client, monkeypatch):
    from app.services.rate_limit_service import POLICIES
    monkeypatch.setitem(POLICIES, "registration-email", (1, 3600))
    pending = client.post("/api/v1/auth/register", json=REGISTER_PAYLOAD)
    assert pending.status_code == 202
    assert client.post("/api/v1/auth/register", json=REGISTER_PAYLOAD).status_code == 429
    monkeypatch.setitem(POLICIES, "verify-challenge", (2, 900))
    path = f"/api/v1/auth/register/{pending.json()['id']}/confirm"
    for _ in range(2):
        assert client.post(path, json={"code": "not-six-digits"}).status_code == 422
    assert client.post(path, json={"code": "123456"}).status_code == 429
    monkeypatch.setitem(POLICIES, "resend-challenge", (1, 3600))
    resend = f"/api/v1/auth/register/{pending.json()['id']}/resend"
    assert client.post(resend).status_code == 429  # Existing one-minute cooldown.
    response = client.post(resend)
    assert response.status_code == 429 and "Retry-After" in response.headers
