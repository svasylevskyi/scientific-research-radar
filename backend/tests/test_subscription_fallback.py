from datetime import timedelta, datetime, timezone
from types import SimpleNamespace
from uuid import UUID, uuid4
import pytest
from app.core.config import Settings
from app.models.digest import Digest
from app.models.subscription_access import SubscriptionAccountState, SubscriptionRunUsage
from app.models.stripe_sandbox import SandboxCheckout
from app.services import subscription_access_service as access, stripe_sandbox_service as billing
from app.scheduler.dispatch import ScheduleDispatcher
from test_subscription_access import enrolled, STAMP
from test_subscription_observation import setup, start
from test_digest_runs import RecordingRadarClient, _override_runner, _execute_next
from test_digests import _digest_payload
from test_stripe_sandbox import Provider, account, settings


def test_fallback_preserves_history_and_owner_selection(client, enrolled, db_session_factory):
    data, cid = enrolled
    uid, auth, _, _, original = data
    from app.schemas.digest import DigestCreate
    with db_session_factory() as db:
        second = Digest(id=uuid4(), owner_id=uid, **DigestCreate.model_validate(_digest_payload(maximum_papers=3)).model_dump())
        db.add(second); db.commit(); did = second.id
    url = '/api/v1/subscription/free-digests'
    assert client.put(url, headers=auth, json={'digest_ids': [original['id']]}).status_code == 200
    with db_session_factory() as db:
        db.get(SandboxCheckout, cid).subscription_status = 'canceled'; db.commit()
    current = client.get('/api/v1/subscription', headers=auth).json()
    assert current['billing_type'] == 'free' and current['fallback']
    assert current['active_digest_ids'] == [original['id']]
    assert current['retained_digest_count'] == 2 and current['digest_count'] == 1
    assert client.get(f'/api/v1/admin/users/{uid}', headers=data[2]).json()['subscription_plan_name'] == 'Free'
    assert client.get(f'/api/v1/digests/{did}', headers=auth).status_code == 200
    assert client.get('/api/v1/digests', headers=auth).json()['total'] == 2
    _override_runner(RecordingRadarClient())
    assert client.post(f'/api/v1/digests/{did}/runs', headers=auth).status_code == 403
    preview = client.get(f'/api/v1/subscription?digest_id={did}', headers=auth).json()
    assert not preview['run_allowed'] and 'inactive' in preview['run_reasons'][0]
    assert client.put(url, headers=auth, json={'digest_ids': [str(uuid4())]}).status_code == 404
    assert client.put(url, json={'digest_ids': [str(did)]}).status_code == 401
    assert client.put(url, headers=auth, json={'digest_ids': [str(did)]}).status_code == 200
    assert client.get(f'/api/v1/subscription?digest_id={did}', headers=auth).json()['run_allowed']
    assert client.delete(f'/api/v1/digests/{did}', headers=auth).status_code == 204
    assert client.get('/api/v1/subscription', headers=auth).json()['active_digest_ids'] == [original['id']]


def test_cancellation_boundary_without_final_webhook(client, enrolled, db_session_factory, monkeypatch):
    data, cid = enrolled
    uid, auth = data[:2]
    with db_session_factory() as db:
        row = db.get(SandboxCheckout, cid); row.cancel_at_period_end = True
        end = access.utc(row.period_end); db.commit()
    assert client.get('/api/v1/subscription', headers=auth).json()['billing_type'] == 'stripe'
    monkeypatch.setattr(access, 'now', lambda: end)
    result = client.get('/api/v1/subscription', headers=auth).json()
    assert result['billing_type'] == 'free' and result['fallback']
    with db_session_factory() as db:
        assert access.utc(db.get(SubscriptionAccountState, uid).allowance_anchor) == STAMP


