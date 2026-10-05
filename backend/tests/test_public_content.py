from sqlalchemy import select

from app.models.user import User
from test_admin_users import _authorization, _register, _super_admin_login


def test_public_content_is_versioned_and_super_admin_published(client, db_session_factory):
    public_url = "/api/v1/content/about"
    admin_url = "/api/v1/admin/content-pages/about"

    assert client.get(public_url).status_code == 200
    assert client.get(public_url).json() is None
    assert client.get(admin_url).status_code == 401

    member = _register(client)
    member_headers = _authorization(member)
    assert client.get(admin_url, headers=member_headers).status_code == 403
    assert client.put(admin_url, headers=member_headers, json={
        "expected_revision": 0,
        "title": "About",
        "body_markdown": "Hello",
        "change_note": "Attempt",
    }).status_code == 403

    with db_session_factory() as db:
        user = db.scalar(select(User).where(User.email == "member@example.com"))
        assert user is not None
        user.role = "admin"
        db.commit()

    assert client.get(admin_url, headers=member_headers).status_code == 200
    assert client.get(admin_url, headers=member_headers).json() is None
    assert client.put(admin_url, headers=member_headers, json={
        "expected_revision": 0,
        "title": "About",
        "body_markdown": "Hello",
        "change_note": "Attempt",
    }).status_code == 403

    super_headers = _authorization(_super_admin_login(client, db_session_factory))
    first = client.put(admin_url, headers=super_headers, json={
        "expected_revision": 0,
        "title": "About Radar",
        "body_markdown": "## Why Radar\n\nUseful research.",
        "change_note": "Initial admin-managed copy",
    })
    assert first.status_code == 200
    assert first.json()["revision"] == 1
    assert first.json()["created_by_name"]
    assert client.get(public_url).json()["body_markdown"].startswith("## Why Radar")

    stale = client.put(admin_url, headers=super_headers, json={
        "expected_revision": 0,
        "title": "Stale",
        "body_markdown": "Old",
        "change_note": "Should fail",
    })
    assert stale.status_code == 409
    assert client.get(public_url).json()["revision"] == 1

    second = client.put(admin_url, headers=super_headers, json={
        "expected_revision": 1,
        "title": "About Scientific Research Radar",
        "body_markdown": "## Updated\n\nNew copy.",
        "change_note": "Reviewed update",
    })
    assert second.status_code == 200
    assert second.json()["revision"] == 2

    history = client.get(admin_url + "/history", headers=member_headers)
    assert history.status_code == 200
    assert history.json()["total"] == 2
    assert [item["revision"] for item in history.json()["items"]] == [2, 1]


def test_public_content_validation_and_slug_scope(client, db_session_factory):
    headers = _authorization(_super_admin_login(client, db_session_factory))
    url = "/api/v1/admin/content-pages/privacy"

    assert client.put(url, headers=headers, json={
        "expected_revision": 0,
        "title": " ",
        "body_markdown": "Content",
        "change_note": "Reason",
    }).status_code == 422
    assert client.put(url, headers=headers, json={
        "expected_revision": 0,
        "title": "Privacy notice",
        "body_markdown": " ",
        "change_note": "Reason",
    }).status_code == 422
    assert client.get("/api/v1/content/not-a-page").status_code == 422
