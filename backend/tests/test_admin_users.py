from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.core.security import hash_password, verify_password
from app.models.user import User
from app.services.super_admin_service import ensure_super_admin


USER_PAYLOAD = {
    "email": "member@example.com",
    "full_name": "Research Member",
    "password": "correct-horse-battery-staple",
    "password_confirmation": "correct-horse-battery-staple",
}


def _register(client: TestClient, **overrides):
    return client.post("/api/v1/auth/register", json={**USER_PAYLOAD, **overrides})


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


def test_registered_user_is_a_regular_user_and_cannot_access_admin_api(
    client: TestClient,
) -> None:
    registration = _register(client)
    assert registration.status_code == 201
    assert registration.json()["user"]["role"] == "user"
    assert registration.json()["user"]["is_super_admin"] is False

    response = client.get("/api/v1/admin/users", headers=_authorization(registration))
    assert response.status_code == 403


def test_super_admin_bootstrap_is_idempotent_and_active(
    db_session_factory: sessionmaker[Session],
) -> None:
    settings = get_settings()
    with db_session_factory() as db:
        first = ensure_super_admin(db, settings)
        first.password_hash = hash_password("profile-managed-password")
        db.commit()
        second = ensure_super_admin(db, settings)
        count = db.scalar(select(func.count()).select_from(User))

    assert first.id == second.id
    assert count == 1
    assert second.role == "admin"
    assert second.is_active is True
    assert second.is_super_admin is True
    assert verify_password("profile-managed-password", second.password_hash)


def test_admin_can_list_view_update_promote_demote_and_delete_user(
    client: TestClient,
    db_session_factory: sessionmaker[Session],
) -> None:
    registration = _register(client)
    member_id = registration.json()["user"]["id"]
    member_access = _authorization(registration)
    admin_login = _super_admin_login(client, db_session_factory)
    assert admin_login.status_code == 200
    admin_access = _authorization(admin_login)

    listed = client.get("/api/v1/admin/users?q=member", headers=admin_access)
    assert listed.status_code == 200
    assert listed.json()["total"] == 1
    assert listed.json()["items"][0]["id"] == member_id

    detail = client.get(f"/api/v1/admin/users/{member_id}", headers=admin_access)
    assert detail.status_code == 200

    updated = client.patch(
        f"/api/v1/admin/users/{member_id}",
        json={
            "full_name": "Updated Member",
            "email": "updated.member@example.com",
            "is_active": False,
        },
        headers=admin_access,
    )
    assert updated.status_code == 200
    assert updated.json()["full_name"] == "Updated Member"
    assert updated.json()["is_active"] is False
    assert client.get("/api/v1/users/me", headers=member_access).status_code == 401

    promoted = client.put(
        f"/api/v1/admin/users/{member_id}/role",
        json={"role": "admin"},
        headers=admin_access,
    )
    assert promoted.status_code == 200
    assert promoted.json()["role"] == "admin"

    demoted = client.put(
        f"/api/v1/admin/users/{member_id}/role",
        json={"role": "user"},
        headers=admin_access,
    )
    assert demoted.status_code == 200
    assert demoted.json()["role"] == "user"

    deleted = client.delete(f"/api/v1/admin/users/{member_id}", headers=admin_access)
    assert deleted.status_code == 204
    assert client.get(f"/api/v1/admin/users/{member_id}", headers=admin_access).status_code == 404


def test_super_admin_cannot_be_deactivated_demoted_or_deleted(
    client: TestClient,
    db_session_factory: sessionmaker[Session],
) -> None:
    admin_login = _super_admin_login(client, db_session_factory)
    admin_access = _authorization(admin_login)
    admin_id = admin_login.json()["user"]["id"]

    listed = client.get("/api/v1/admin/users", headers=admin_access)
    assert listed.status_code == 200
    assert any(user["id"] == admin_id for user in listed.json()["items"])

    update_details = client.patch(
        f"/api/v1/admin/users/{admin_id}",
        json={"full_name": "Updated System Administrator"},
        headers=admin_access,
    )

    deactivate = client.patch(
        f"/api/v1/admin/users/{admin_id}",
        json={"is_active": False},
        headers=admin_access,
    )
    demote = client.put(
        f"/api/v1/admin/users/{admin_id}/role",
        json={"role": "user"},
        headers=admin_access,
    )
    delete = client.delete(f"/api/v1/admin/users/{admin_id}", headers=admin_access)

    assert update_details.status_code == 200
    assert update_details.json()["full_name"] == "Updated System Administrator"
    assert deactivate.status_code == 403
    assert demote.status_code == 403
    assert delete.status_code == 403


def test_admin_cannot_remove_their_own_access(
    client: TestClient,
    db_session_factory: sessionmaker[Session],
) -> None:
    registration = _register(client, email="team.admin@example.com")
    admin_id = registration.json()["user"]["id"]
    super_admin_login = _super_admin_login(client, db_session_factory)
    super_admin_access = _authorization(super_admin_login)
    assert client.put(
        f"/api/v1/admin/users/{admin_id}/role",
        json={"role": "admin"},
        headers=super_admin_access,
    ).status_code == 200

    admin_login = client.post(
        "/api/v1/auth/login",
        json={"email": "team.admin@example.com", "password": USER_PAYLOAD["password"]},
    )
    admin_access = _authorization(admin_login)
    super_admin_id = super_admin_login.json()["user"]["id"]

    listed = client.get("/api/v1/admin/users", headers=admin_access)
    assert listed.status_code == 200
    assert listed.json()["total"] == 1
    assert all(user["id"] != super_admin_id for user in listed.json()["items"])

    assert client.patch(
        f"/api/v1/admin/users/{admin_id}",
        json={"is_active": False},
        headers=admin_access,
    ).status_code == 403
    assert client.put(
        f"/api/v1/admin/users/{admin_id}/role",
        json={"role": "user"},
        headers=admin_access,
    ).status_code == 403
    assert client.delete(
        f"/api/v1/admin/users/{admin_id}", headers=admin_access
    ).status_code == 403

    assert client.get(
        f"/api/v1/admin/users/{super_admin_id}", headers=admin_access
    ).status_code == 403
    assert client.patch(
        f"/api/v1/admin/users/{super_admin_id}",
        json={"full_name": "Unauthorized Update"},
        headers=admin_access,
    ).status_code == 403
    assert client.put(
        f"/api/v1/admin/users/{super_admin_id}/role",
        json={"role": "admin"},
        headers=admin_access,
    ).status_code == 403
    assert client.delete(
        f"/api/v1/admin/users/{super_admin_id}", headers=admin_access
    ).status_code == 403