def test_usage_survives_fallback_recovery_and_next_month(client, enrolled, db_session_factory, monkeypatch):
    data, cid = enrolled
    uid, auth = data[:2]
    fake = RecordingRadarClient(); _override_runner(fake)
    rid = start(client, data); _execute_next(db_session_factory, fake)
    with db_session_factory() as db:
        db.get(SandboxCheckout, cid).subscription_status = 'canceled'; db.commit()
    free = client.get('/api/v1/subscription', headers=auth).json()
    assert free['billing_type'] == 'free' and free['remaining']['runs'] == 0
    with db_session_factory() as db:
        db.get(SandboxCheckout, cid).subscription_status = 'active'; db.commit()
    paid = client.get('/api/v1/subscription', headers=auth).json()
    assert paid['billing_type'] == 'stripe' and paid['remaining']['runs'] == 0
    assert paid['period_start'] == free['period_start']
    with db_session_factory() as db:
        db.get(SandboxCheckout, cid).subscription_status = 'canceled'; db.commit()
    monkeypatch.setattr(access, 'now', lambda: access.month_at(STAMP, 1))
    assert client.get('/api/v1/subscription', headers=auth).json()['remaining']['runs'] == 1
    with db_session_factory() as db:
        assert db.get(SubscriptionRunUsage, rid).state == 'settled'


def test_dispatch_pauses_without_page_visit_and_requires_resume(client, enrolled, db_session_factory):
    data, cid = enrolled
    uid, auth, _, _, original = data
    did = UUID(original['id'])
    saved = {'frequency': 'weekly', 'send_email': False, 'starts_at': (STAMP - timedelta(days=7)).isoformat(), 'time_zone': 'UTC'}
    with db_session_factory() as db:
        from app.models.subscription_plan import SubscriptionPlanRevision
        plan = db.get(SubscriptionPlanRevision, data[3]['id'])
        plan.configuration = {**plan.configuration, 'schedule_frequencies': ['weekly']}
        digest = db.get(Digest, did); digest.schedule, digest.schedule_next_at = saved, STAMP
        db.get(SandboxCheckout, cid).subscription_status = 'canceled'; db.commit()
    dispatcher = ScheduleDispatcher(Settings(), db_session_factory, SimpleNamespace(model_name='fake'))
    assert dispatcher.tick(STAMP) == 0
    with db_session_factory() as db:
        digest = db.get(Digest, did)
        assert digest.schedule_paused and digest.schedule == saved and digest.schedule_next_at is None
        db.get(SandboxCheckout, cid).subscription_status = 'active'; db.commit()
    assert client.get('/api/v1/subscription', headers=auth).json()['billing_type'] == 'stripe'
    assert dispatcher.tick(STAMP + timedelta(days=1)) == 0
    preview = client.get(f'/api/v1/digests/{did}/schedule/preview', headers=auth).json()
    assert preview['state'] == 'waiting_for_subscription' and 'paused' in preview['subscription_message']
    updated = client.put(f'/api/v1/digests/{did}/schedule', headers=auth, json=saved)
    assert updated.status_code == 200, updated.text
    assert not updated.json()['schedule_paused']
    assert access.utc(datetime.fromisoformat(updated.json()['schedule_next_at'].replace('Z', '+00:00'))) > datetime.now(timezone.utc)


def test_cancel_portal_scoping_and_immediate_mode_rejection(account, db_session_factory):
    provider = Provider(); uid = account[0]
    with db_session_factory() as db:
        billing.start_checkout(db, settings(), uid, 1, 'monthly', client=provider.client)
        sub = provider.complete(); billing.refresh(db, settings(), uid, client=provider.client)
        result = billing.portal(db, settings(), uid, client=provider.client, subscriber=True, cancel=True)
        assert result['url'].startswith('https://billing.stripe.com/')
        body = provider.calls[-1][2]
        assert body['flow_data[type]'] == 'subscription_cancel'
        assert body['flow_data[subscription_cancel][subscription]'] == sub['id'] and body['customer'] == sub['customer']
        assert not billing.latest(db, uid).cancel_at_period_end
        original = provider.client.request
        def immediate(method, path, **kwargs):
            value = original(method, path, **kwargs)
            if path.startswith('billing_portal/configurations/'):
                value['features']['subscription_cancel']['mode'] = 'immediately'
            return value
        provider.client.request = immediate
        with pytest.raises(billing.Error, match='period end'):
            billing.portal(db, settings(), uid, client=provider.client, subscriber=True, cancel=True)
