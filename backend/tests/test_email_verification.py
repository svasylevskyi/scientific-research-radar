from datetime import UTC, datetime, timedelta
import re
from uuid import UUID

import pytest
from sqlalchemy import select

from app.models.email_verification import EmailVerification
from app.models.user import User
from app.services.email_service import EmailDeliveryError, EmailService, OutgoingEmail
from app.services.email_verification_service import cleanup_expired
from app.core.config import Settings


PAYLOAD = dict(email="verify@example.com", full_name="Verify User",
               password="Password1!", password_confirmation="Password1!")


def latest_code(client):
    return re.search(r"code is: ([0-9]{6})", client.outbox[-1].text).group(1)


def age_challenge(factory, challenge_id, *, expire=False):
    with factory() as db:
        challenge = db.get(EmailVerification, UUID(challenge_id))
        challenge.sent_at = datetime.now(UTC) - timedelta(seconds=61)
        if expire:
            challenge.expires_at = datetime.now(UTC) - timedelta(seconds=1)
        db.commit()


def test_registration_requires_email_and_code_is_one_time(client, db_session_factory):
    pending = client.post("/api/v1/auth/register", json=PAYLOAD)
    assert pending.status_code == 202
    assert "access_token" not in pending.json()
    assert "research_radar_refresh" not in pending.cookies
    challenge_id = pending.json()["id"]
    code = latest_code(client)
    sent_at = datetime.fromisoformat(pending.json()["sent_at"])
    code_expiry = datetime.fromisoformat(pending.json()["code_expires_at"])
    assert code_expiry - sent_at == timedelta(hours=24)
    with db_session_factory() as db:
        assert db.scalar(select(User).where(User.email == PAYLOAD["email"])) is None
        challenge = db.get(EmailVerification, UUID(challenge_id))
        assert challenge.code_hash != code
        assert challenge.password_hash != PAYLOAD["password"]
    assert client.post("/api/v1/auth/login", json={
        "email": PAYLOAD["email"], "password": PAYLOAD["password"],
    }).status_code == 401
    path = f"/api/v1/auth/register/{challenge_id}/confirm"
    assert client.post(path, json={"code": code}).status_code == 201
    assert client.post(path, json={"code": code}).status_code == 410


def test_resend_cooldown_and_replacement_preserve_deadline(client, db_session_factory, monkeypatch):
    codes = iter([123, 456])
    monkeypatch.setattr("app.services.email_verification_service.secrets.randbelow", lambda _: next(codes))
    pending = client.post("/api/v1/auth/register", json=PAYLOAD).json()
    path = f"/api/v1/auth/register/{pending['id']}"
    assert latest_code(client) == "000123"
    assert client.post(f"{path}/resend").status_code == 429
    assert len(client.outbox) == 1
    age_challenge(db_session_factory, pending["id"])
    resent = client.post(f"{path}/resend")
    assert resent.status_code == 200
    assert datetime.fromisoformat(resent.json()["expires_at"]).replace(tzinfo=UTC) == datetime.fromisoformat(pending["expires_at"]).replace(tzinfo=UTC)
    assert latest_code(client) == "000456"
    assert client.post(f"{path}/confirm", json={"code": "000123"}).status_code == 400
    assert client.post(f"{path}/confirm", json={"code": "000456"}).status_code == 201


def test_expired_registration_is_removed_and_can_restart(client, db_session_factory):
    pending = client.post("/api/v1/auth/register", json=PAYLOAD).json()
    age_challenge(db_session_factory, pending["id"], expire=True)
    assert client.post(f"/api/v1/auth/register/{pending['id']}/confirm",
                       json={"code": latest_code(client)}).status_code == 410
    with db_session_factory() as db:
        assert db.get(EmailVerification, UUID(pending["id"])) is None
    restarted = client.post("/api/v1/auth/register", json=PAYLOAD)
    assert restarted.status_code == 202
    assert restarted.json()["id"] != pending["id"]
    age_challenge(db_session_factory, restarted.json()["id"], expire=True)
    with db_session_factory() as db:
        cleanup_expired(db)
        assert db.get(EmailVerification, UUID(restarted.json()["id"])) is None


def test_bad_codes_are_counted_and_resend_does_not_reset_limit(client, db_session_factory):
    pending = client.post("/api/v1/auth/register", json=PAYLOAD).json()
    path = f"/api/v1/auth/register/{pending['id']}"
    correct = latest_code(client)
    wrong = "111111" if correct != "111111" else "222222"
    assert client.post(f"{path}/confirm", json={"code": wrong}).status_code == 400
    with db_session_factory() as db:
        challenge = db.get(EmailVerification, UUID(pending["id"]))
        assert challenge.attempts == 1
        challenge.attempts = 50
        db.commit()
    assert client.post(f"{path}/confirm", json={"code": correct}).status_code == 410
    age_challenge(db_session_factory, pending["id"])
    assert client.post(f"{path}/resend").status_code == 429


def test_delivery_failure_rolls_back_and_can_retry(client, db_session_factory, monkeypatch):
    def fail(*_):
        raise EmailDeliveryError("Delivery failed")
    with monkeypatch.context() as scoped:
        scoped.setattr(EmailService, "send", fail)
        assert client.post("/api/v1/auth/register", json=PAYLOAD).status_code == 503
    with db_session_factory() as db:
        assert db.scalar(select(EmailVerification)) is None
    pending = client.post("/api/v1/auth/register", json=PAYLOAD).json()
    code = latest_code(client)
    age_challenge(db_session_factory, pending["id"])
    with monkeypatch.context() as scoped:
        scoped.setattr(EmailService, "send", fail)
        assert client.post(f"/api/v1/auth/register/{pending['id']}/resend").status_code == 503
    assert client.post(f"/api/v1/auth/register/{pending['id']}/confirm", json={"code": code}).status_code == 201


