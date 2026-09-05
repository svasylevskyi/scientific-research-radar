from fastapi.testclient import TestClient


REGISTER_PAYLOAD = {
    "email": "researcher@example.com",
    "full_name": "Ada Researcher",
    "password": "correct-horse-battery-staple",
    "password_confirmation": "correct-horse-battery-staple",
}


def register(client: TestClient):
    return client.post("/api/v1/auth/register", json=REGISTER_PAYLOAD)


def test_register_sets_session_and_returns_user(client: TestClient) -> None:
    response = register(client)
    assert response.status_code == 201
    body = response.json()
    assert body["user"]["email"] == REGISTER_PAYLOAD["email"]
    assert body["user"]["role"] == "user"
    assert body["token_type"] == "bearer"
    assert body["access_token"]
    assert "research_radar_refresh" in response.cookies


def test_register_rejects_duplicate_email_case_insensitively(client: TestClient) -> None:
    assert register(client).status_code == 201
    duplicate = {**REGISTER_PAYLOAD, "email": "RESEARCHER@example.com"}
    response = client.post("/api/v1/auth/register", json=duplicate)
    assert response.status_code == 409


def test_register_rejects_password_mismatch(client: TestClient) -> None:
    response = client.post(
        "/api/v1/auth/register",
        json={**REGISTER_PAYLOAD, "password_confirmation": "different-password"},
    )
    assert response.status_code == 422


def test_login_and_protected_current_user(client: TestClient) -> None:
    register(client)
    login = client.post(
        "/api/v1/auth/login",
        json={"email": REGISTER_PAYLOAD["email"], "password": REGISTER_PAYLOAD["password"]},
    )
    assert login.status_code == 200

    me = client.get(
        "/api/v1/users/me",
        headers={"Authorization": f"Bearer {login.json()['access_token']}"},
    )
    assert me.status_code == 200
    assert me.json()["full_name"] == REGISTER_PAYLOAD["full_name"]


def test_login_rejects_wrong_password(client: TestClient) -> None:
    register(client)
    response = client.post(
        "/api/v1/auth/login",
        json={"email": REGISTER_PAYLOAD["email"], "password": "wrong-password"},
    )
    assert response.status_code == 401


def test_refresh_rotates_token_and_logout_revokes_session(client: TestClient) -> None:
    initial = register(client)
    first_refresh = initial.cookies["research_radar_refresh"]

    refreshed = client.post("/api/v1/auth/refresh")
    assert refreshed.status_code == 200
    second_refresh = refreshed.cookies["research_radar_refresh"]
    assert first_refresh != second_refresh

    assert client.post("/api/v1/auth/logout").status_code == 200
    assert client.post("/api/v1/auth/refresh").status_code == 401


def test_protected_route_requires_access_token(client: TestClient) -> None:
    response = client.get("/api/v1/users/me")
    assert response.status_code == 401
