from decimal import Decimal
from sqlalchemy import select
from app.models.radar_request import RadarRequest
from app.models.digest_run import DigestRun
from app.services.radar_cost_service import run_costs
from app.services.radar_pricing_service import publish_price
from test_latest_run_and_pricing import tariff
from test_digests import _register, _authorization, _digest_payload, _super_admin_login
from test_digest_runs import RecordingRadarClient, _override_runner, _execute_next


def test_admin_digest_total_includes_failures_and_unknowns(client, db_session_factory):
    radar = RecordingRadarClient()
    headers = _authorization(_register(client, "total@example.com", "Total"))
    admin = _authorization(_super_admin_login(client, db_session_factory))
    digest = client.post('/api/v1/digests', json=_digest_payload(), headers=headers).json()
    url = f"/api/v1/admin/digests/{digest['id']}/costs"
    assert client.get(url, headers=headers).status_code == 403
    empty = client.get(url, headers=admin).json()
    assert empty['run_count'] == 0 and empty['known_estimated_usd'] == '0' and empty['complete']
    with db_session_factory() as db:
        publish_price(db, tariff(radar.model_name))
        db.commit()
    _override_runner(radar)
    for _ in range(2):
        assert client.post(f"/api/v1/digests/{digest['id']}/runs", headers=headers).status_code == 202
        _execute_next(db_session_factory, radar)
    with db_session_factory() as db:
        runs = list(db.scalars(select(DigestRun)))
        runs[0].status = 'failed'
        db.commit()
        expected = sum(Decimal(run_costs(db, run)['known_estimated_usd']) for run in runs)
    total = client.get(url, headers=admin).json()
    assert total['run_count'] == 2 and total['complete']
    assert Decimal(total['known_estimated_usd']) == expected
    with db_session_factory() as db:
        request = db.scalar(select(RadarRequest))
        request.pricing = None
        runs = list(db.scalars(select(DigestRun)))
        runs[0].request_count += 1  # Legacy request missing from the ledger.
        db.commit()
    total = client.get(url, headers=admin).json()
    assert not total['complete'] and total['unknown_requests'] == 1
    assert total['incomplete_runs'] >= 1
    assert Decimal(total['known_estimated_usd']) < expected
