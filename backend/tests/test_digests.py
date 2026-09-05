from datetime import date, timedelta

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings
from app.services.super_admin_service import ensure_super_admin

PASSWORD = "correct-horse-battery-staple"


def _register(client: TestClient, email: str, full_name: str):
    return client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "full_name": full_name,
            "password": PASSWORD,
            "password_confirmation": PASSWORD,
        },
    )


def _authorization(response) -> dict[str, str]:
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _super_admin_login(
    client: TestClient, db_session_factory: sessionmaker[Session]
):
    settings = get_settings()
    with db_session_factory() as db:
        ensure_super_admin(db, settings)
    return client.post(
        "/api/v1/auth/login",
        json={
            "email": str(settings.super_admin_email),
            "password": settings.super_admin_password,
        },
    )


def _digest_payload(**overrides):
    today = date.today()
    return {
        "topic": "AI agents for software engineering",
        "description": "Track evidence about agentic software delivery.",
        "include_keywords": ["coding agents", "benchmarks"],
        "exclude_keywords": ["opinion"],
        "target_audience": ["builders_technical_teams"],
        "reporting_from": (today - timedelta(days=14)).isoformat(),
        "reporting_to": today.isoformat(),
        "frequency": "weekly",
        "maximum_papers": 20,
    } | overrides


def test_digest_api_requires_authentication(client: TestClient) -> None:
    assert client.get("/api/v1/digests").status_code == 401
    assert client.post("/api/v1/digests", json=_digest_payload()).status_code == 401


def test_user_can_create_list_view_update_and_delete_own_digest(
    client: TestClient,
) -> None:
    registration = _register(client, "owner@example.com", "Digest Owner")
    authorization = _authorization(registration)

    created = client.post(
        "/api/v1/digests",
        json=_digest_payload(
            topic="  AI agents   for software engineering  ",
            include_keywords=["Agents", "agents", "Benchmarks"],
        ),
        headers=authorization,
    )
    assert created.status_code == 201
    digest_id = created.json()["id"]
    assert created.json()["owner_id"] == registration.json()["user"]["id"]
    assert created.json()["topic"] == "AI agents for software engineering"
    assert created.json()["include_keywords"] == ["Agents", "Benchmarks"]

    listed = client.get("/api/v1/digests", headers=authorization)
    assert listed.status_code == 200
    assert listed.json()["total"] == 1
    assert listed.json()["items"][0]["id"] == digest_id

    detail = client.get(f"/api/v1/digests/{digest_id}", headers=authorization)
    assert detail.status_code == 200

    updated = client.patch(
        f"/api/v1/digests/{digest_id}",
        json={"topic": "Updated topic", "maximum_papers": 30},
        headers=authorization,
    )
    assert updated.status_code == 200
    assert updated.json()["topic"] == "Updated topic"
    assert updated.json()["maximum_papers"] == 30

    deleted = client.delete(f"/api/v1/digests/{digest_id}", headers=authorization)
    assert deleted.status_code == 204
    assert client.get(
        f"/api/v1/digests/{digest_id}", headers=authorization
    ).status_code == 404


def test_user_cannot_access_another_users_digest(client: TestClient) -> None:
    owner = _register(client, "first@example.com", "First Owner")
    other = _register(client, "second@example.com", "Second Owner")
    created = client.post(
        "/api/v1/digests",
        json=_digest_payload(),
        headers=_authorization(owner),
    )
    digest_id = created.json()["id"]

    other_access = _authorization(other)
    assert client.get(f"/api/v1/digests/{digest_id}", headers=other_access).status_code == 404
    assert client.patch(
        f"/api/v1/digests/{digest_id}",
        json={"topic": "Unauthorized"},
        headers=other_access,
    ).status_code == 404
    assert client.delete(
        f"/api/v1/digests/{digest_id}", headers=other_access
    ).status_code == 404


