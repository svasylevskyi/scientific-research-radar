from uuid import UUID, uuid4
import pytest
from sqlalchemy import func, select
from app.models.contact_message import ContactMessage
from app.models.user import User, UserRole
from app.services.rate_limit_service import POLICIES

PAYLOAD = {"name": " Reader ", "email": "reader@example.com", "message": " A question "}


def admin_headers(client, factory):
    response = client.register_verified(json={"full_name": "Inbox Admin", "email": "inbox@example.com", "password": "Correct-horse-battery-staple1", "password_confirmation": "Correct-horse-battery-staple1"})
    with factory() as db:
        db.get(User, UUID(response.json()["user"]["id"])).role = UserRole.ADMIN
        db.commit()
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_submission_and_access(client, db_session_factory):
    response = client.post("/api/v1/contact", json=PAYLOAD)
    assert response.status_code == 201
    assert set(response.json()) == {"message"}
    with db_session_factory() as db:
        stored = db.scalar(select(ContactMessage))
        assert (stored.name, stored.message, stored.reviewed_at) == ("Reader", "A question", None)
    assert client.get("/api/v1/admin/messages").status_code == 401
    assert client.patch(f"/api/v1/admin/messages/{uuid4()}", json={"reviewed": True}).status_code == 401


@pytest.mark.parametrize("changes", [{"message": "x" * 1001}, {"message": "   "}, {"name": "  "}, {"name": "x" * 121}, {"email": "invalid"}])
def test_validation(client, db_session_factory, changes):
    assert client.post("/api/v1/contact", json={**PAYLOAD, **changes}).status_code == 422
    with db_session_factory() as db:
        assert db.scalar(select(func.count()).select_from(ContactMessage)) == 0


def test_review_and_pagination(client, db_session_factory):
    headers = admin_headers(client, db_session_factory)
    for message in ["x" * 1000, "<script>alert('test')</script>\nSecond line"]:
        assert client.post("/api/v1/contact", json={**PAYLOAD, "message": message}).status_code == 201
    first = client.get("/api/v1/admin/messages?limit=1", headers=headers).json()
    second = client.get("/api/v1/admin/messages?limit=1&offset=1", headers=headers).json()
    assert first["total"] == second["total"] == 2
    assert first["items"][0]["id"] != second["items"][0]["id"]
    path = f"/api/v1/admin/messages/{first['items'][0]['id']}"
    reviewed = client.patch(path, headers=headers, json={"reviewed": True})
    assert reviewed.status_code == 200 and reviewed.json()["reviewed_at"]
    assert client.patch(path, headers=headers, json={"reviewed": True}).json()["reviewed_at"] == reviewed.json()["reviewed_at"]
    assert client.patch(path, headers=headers, json={"reviewed": False}).json()["reviewed_at"] is None
    assert client.patch(f"/api/v1/admin/messages/{uuid4()}", headers=headers, json={"reviewed": True}).status_code == 404
    assert client.get("/api/v1/admin/messages?limit=101", headers=headers).status_code == 422
    with db_session_factory() as db:
        db.scalar(select(User).where(User.email == "inbox@example.com")).role = UserRole.USER
        db.commit()
    assert client.get("/api/v1/admin/messages", headers=headers).status_code == 403
    assert client.patch(path, headers=headers, json={"reviewed": True}).status_code == 403


def test_throttling(client, db_session_factory, monkeypatch):
    monkeypatch.setitem(POLICIES, "contact-ip", (1, 3600))
    assert client.post("/api/v1/contact", json=PAYLOAD).status_code == 201
    response = client.post("/api/v1/contact", json=PAYLOAD)
    assert response.status_code == 429 and int(response.headers["retry-after"]) > 0
    headers = admin_headers(client, db_session_factory)
    assert client.get("/api/v1/admin/messages", headers=headers).status_code == 200
