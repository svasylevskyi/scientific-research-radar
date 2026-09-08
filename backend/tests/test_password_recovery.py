from datetime import datetime, timedelta, timezone
import re
from uuid import UUID, uuid4
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import sessionmaker

from app.core.config import get_settings
from app.core.security import hash_password, hash_token
from app.db.base import Base
from app.db.session import build_engine
from app.models.password_reset import PasswordReset, RecoveryRateLimit
from app.models.user import User
from app.services.email_service import EmailService, EmailDeliveryError
from app.services.password_recovery_service import reset_password, fingerprint
from test_digests import _register, _authorization, PASSWORD

NEW_PASSWORD = "Recovered-password-42!"


def request_link(client, email="recover@example.com"):
    response = client.post("/api/v1/auth/forgot-password", json={"email": email}, headers={"Host": "untrusted.example"})
    assert response.status_code == 202
    message = next(m for m in reversed(client.outbox) if m.subject == "Reset your Radar password")
    return re.search(r"#token=([A-Za-z0-9_-]{43})", message.text).group(1)


def reset(client, token, **overrides):
    return client.post("/api/v1/auth/reset-password", json={"token": token, "password": NEW_PASSWORD, "password_confirmation": NEW_PASSWORD} | overrides)


def test_recovery_single_use_revokes_all_tokens_and_allows_new_login(client, db_session_factory):
    registration = _register(client, "recover@example.com", "Recovery")
    old_access = _authorization(registration)
    refresh = client.cookies.get(get_settings().refresh_cookie_name)
    token = request_link(client)
    message = client.outbox[-1]
    assert get_settings().frontend_base_url + "/reset-password#token=" in message.text
    assert "untrusted.example" not in message.text
    with db_session_factory() as db:
        saved = db.scalar(select(PasswordReset))
        assert saved.token_hash == hash_token(token) and saved.token_hash != token
    result = reset(client, token)
    assert result.status_code == 200
    assert reset(client, token).status_code == 400
    assert client.get("/api/v1/users/me", headers=old_access).status_code == 401
    client.cookies.set(get_settings().refresh_cookie_name, refresh)
    assert client.post("/api/v1/auth/refresh").status_code == 401
    assert client.post("/api/v1/auth/login", json={"email": "recover@example.com", "password": PASSWORD}).status_code == 401
    login = client.post("/api/v1/auth/login", json={"email": "recover@example.com", "password": NEW_PASSWORD})
    assert login.status_code == 200
    assert client.get("/api/v1/users/me", headers=_authorization(login)).status_code == 200
    assert client.outbox[-1].subject == "Your Radar password was changed"
    assert NEW_PASSWORD not in client.outbox[-1].text


def test_generic_response_and_resend_limits(client, db_session_factory):
    registration = _register(client, "recover@example.com", "Recovery")
    responses = [client.post("/api/v1/auth/forgot-password", json={"email": email}) for email in ("recover@example.com", "missing@example.com", "recover@example.com")]
    assert all(r.status_code == 202 and r.json() == responses[0].json() for r in responses)
    assert len([m for m in client.outbox if m.subject == "Reset your Radar password"]) == 1
    with db_session_factory() as db:
        db.get(User, UUID(registration.json()["user"]["id"])).is_active = False
        # Clear windows only in this fixture to test inactive-account handling separately.
        from sqlalchemy import delete
        db.execute(delete(RecoveryRateLimit))
        db.commit()
    response = client.post("/api/v1/auth/forgot-password", json={"email": "recover@example.com"})
    assert response.status_code == 202 and response.json() == responses[0].json()
    assert len([m for m in client.outbox if m.subject == "Reset your Radar password"]) == 1


@pytest.mark.parametrize("change", ["expired", "email", "password", "inactive"])
def test_changed_credentials_and_expired_links_are_rejected(client, db_session_factory, change):
    registration = _register(client, "recover@example.com", "Recovery")
    token = request_link(client)
    with db_session_factory() as db:
        user = db.get(User, UUID(registration.json()["user"]["id"]))
        if change == "expired": db.scalar(select(PasswordReset)).expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        if change == "email": user.email = "changed@example.com"
        if change == "password": user.password_hash = hash_password("Different-password-43!")
        if change == "inactive": user.is_active = False
        db.commit()
    assert reset(client, token).status_code == 400


def test_validation_does_not_consume_token_or_echo_credentials(client):
    _register(client, "recover@example.com", "Recovery")
    token = request_link(client)
    response = reset(client, token, password="short")
    assert response.status_code == 422
    assert token not in response.text and '"input"' not in response.text
    assert reset(client, token, password_confirmation="Mismatched-password-42!").status_code == 422
    assert reset(client, token).status_code == 200


def test_mail_failure_does_not_disclose_account(client, monkeypatch):
    _register(client, "recover@example.com", "Recovery")
    def fail(*args): raise EmailDeliveryError("Test SMTP failure")
    monkeypatch.setattr(EmailService, "send", fail)
    a = client.post("/api/v1/auth/forgot-password", json={"email": "recover@example.com"})
    b = client.post("/api/v1/auth/forgot-password", json={"email": "missing@example.com"})
    assert a.status_code == b.status_code == 202 and a.json() == b.json()


def test_new_link_invalidates_previous_link(client, db_session_factory):
    _register(client, "recover@example.com", "Recovery")
    first = request_link(client)
    from sqlalchemy import delete
    with db_session_factory() as db:
        db.execute(delete(RecoveryRateLimit))
        db.commit()
    second = request_link(client)
    assert first != second
    assert reset(client, first).status_code == 400
    assert reset(client, second).status_code == 200


def test_reset_rate_limit_and_request_ip_budget(client, db_session_factory):
    for index in range(21):
        assert client.post("/api/v1/auth/forgot-password", json={"email": f"unknown{index}@example.com"}).status_code == 202
    with db_session_factory() as db:
        assert len(list(db.scalars(select(RecoveryRateLimit)))) == 41
    for _ in range(30):
        assert reset(client, "x" * 43).status_code == 400
    assert reset(client, "x" * 43).status_code == 429


def test_concurrent_redemption_only_changes_password_once(tmp_path):
    engine = build_engine(f"sqlite:///{tmp_path}/recovery.db")
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine, expire_on_commit=False)
    token = "x" * 43
    with sessions() as db:
        user = User(id=uuid4(), full_name="Owner", email="owner@example.com", password_hash=hash_password(PASSWORD))
        db.add(user); db.flush()
        db.add(PasswordReset(user_id=user.id, email=user.email, token_hash=hash_token(token), credential_fingerprint=fingerprint(user), expires_at=datetime.now(timezone.utc) + timedelta(minutes=30)))
        db.commit()
    def redeem(_):
        with sessions() as db:
            try:
                reset_password(db, token, NEW_PASSWORD)
                return 200
            except HTTPException as exc: return exc.status_code
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(redeem, range(2))) == [200, 400]
    engine.dispose()