def test_digest_payload_validation_is_enforced(client: TestClient) -> None:
    registration = _register(client, "validation@example.com", "Validation User")
    authorization = _authorization(registration)
    tomorrow = (date.today() + timedelta(days=1)).isoformat()

    invalid_changes = [
        {"topic": "   "},
        {"description": "x" * 301},
        {"include_keywords": ["x" * 49]},
        {"target_audience": []},
        {"target_audience": ["invalid-audience"]},
        {"reporting_from": date.today().isoformat(), "reporting_to": "2020-01-01"},
        {"reporting_to": tomorrow},
        {"frequency": "yearly"},
        {"maximum_papers": 31},
    ]

    for changes in invalid_changes:
        response = client.post(
            "/api/v1/digests",
            json=_digest_payload(**changes),
            headers=authorization,
        )
        assert response.status_code == 422, changes

    valid = client.post(
        "/api/v1/digests", json=_digest_payload(), headers=authorization
    )
    digest_id = valid.json()["id"]
    assert client.patch(
        f"/api/v1/digests/{digest_id}",
        json={"reporting_from": date.today().isoformat(), "reporting_to": "2020-01-01"},
        headers=authorization,
    ).status_code == 422
    assert client.patch(
        f"/api/v1/digests/{digest_id}", json={}, headers=authorization
    ).status_code == 422


def test_admin_can_filter_view_update_and_delete_user_digests(
    client: TestClient,
    db_session_factory: sessionmaker[Session],
) -> None:
    owner = _register(client, "managed@example.com", "Managed Owner")
    other = _register(client, "other@example.com", "Other Owner")
    owner_id = owner.json()["user"]["id"]

    managed_digest = client.post(
        "/api/v1/digests",
        json=_digest_payload(topic="Managed digest"),
        headers=_authorization(owner),
    ).json()
    client.post(
        "/api/v1/digests",
        json=_digest_payload(topic="Other digest"),
        headers=_authorization(other),
    )

    super_admin = _super_admin_login(client, db_session_factory)
    admin_access = _authorization(super_admin)
    listed = client.get(
        f"/api/v1/admin/digests?owner_id={owner_id}", headers=admin_access
    )
    assert listed.status_code == 200
    assert listed.json()["total"] == 1
    assert listed.json()["items"][0]["id"] == managed_digest["id"]
    assert listed.json()["items"][0]["owner"]["email"] == "managed@example.com"

    detail = client.get(
        f"/api/v1/admin/digests/{managed_digest['id']}", headers=admin_access
    )
    assert detail.status_code == 200

    updated = client.patch(
        f"/api/v1/admin/digests/{managed_digest['id']}",
        json={"frequency": "monthly"},
        headers=admin_access,
    )
    assert updated.status_code == 200
    assert updated.json()["frequency"] == "monthly"

    deleted = client.delete(
        f"/api/v1/admin/digests/{managed_digest['id']}", headers=admin_access
    )
    assert deleted.status_code == 204

    regular_user_access = _authorization(other)
    assert client.get(
        "/api/v1/admin/digests", headers=regular_user_access
    ).status_code == 403


def test_regular_admin_cannot_access_super_admin_digests(
    client: TestClient,
    db_session_factory: sessionmaker[Session],
) -> None:
    admin = _register(client, "admin.member@example.com", "Team Administrator")
    super_admin = _super_admin_login(client, db_session_factory)
    super_admin_access = _authorization(super_admin)
    super_admin_id = super_admin.json()["user"]["id"]

    assert client.put(
        f"/api/v1/admin/users/{admin.json()['user']['id']}/role",
        json={"role": "admin"},
        headers=super_admin_access,
    ).status_code == 200

    protected_digest = client.post(
        "/api/v1/digests",
        json=_digest_payload(topic="Super-admin digest"),
        headers=super_admin_access,
    ).json()
    admin_access = _authorization(admin)

    filtered = client.get(
        f"/api/v1/admin/digests?owner_id={super_admin_id}", headers=admin_access
    )
    assert filtered.status_code == 200
    assert filtered.json()["total"] == 0
    assert client.get(
        f"/api/v1/admin/digests/{protected_digest['id']}", headers=admin_access
    ).status_code == 404
