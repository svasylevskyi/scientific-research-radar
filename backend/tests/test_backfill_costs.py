from sqlalchemy import select
from app.models.radar_request import RadarRequest
from app.models.digest_run import DigestRun
from app.radar.backfill_costs import backfill
from app.services.radar_cost_service import estimate
from app.services.radar_pricing_service import publish_price
from test_latest_run_and_pricing import tariff
from test_digests import _register, _authorization, _digest_payload
from test_digest_runs import RecordingRadarClient, _override_runner, _execute_next


def test_backfill_preview_apply_repeat_and_missing_data(client, db_session_factory):
    radar = RecordingRadarClient()
    headers = _authorization(_register(client, "backfill@example.com", "Backfill"))
    digest = client.post("/api/v1/digests", json=_digest_payload(), headers=headers).json()
    _override_runner(radar)
    client.post(f"/api/v1/digests/{digest['id']}/runs", headers=headers)
    _execute_next(db_session_factory, radar)
    with db_session_factory() as db:
        rows = list(db.scalars(select(RadarRequest).order_by(RadarRequest.id)))
        assert len(rows) == 4
        assert all(r.pricing is None for r in rows)
        publish_price(db, tariff(radar.model_name))
        rows[0].usage = None
        rows[1].model_name = "unconfigured-model"
        db.commit()
        result = backfill(db)
        assert [r['action'] for r in result] == ['skipped', 'skipped', 'would_update', 'would_update']
        db.commit()
        assert all(r.pricing is None for r in rows)
        result = backfill(db, apply=True, run_id=rows[0].run_id)
        db.commit()
        assert sum(r['action'] == 'updated' for r in result) == 2
        assert estimate(rows[2]) is not None
        assert rows[2].pricing['backfill']['previous_pricing'] is None
        assert not any(r['action'] == 'updated' for r in backfill(db, apply=True, reprice_known=True))
        updated = tariff(radar.model_name, '20').model_copy(update={'version': 'v2'})
        publish_price(db, updated)
        db.commit()
        assert not any(r['action'] == 'updated' for r in backfill(db, apply=True))
        assert sum(r['action'] == 'updated' for r in backfill(db, apply=True, reprice_known=True)) == 2
        db.commit()
        assert rows[2].pricing['backfill']['previous_pricing']['version'] == 'v1'
        run = db.get(DigestRun, rows[0].run_id)
        run.status = 'running'
        db.commit()
        assert backfill(db, apply=True, reprice_known=True) == []