def test_profile_email_changes_only_after_owner_confirmation(client):
    registered = client.register_verified(json=PAYLOAD).json()
    auth = {"Authorization": f"Bearer {registered['access_token']}"}
    assert client.patch("/api/v1/users/me", headers=auth,
                        json={"email": "updated@example.com"}).status_code == 409
    pending = client.post("/api/v1/users/me/email-verification", headers=auth,
                          json={"email": " UPDATED@example.com "}).json()
    code = latest_code(client)
    path = f"/api/v1/users/me/email-verification/{pending['id']}"
    assert client.get("/api/v1/users/me", headers=auth).json()["email"] == PAYLOAD["email"]
    assert client.get("/api/v1/users/me/email-verification", headers=auth).json()["id"] == pending["id"]
    assert client.post(f"{path}/resend", headers=auth).status_code == 429
    other = client.register_verified(json={**PAYLOAD, "email": "other@example.com"}).json()
    other_auth = {"Authorization": f"Bearer {other['access_token']}"}
    assert client.post(f"{path}/confirm", headers=other_auth, json={"code": code}).status_code == 410
    assert client.post(f"/api/v1/auth/register/{pending['id']}/confirm", json={"code": code}).status_code == 410
    confirmed = client.post(f"{path}/confirm", headers=auth, json={"code": code})
    assert confirmed.status_code == 200
    assert confirmed.json()["email"] == "updated@example.com"
    assert client.get("/api/v1/users/me/email-verification", headers=auth).json() is None
    assert client.post("/api/v1/auth/login", json={"email": PAYLOAD["email"], "password": PAYLOAD["password"]}).status_code == 401
    assert client.post("/api/v1/auth/login", json={"email": "updated@example.com", "password": PAYLOAD["password"]}).status_code == 200


def test_profile_expiry_keeps_original_address(client, db_session_factory):
    user = client.register_verified(json=PAYLOAD).json()
    auth = {"Authorization": f"Bearer {user['access_token']}"}
    pending = client.post("/api/v1/users/me/email-verification", headers=auth,
                          json={"email": "updated@example.com"}).json()
    age_challenge(db_session_factory, pending["id"], expire=True)
    assert client.post(f"/api/v1/users/me/email-verification/{pending['id']}/confirm",
                       headers=auth, json={"code": latest_code(client)}).status_code == 410
    assert client.get("/api/v1/users/me", headers=auth).json()["email"] == PAYLOAD["email"]


def test_pending_registration_cannot_be_overwritten(client):
    original = client.post("/api/v1/auth/register", json=PAYLOAD).json()
    recovered = client.post("/api/v1/auth/register", json=PAYLOAD).json()
    assert recovered["id"] == original["id"]
    assert len(client.outbox) == 1
    assert client.post("/api/v1/auth/register", json={**PAYLOAD,
        "password": "Another1!", "password_confirmation": "Another1!"}).status_code == 409


def test_generic_smtp_sender_uses_tls_and_supports_html(monkeypatch):
    sent = []
    calls = []
    class SMTP:
        def __init__(self, *args, **kwargs): pass
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def starttls(self, **kwargs): calls.append("tls")
        def login(self, *args): calls.append("login")
        def send_message(self, message): sent.append(message); return {}
    monkeypatch.setattr("app.services.email_service.smtplib.SMTP", SMTP)
    settings = Settings(smtp_host="smtp.example.com", smtp_username="sender",
                        smtp_password="test-secret", email_from="sender@example.com")
    EmailService(settings).send(OutgoingEmail("to@example.com", "Test", "Plain text", "<p>HTML</p>"))
    assert calls == ["tls", "login"]
    assert sent[0]["To"] == "to@example.com"
    assert sent[0].is_multipart()


def test_missing_smtp_configuration_is_an_explicit_error():
    with pytest.raises(EmailDeliveryError):
        EmailService(Settings(smtp_host=None, email_from=None)).send(OutgoingEmail("to@example.com", "Test", "Test"))


@pytest.mark.parametrize("action", ["confirm", "resend"])
def test_concurrent_requests_only_apply_once(tmp_path, monkeypatch, action):
    from concurrent.futures import ThreadPoolExecutor
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from app.db.base import Base
    from app.services.email_verification_service import EmailVerificationService, VerificationError

    engine = create_engine(f"sqlite:///{tmp_path / 'concurrent.db'}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    messages = []
    monkeypatch.setattr(EmailService, "send", lambda self, message: messages.append(message))
    settings = Settings()
    with factory() as db:
        challenge = EmailVerificationService(db, settings).start(
            email=PAYLOAD["email"], full_name=PAYLOAD["full_name"], password=PAYLOAD["password"],
        )
        challenge_id = challenge.id
        if action == "resend":
            challenge.sent_at = datetime.now(UTC) - timedelta(seconds=61)
            db.commit()
    code = re.search(r"code is: ([0-9]{6})", messages[0].text).group(1)
    def execute():
        with factory() as db:
            service = EmailVerificationService(db, settings)
            try:
                if action == "confirm":
                    service.confirm(challenge_id, code)
                else:
                    service.resend(challenge_id)
                return 200
            except VerificationError as exc:
                return exc.status_code
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: execute(), range(2)))
    assert sorted(results) == [200, 410 if action == "confirm" else 429]
    assert len(messages) == (1 if action == "confirm" else 2)
    engine.dispose()
