import os
import re

os.environ.setdefault("ENVIRONMENT", "test")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.services.email_service import EmailService


class VerifiedTestClient(TestClient):
    """Explicit account setup helper that completes the real verification API flow."""
    outbox: list

    def register_verified(self, *, json):
        pending = self.post("/api/v1/auth/register", json=json)
        if pending.status_code != 202:
            return pending
        challenge = pending.json()
        message = next(message for message in reversed(self.outbox) if message.recipient == challenge["email"])
        code = re.search(r"code is: ([0-9]{6})", message.text).group(1)
        return self.post(f"/api/v1/auth/register/{challenge['id']}/confirm", json={"code": code})


@pytest.fixture
def db_session_factory() -> sessionmaker[Session]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    yield factory
    Base.metadata.drop_all(engine)
    engine.dispose()


@pytest.fixture
def client(db_session_factory: sessionmaker[Session], monkeypatch) -> TestClient:
    def override_get_db():
        with db_session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    outbox = []
    monkeypatch.setattr(EmailService, "send", lambda self, message: outbox.append(message))
    with VerifiedTestClient(app, headers={"X-Radar-Request": "1"}) as test_client:
        test_client.outbox = outbox
        yield test_client
    app.dependency_overrides.clear()
