import json
from sqlalchemy import select
from app.models.user import User
from app.models.radar_price import RadarPrice
from app.schemas.radar_pricing import RadarPriceCreate
from app.services.radar_pricing_service import current_price, publish_price
from app.radar.import_pricing import import_prices
from test_admin_users import _register, _authorization, _super_admin_login

PAYLOAD = {"model_name": "test-model", "version": "v1", "input_per_million": "10",
           "cached_input_per_million": "1", "output_per_million": "50",
           "web_search_per_call": "0.01", "max_input_tokens": 272000}


def test_only_super_admin_can_read_and_publish_prices(client, db_session_factory):
    assert client.get("/api/v1/admin/pricing").status_code == 401
    member = _register(client)
    headers = _authorization(member)
    for admin in (False, True):
        if admin:
            with db_session_factory() as db:
                user = db.scalar(select(User).where(User.email == "member@example.com"))
                user.role = "admin"
                db.commit()
        assert client.get("/api/v1/admin/pricing", headers=headers).status_code == 403
        assert client.post("/api/v1/admin/pricing", json=PAYLOAD, headers=headers).status_code == 403
    super_headers = _authorization(_super_admin_login(client, db_session_factory))
    first = client.post("/api/v1/admin/pricing", json=PAYLOAD, headers=super_headers)
    assert first.status_code == 201
    assert first.json()["created_by"] is not None
    assert client.post("/api/v1/admin/pricing", json=PAYLOAD, headers=super_headers).status_code == 409
    assert client.post("/api/v1/admin/pricing", json={**PAYLOAD, "input_per_million": -1}, headers=super_headers).status_code == 422
    assert client.post("/api/v1/admin/pricing", json={**PAYLOAD, "version": "   "}, headers=super_headers).status_code == 422
    second = client.post("/api/v1/admin/pricing", json={**PAYLOAD, "version": "v2", "input_per_million": "12"}, headers=super_headers)
    assert second.status_code == 201
    listed = client.get("/api/v1/admin/pricing", headers=super_headers).json()
    assert listed["total"] == 2
    assert [r["is_current"] for r in listed["items"]] == [True, False]
    assert listed["items"][1]["input_per_million"] == "10"
    assert client.patch(f"/api/v1/admin/pricing/{first.json()['id']}", json=PAYLOAD, headers=super_headers).status_code in (404, 405)


def test_import_is_idempotent_and_does_not_override_published_rates(db_session_factory):
    raw = json.dumps({"test-model": {k: v for k, v in PAYLOAD.items() if k != "model_name"}})
    with db_session_factory() as db:
        assert import_prices(db, raw) == 1
        db.commit()
        assert import_prices(db, raw) == 0
        before = current_price(db, "test-model")
        publish_price(db, RadarPriceCreate(**{**PAYLOAD, "version": "v2", "input_per_million": "20"}))
        db.commit()
        assert import_prices(db, raw) == 0
        assert current_price(db, "test-model")["input_per_million"] == "20"
        assert before["input_per_million"] == "10"
        assert current_price(db, "missing") is None
