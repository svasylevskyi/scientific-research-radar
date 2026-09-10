from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import UUID, uuid4
import pytest
from sqlalchemy import select, event
from app.models.digest_run import DigestRun
from app.models.radar_request import RadarRequest
from app.models.radar_price import RadarPrice
from app.repositories.digest_repository import DigestRepository
from app.services.radar_pricing_service import publish_price, current_price
from app.schemas.radar_pricing import RadarPriceCreate
from app.services.radar_cost_service import estimate, unknown_cost_reason
from test_digests import _register, _authorization, _digest_payload, _super_admin_login
from test_digest_runs import RecordingRadarClient, _override_runner, _execute_next
from test_radar_costs import request


def test_latest_success_is_loaded_for_both_lists_and_ignores_failures(client, db_session_factory):
    user = _register(client, "latest@example.com", "Latest Run")
    headers = _authorization(user)
    digest = client.post("/api/v1/digests", json=_digest_payload(), headers=headers).json()
    empty = client.post("/api/v1/digests", json=_digest_payload(topic="Empty digest"), headers=headers).json()
    latest = datetime(2026, 9, 1, 12, 30, tzinfo=timezone.utc)
    def run(status, when, digest_id):
        return DigestRun(id=uuid4(), digest_id=UUID(digest_id), owner_id=UUID(digest["owner_id"]),
            status=status, trigger="manual", digest_snapshot={}, history_context=[],
            model_name="test", prompt_version="test", started_at=when-timedelta(minutes=5), completed_at=when)
    with db_session_factory() as db:
        db.add_all([run("completed", latest-timedelta(days=3), digest["id"]),
                    run("completed", latest, digest["id"]),
                    run("failed", latest+timedelta(days=1), digest["id"]),
                    run("failed", latest, empty["id"])])
        db.commit()
        statements = []
        def observe(*args): statements.append(args[2])
        event.listen(db.bind, "before_cursor_execute", observe)
        try:
            values = DigestRepository(db).list_for_owner(owner_id=UUID(digest["owner_id"]), offset=0, limit=10)
            assert [v.latest_successful_run_at for v in values]
            assert len(statements) == 1  # No per-digest run-history fetch.
        finally:
            event.remove(db.bind, "before_cursor_execute", observe)
    admin_headers = _authorization(_super_admin_login(client, db_session_factory))
    for path, auth in [("/api/v1/digests", headers), ("/api/v1/admin/digests", admin_headers)]:
        items = {d["id"]: d for d in client.get(path, headers=auth).json()["items"]}
        assert items[digest["id"]]["latest_successful_run_at"].startswith("2026-09-01T12:30:00")
        assert items[empty["id"]]["latest_successful_run_at"] is None


def tariff(model, rate="10"):
    return RadarPriceCreate(model_name=model, version="v1", input_per_million=rate,
        cached_input_per_million="1", output_per_million="50", web_search_per_call="0.01", max_input_tokens=272000)


@pytest.mark.parametrize("configured", ["requested", "returned", "both"])
def test_model_resolution_does_not_discard_configured_price(client, db_session_factory, configured):
    requested, returned = "recording-test-model", "recording-test-model-2026-09-10"
    with db_session_factory() as db:
        if configured in {"requested", "both"}: publish_price(db, tariff(requested))
        if configured in {"returned", "both"}: publish_price(db, tariff(returned, "20"))
        db.commit()
    class ResolvedClient(RecordingRadarClient):
        def execute(self, prompt, **kwargs):
            callback = kwargs["on_usage"]
            def observe(value):
                if value["event"] == "response": value = {**value, "model_name": returned}
                callback(value)
            return super().execute(prompt, **{**kwargs, "on_usage": observe})
    radar = ResolvedClient()
    headers = _authorization(_register(client, "pricing@example.com", "Pricing Test"))
    digest = client.post("/api/v1/digests", json=_digest_payload(), headers=headers).json()
    _override_runner(radar)
    assert client.post(f"/api/v1/digests/{digest['id']}/runs", headers=headers).status_code == 202
    _execute_next(db_session_factory, radar)
    with db_session_factory() as db:
        rows = list(db.scalars(select(RadarRequest)))
        assert len(rows) == 4
        for row in rows:
            assert row.model_name == returned
            assert row.pricing["model_name"] == (requested if configured == "requested" else returned)
            assert row.pricing["input_per_million"] == ("10" if configured == "requested" else "20")
            assert estimate(row) is not None


def test_price_lookup_cannot_take_a_version_published_after_submission(db_session_factory):
    with db_session_factory() as db:
        row = publish_price(db, tariff("test"))
        db.commit()
        assert current_price(db, "test", as_of=row.created_at-timedelta(seconds=1)) is None
        assert current_price(db, "test", as_of=row.created_at)["version"] == "v1"


def test_cache_writes_are_charged_once_and_require_an_explicit_rate():
    item = request()
    item.usage["cache_write_tokens"] = 200
    assert "no cache-write rate" in unknown_cost_reason(item)
    item.pricing["cache_write_per_million"] = "12.50"
    # 400 normal input + 400 cached + 200 writes + 200 output + two searches.
    assert estimate(item) == Decimal("0.0369")
    item.usage["cache_write_tokens"] = 700
    assert estimate(item) is None
    assert "exceed total" in unknown_cost_reason(item)
