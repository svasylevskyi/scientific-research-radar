import pytest

from app.core.security import hash_password
from app.repositories.user_repository import UserRepository


@pytest.mark.parametrize("password,accepted", [
    ("Ab1!xyz", False),
    ("abcdefgh1!", False),
    ("ABCDEFGH1!", False),
    ("Abcdefgh!", False),
    ("Abcdefgh1", False),
    ("Abcdefg1 ", False),
    ("Abcdefg1\n", False),
    ("Ab1!" + "x" * 125, False),
    ("Ab1!xyzw", True),
    ("Ab1_xyzw", True),
    ("Ab1!" + "x" * 124, True),
])
@pytest.mark.parametrize("flow", ["registration", "password_change"])
def test_password_policy_enforced_by_api(client, password, accepted, flow):
    email = "policy@example.com"
    original = "Original-password1!"
    registration = {
        "email": email, "full_name": "Policy User",
        "password": original, "password_confirmation": original,
    }
    if flow == "registration":
        response = client.register_verified( json={
            **registration, "password": password, "password_confirmation": password,
        })
        assert response.status_code == (201 if accepted else 422)
        if not accepted:
            assert client.register_verified( json=registration).status_code == 201
    else:
        registered = client.register_verified( json=registration)
        response = client.put("/api/v1/users/me/password", json={
            "current_password": original,
            "new_password": password, "new_password_confirmation": password,
        }, headers={"Authorization": f"Bearer {registered.json()['access_token']}"})
        assert response.status_code == (200 if accepted else 422)
        login_password = password if accepted else original
        assert client.post("/api/v1/auth/login", json={
            "email": email, "password": login_password,
        }).status_code == 200


def test_existing_weak_password_can_login_and_be_changed(client, db_session_factory):
    old_password = "legacy-password"
    with db_session_factory() as db:
        UserRepository(db).create(
            email="legacy@example.com", full_name="Legacy User",
            password_hash=hash_password(old_password),
        )
        db.commit()
    login = client.post("/api/v1/auth/login", json={
        "email": "legacy@example.com", "password": old_password,
    })
    assert login.status_code == 200
    response = client.put("/api/v1/users/me/password", json={
        "current_password": old_password,
        "new_password": "New-password1!", "new_password_confirmation": "New-password1!",
    }, headers={"Authorization": f"Bearer {login.json()['access_token']}"})
    assert response.status_code == 200
