from fastapi.testclient import TestClient


PASSWORD = "correct-horse-battery-staple"
REGISTER_PAYLOAD = {
    "email": "profile@example.com",
    "full_name": "Profile Owner",
    "password": PASSWORD,
    "password_confirmation": PASSWORD,
}


def _register(client: TestClient, **overrides):
    return client.post("/api/v1/auth/register", json={**REGISTER_PAYLOAD, **overrides})


def _authorization(response) -> dict[str, str]:
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_user_can_update_own_name_and_email(client: TestClient) -> None:
    registration = _register(client)
    response = client.patch(
        "/api/v1/users/me",
        json={"full_name": "  Updated   Profile  ", "email": "UPDATED@example.com"},
        headers=_authorization(registration),
    )

    assert response.status_code == 200
    assert response.json()["full_name"] == "Updated Profile"
    assert response.json()["email"] == "updated@example.com"


def test_user_cannot_take_an_existing_email(client: TestClient) -> None:
    first = _register(client)
    assert _register(
        client,
        email="another@example.com",
        full_name="Another User",
    ).status_code == 201

    response = client.patch(
        "/api/v1/users/me",
        json={"email": "another@example.com"},
        headers=_authorization(first),
    )
    assert response.status_code == 409


def test_password_change_validates_current_password_and_confirmation(
    client: TestClient,
) -> None:
    registration = _register(client)
    authorization = _authorization(registration)

    wrong_current = client.put(
        "/api/v1/users/me/password",
        json={
            "current_password": "wrong-password",
            "new_password": "a-new-secure-password",
            "new_password_confirmation": "a-new-secure-password",
        },
        headers=authorization,
    )
    assert wrong_current.status_code == 400

    mismatch = client.put(
        "/api/v1/users/me/password",
        json={
            "current_password": PASSWORD,
            "new_password": "a-new-secure-password",
            "new_password_confirmation": "different-password",
        },
        headers=authorization,
    )
    assert mismatch.status_code == 422

    reused = client.put(
        "/api/v1/users/me/password",
        json={
            "current_password": PASSWORD,
            "new_password": PASSWORD,
            "new_password_confirmation": PASSWORD,
        },
        headers=authorization,
    )
    assert reused.status_code == 400


def test_password_change_revokes_sessions_and_updates_login(client: TestClient) -> None:
    registration = _register(client)
    new_password = "a-new-secure-password"
    response = client.put(
        "/api/v1/users/me/password",
        json={
            "current_password": PASSWORD,
            "new_password": new_password,
            "new_password_confirmation": new_password,
        },
        headers=_authorization(registration),
    )
    assert response.status_code == 200
    assert client.post("/api/v1/auth/refresh").status_code == 401

    old_login = client.post(
        "/api/v1/auth/login",
        json={"email": REGISTER_PAYLOAD["email"], "password": PASSWORD},
    )
    assert old_login.status_code == 401

    new_login = client.post(
        "/api/v1/auth/login",
        json={"email": REGISTER_PAYLOAD["email"], "password": new_password},
    )
    assert new_login.status_code == 200
