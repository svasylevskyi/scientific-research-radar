from datetime import date, datetime, timedelta, timezone
from concurrent.futures import ThreadPoolExecutor
import time
import httpx
import pytest
from app.core.config import Settings
from app.services import openai_spending_service as service
from test_admin_users import _authorization, _register, _super_admin_login
from app.models.user import User
from sqlalchemy import select

START, END = service.bounds(date(2026, 1, 1), date(2026, 1, 2))


def page(value="1.25", more=False, cursor=None, day=0, project="proj_test", currency="usd"):
    return {"data": [{"start_time": int((START + timedelta(days=day)).timestamp()),
        "end_time": int((START + timedelta(days=day+1)).timestamp()),
        "results": [{"amount": {"value": value, "currency": currency},
                     "project_id": project, "line_item": "model, input_tokens"}]}],
        "has_more": more, "next_page": cursor}


def mock_transport(monkeypatch, handler):
    original = httpx.Client
    monkeypatch.setattr(service.httpx, "Client", lambda **kwargs: original(transport=httpx.MockTransport(handler), **kwargs))


def test_paginated_exact_totals_and_filter_serialization(monkeypatch):
    requests = []
    def handler(request):
        requests.append(request)
        assert request.url.params.get_list("project_ids[]") == ["proj_test"]
        assert request.url.params.get_list("group_by[]") == ["project_id", "line_item"]
        assert request.headers["authorization"] == "Bearer fake-key"
        assert request.url.params["end_time"] == str(int(END.timestamp()))
        return httpx.Response(200, json=page("0.1", True, "next") if len(requests) == 1 else page("-0.02", day=1))
    mock_transport(monkeypatch, handler)
    result = service.fetch_costs("fake-key", "proj_test", START, END)
    assert requests[1].url.params["page"] == "next"
    assert result["reported_usd"] == "0.08"
    assert result["daily"]["2026-01-02"] == "-0.02"


@pytest.mark.parametrize("response", [page(project="other"), page(currency="eur"),
    page(more=True), {"data": []}, page(value="NaN")])
def test_invalid_provider_data_never_returns_partial_totals(monkeypatch, response):
    mock_transport(monkeypatch, lambda request: httpx.Response(200, json=response))
    with pytest.raises(service.SpendingError):
        service.fetch_costs("fake-key", "proj_test", START, END)


@pytest.mark.parametrize("status", [401, 403, 429, 500])
def test_provider_errors_are_sanitized(monkeypatch, status):
    mock_transport(monkeypatch, lambda request: httpx.Response(status, text="secret-key provider error"))
    with pytest.raises(service.SpendingError) as error:
        service.fetch_costs("secret-key", "proj_test", START, END)
    assert "secret-key" not in str(error.value)


def test_cache_coalesces_concurrent_requests(monkeypatch):
    service._cache.clear()
    calls = []
    def fake(*args):
        calls.append(args)
        time.sleep(0.02)
        return {"reported_usd": "3"}
    monkeypatch.setattr(service, "fetch_costs", fake)
    settings = Settings(environment="test", openai_admin_api_key="fake", openai_costs_project_id="proj_test")
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: service.provider_costs(settings, START, END), range(2)))
    assert len(calls) == 1
    assert results[0] == results[1]
    service._cache.clear()


def test_dates_and_missing_configuration():
    for start, end in [(date(2026, 2, 1), date(2026, 1, 1)), (date(2025, 1, 1), date(2026, 1, 1)),
                       (date(2026, 1, 1), date(2099, 1, 1))]:
        with pytest.raises(service.SpendingError): service.bounds(start, end)
    with pytest.raises(service.SpendingError) as error:
        service.provider_costs(Settings(environment="test"), START, END)
    assert error.value.status_code == 503


def test_super_admin_only_and_empty_report(client, db_session_factory, monkeypatch):
    path = "/api/v1/admin/spending?from_date=2026-01-01&to_date=2026-01-02"
    calls = []
    def fake(*args):
        calls.append(True)
        return {"project_id": "proj_test", "reported_usd": "0", "daily": {}, "charges": [], "fetched_at": START.isoformat()}
    monkeypatch.setattr(service, "provider_costs", fake)
    assert client.get(path).status_code == 401
    member = _register(client)
    headers = _authorization(member)
    assert client.get(path, headers=headers).status_code == 403
    with db_session_factory() as db:
        user = db.scalar(select(User).where(User.email == "member@example.com"))
        user.role = "admin"
        db.commit()
    assert client.get(path, headers=headers).status_code == 403
    assert calls == []
    headers = _authorization(_super_admin_login(client, db_session_factory))
    response = client.get(path, headers=headers)
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    result = response.json()
    assert result["reported_usd"] == "0"
    assert len(result["daily"]) == 2
    assert result["daily"][0]["reported_usd"] is None
    assert result["known_estimated_usd"] == "0"
    assert client.get(path.replace("2026-01-02", "2025-01-01"), headers=headers).status_code == 422


def test_local_estimates_include_unpriced_attempts(client, db_session_factory, monkeypatch):
    from test_digest_runs import _create_digest, _override_runner, _execute_next, RecordingRadarClient
    from app.schemas.radar_pricing import RadarPriceCreate
    from app.services.radar_pricing_service import publish_price
    from app.models.radar_request import RadarRequest
    with db_session_factory() as db:
        publish_price(db, RadarPriceCreate(model_name="recording-test-model", version="v1",
            input_per_million="10", cached_input_per_million="1", output_per_million="50",
            web_search_per_call="0.01", max_input_tokens=272000))
        db.commit()
    headers = _authorization(_register(client))
    digest = _create_digest(client, headers)
    radar = RecordingRadarClient()
    _override_runner(radar)
    assert client.post(f"/api/v1/digests/{digest['id']}/runs", headers=headers).status_code == 202
    _execute_next(db_session_factory, radar)
    monkeypatch.setattr(service, "provider_costs", lambda *args: {
        "project_id": "proj_test", "reported_usd": "1", "daily": {}, "charges": [], "fetched_at": START.isoformat()})
    with db_session_factory() as db:
        request = db.scalar(select(RadarRequest).where(RadarRequest.web_search_calls == 0))
        request.pricing = None
        db.commit()
        day = datetime.now(timezone.utc).date()
        result = service.spending_report(db, Settings(environment="test"), day, day)
        assert float(result["known_estimated_usd"]) == 0.0205
        assert result["unknown_requests"] == 1
        assert result["daily"][0]["requests"] == 4
        assert result["legacy_runs"] == 0
