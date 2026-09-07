from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import func, select

from app.models.digest_run import DigestRun
from test_digests import _authorization, _digest_payload, _register


def schedule_payload(**changes):
    start = datetime.now(timezone.utc) + timedelta(days=1)
    return {
        "frequency": "weekly",
        "starts_at": start.isoformat(),
        "ends_at": (start + timedelta(days=30)).isoformat(),
        "time_zone": "Europe/Warsaw",
    } | changes


def test_schedule_is_saved_replaced_and_does_not_create_runs(client, db_session_factory):
    auth = _authorization(_register(client, "scheduler@example.com", "Scheduler"))
    payload = _digest_payload()
    del payload["frequency"]
    digest = client.post("/api/v1/digests", json=payload, headers=auth).json()
    assert digest["frequency"] is None
    assert digest["schedule"] is None
    path = f"/api/v1/digests/{digest['id']}"
    created = client.put(f"{path}/schedule", json=schedule_payload(), headers=auth)
    assert created.status_code == 200
    first = created.json()["schedule"]
    assert client.get(path, headers=auth).json()["schedule"] == first

    updated = client.put(f"{path}/schedule", json=schedule_payload(frequency="monthly", ends_at=None), headers=auth)
    assert updated.status_code == 200
    saved = updated.json()["schedule"]
    assert saved["frequency"] == "monthly"
    assert saved["ends_at"] is None
    assert client.get("/api/v1/digests", headers=auth).json()["items"][0]["schedule"] == saved
    # Updating research details must not wipe or alter saved schedule preferences.
    edited = client.patch(path, json={"topic": "Refined topic", "frequency": None}, headers=auth)
    assert edited.status_code == 200
    assert edited.json()["schedule"] == saved
    with db_session_factory() as db:
        assert db.scalar(select(func.count()).select_from(DigestRun)) == 0
    assert client.get(f"{path}/runs", headers=auth).json()["total"] == 0
    assert client.delete(path, headers=auth).status_code == 204
    assert client.put(f"{path}/schedule", json=schedule_payload(), headers=auth).status_code == 404


def test_schedule_requires_owner(client):
    owner = _authorization(_register(client, "schedule-owner@example.com", "Owner"))
    other = _authorization(_register(client, "schedule-other@example.com", "Other"))
    digest = client.post("/api/v1/digests", json=_digest_payload(), headers=owner).json()
    path = f"/api/v1/digests/{digest['id']}/schedule"
    assert client.put(path, json=schedule_payload(), headers=other).status_code == 404
    client.cookies.clear()
    assert client.put(path, json=schedule_payload()).status_code == 401
    assert client.get(f"/api/v1/digests/{digest['id']}", headers=owner).json()["schedule"] is None


@pytest.mark.parametrize("changes", [
    {"frequency": "yearly"}, {"frequency": None},
    {"starts_at": "not-a-date"}, {"starts_at": "2030-01-01T12:00:00"},
    {"ends_at": "2000-01-01T12:00:00Z"},
    {"starts_at": "2030-01-01T12:00:00Z", "ends_at": "2030-01-01T13:00:00+01:00"},
    {"time_zone": "Invalid/Zone"}, {"enabled": True},
])
def test_invalid_schedule_does_not_change_saved_values(client, changes):
    auth = _authorization(_register(client, "schedule-validation@example.com", "Owner"))
    digest = client.post("/api/v1/digests", json=_digest_payload(), headers=auth).json()
    path = f"/api/v1/digests/{digest['id']}"
    good = client.put(f"{path}/schedule", json=schedule_payload(), headers=auth).json()["schedule"]
    assert client.put(f"{path}/schedule", json=schedule_payload(**changes), headers=auth).status_code == 422
    assert client.get(path, headers=auth).json()["schedule"] == good


def test_schedule_normalizes_offsets_and_accepts_no_end(client):
    auth = _authorization(_register(client, "schedule-time@example.com", "Owner"))
    digest = client.post("/api/v1/digests", json=_digest_payload(frequency=None), headers=auth).json()
    payload = schedule_payload(starts_at="2030-01-01T12:00:00+01:00")
    del payload["ends_at"]
    response = client.put(f"/api/v1/digests/{digest['id']}/schedule", json=payload, headers=auth)
    assert response.status_code == 200
    assert response.json()["schedule"]["starts_at"] == "2030-01-01T11:00:00Z"
    assert response.json()["schedule"]["ends_at"] is None
