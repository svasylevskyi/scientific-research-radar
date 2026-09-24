from copy import deepcopy
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4
from urllib.parse import parse_qs
import httpx
import pytest
from sqlalchemy import select, func
from app.core.config import get_settings
from app.models.subscription_change import SubscriptionChange as Change, BillingNotification as Notice
from app.models.subscription_plan import SubscriptionPlanRevision as Plan
from app.models.subscription_access import SubscriptionAccountState, SubscriptionRunUsage
from app.models.billing_invoice import BillingInvoice
from app.models.digest import Digest
from app.services import stripe_sandbox_service as billing, subscription_change_service as changes
from app.services import subscription_access_service as access, billing_notification_service as notices
from test_stripe_sandbox import account, Provider
from test_subscriber_billing import subscriber
from test_billing_invoices import invoice
from test_digests import _authorization, _register, _digest_payload

URL = '/api/v1/subscription/billing'


class Schedules:
    def __init__(self, provider):
        self.provider, self.rows, self.keys = provider, {}, {}
        self.fail_after = None
        self.calls = []
        original = provider.client.request
        def request(method, path, *, data=None, idempotency_key=None):
            if not path.startswith('subscription_schedules'):
                return original(method, path, data=data, idempotency_key=idempotency_key)
            self.calls.append((method, path, deepcopy(data), idempotency_key))
            sid = path.split('/')[1] if '/' in path else None
            if method == 'GET':
                return deepcopy(self.rows[sid])
            if idempotency_key in self.keys:
                saved, value = self.keys[idempotency_key]
                assert saved == data
                return deepcopy(value)
            if path == 'subscription_schedules':
                sub = provider.subscriptions[data['from_subscription']]
                assert not sub.get('schedule')
                sid = 'sub_sched_' + str(len(self.rows) + 1)
                item = sub['items']['data'][0]
                value = {'id': sid, 'object': 'subscription_schedule', 'livemode': False,
                    'customer': sub['customer'], 'subscription': sub['id'], 'status': 'active', 'metadata': {},
                    'current_phase': {'start_date': item['current_period_start'], 'end_date': item['current_period_end']},
                    'phases': [{'start_date': item['current_period_start'], 'end_date': item['current_period_end'],
                        'items': [{'price': item['price']['id'], 'quantity': 1}]}]}
                sub['schedule'] = sid
            else:
                value = self.rows[sid]
                sub = provider.subscriptions[value.get('subscription') or value.get('released_subscription')]
                if path.endswith('/release'):
                    value.update(status='released', released_subscription=sub['id'], subscription=None, released_at=int(changes.now().timestamp()))
                    sub['schedule'] = None
                else:
                    value['end_behavior'] = data['end_behavior']
                    value['metadata'] = {'radar_change_id': data['metadata[radar_change_id]']}
                    value['phases'] = [{'start_date': int(data[f'phases[{i}][start_date]']),
                        'end_date': int(data['phases[0][end_date]']) if i == 0 else int(data['phases[1][start_date]']) + 366 * 86400,
                        'billing_cycle_anchor': data.get(f'phases[{i}][billing_cycle_anchor]'),
                        'proration_behavior': data[f'phases[{i}][proration_behavior]'],
                        'items': [{'price': data[f'phases[{i}][items][0][price]'], 'quantity': 1}]} for i in (0, 1)]
            self.rows[sid] = deepcopy(value)
            self.keys[idempotency_key] = deepcopy(data), deepcopy(value)
            if self.fail_after and self.fail_after in idempotency_key:
                self.fail_after = None
                raise billing.Error('Ambiguous provider timeout.', 503)
            return deepcopy(value)
        provider.client.request = request


@pytest.fixture
def changing(subscriber, client, db_session_factory, monkeypatch):
    uid, auth, provider = subscriber
    clock = [datetime.now(timezone.utc).replace(microsecond=0)]
    monkeypatch.setattr(changes, 'now', lambda: clock[0])
    from app.services import billing_change_observation
    monkeypatch.setattr(billing_change_observation, 'now', lambda: clock[0])
    monkeypatch.setattr(access, 'now', lambda: clock[0])
    monkeypatch.setattr(get_settings(), 'subscription_sync_max_age_seconds', 400 * 86400)
    provider.client.settings.subscription_sync_max_age_seconds = 400 * 86400
    response = client.post(URL + '/checkout', headers=auth, json={'code': 'explorer', 'revision': 1, 'interval': 'monthly'})
    assert response.status_code == 200
    sub = provider.complete()
    start, end = int((clock[0] - timedelta(days=1)).timestamp()), int((clock[0] + timedelta(days=29)).timestamp())
    sub.update(billing_cycle_anchor=start, latest_invoice='in_current', collection_method='charge_automatically')
    sub['items']['data'][0].update(current_period_start=start, current_period_end=end)
    provider.invoices['in_current'] = invoice(sub, start=start, end=end)
    assert client.post(URL + '/refresh', headers=auth).status_code == 200
    stub = Schedules(provider)
    return uid, auth, provider, sub, clock, stub


def selection(client, auth, **overrides):
    data = client.get(URL + '/changes', headers=auth).json()
    assert data['items'], data
    option = data['items'][0]
    return {'code': option['code'], 'revision': option['revision'], 'interval': option['interval'],
        'expected_period_end': data['effective_at'], 'digest_ids': [d['id'] for d in data['digests'][:option['max_digests']]], **overrides}


def schedule(client, changing, **overrides):
    result = client.post(URL + '/changes', headers=changing[1], json=selection(client, changing[1], **overrides))
    assert result.status_code == 200, result.text
    return result.json()


def renew(changing, *, status='paid'):
    uid, auth, provider, sub, clock, stub = changing
    target = stub.rows[sub['schedule']]['phases'][1]
    start = target['start_date']; end = start + 365 * 86400
    sub['items']['data'][0].update(price={'id': target['items'][0]['price']}, current_period_start=start, current_period_end=end)
    sub.update(latest_invoice='in_new', status='active' if status == 'paid' else 'past_due', billing_cycle_anchor=start)
    value = invoice(sub, iid='in_new', status=status, start=start, end=end)
    value['lines']['data'][0]['pricing']['price_details']['price'] = target['items'][0]['price']
    provider.invoices['in_new'] = value
    clock[0] = datetime.fromtimestamp(start, timezone.utc) + timedelta(seconds=1)


def test_schedule_undo_keeps_paid_binding_and_owner_scoping(changing, client, db_session_factory):
    uid, auth, provider, sub, clock, stub = changing
    change = schedule(client, changing)
    assert change['state'] == 'scheduled' and change['undo_allowed']
    with db_session_factory() as db:
        row = billing.latest(db, uid)
        assert row.interval == 'monthly' and row.price_id == 'price_month'
        saved = db.get(Change, UUID(change['id']))
        assert saved.parameters['proration_behavior'] == 'none'
        assert saved.parameters['phases[1][proration_behavior]'] == 'none'
        assert db.scalar(select(func.count()).select_from(Notice).where(Notice.id.like('change:%:scheduled'))) == 1
    other = _authorization(_register(client, 'other-change@example.com', 'Other'))
    assert client.post(URL + f"/changes/{change['id']}/undo", headers=other).status_code == 404
    assert client.post(URL + f"/changes/{change['id']}/retry", headers=other).status_code == 404
    assert client.post(URL + '/changes', json={}).status_code == 401
    result = client.post(URL + f"/changes/{change['id']}/undo", headers=auth)
    assert result.json()['state'] == 'undone'
    assert sub['schedule'] is None
    assert sub['items']['data'][0]['price']['id'] == 'price_month'
    assert client.post(URL + f"/changes/{change['id']}/undo", headers=auth).json()['state'] == 'undone'
    assert client.get(URL + '/notifications', headers=other).json()['items'] == []


@pytest.mark.parametrize('stage', ['create', 'configure', 'release'])
def test_ambiguous_writes_resume_exact_intent(changing, client, db_session_factory, stage):
    stub = changing[-1]
    if stage != 'release': stub.fail_after = stage
    payload = selection(client, changing[1])
    result = client.post(URL + '/changes', headers=changing[1], json=payload).json()
    if stage == 'release':
        stub.fail_after = stage
        result = client.post(URL + f"/changes/{result['id']}/undo", headers=changing[1]).json()
    assert result['state'] in ('preparing', 'undoing') and result['error']
    result = client.post(URL + f"/changes/{result['id']}/retry", headers=changing[1]).json()
    assert result['state'] == ('undone' if stage == 'release' else 'scheduled'), result
    assert len(stub.rows) == 1
    with db_session_factory() as db:
        assert db.scalar(select(func.count()).select_from(Change)) == 1


def test_renewal_verifies_new_and_historical_prices_and_preserves_clock(changing, client, db_session_factory):
    uid, auth = changing[:2]
    change = schedule(client, changing)
    with db_session_factory() as db:
        before = access.resolve(db, uid); anchor = db.get(SubscriptionAccountState, uid).allowance_anchor; db.commit()
    renew(changing)
    response = client.post(URL + '/refresh', headers=auth)
    assert response.status_code == 200, response.text
    assert response.json()['attempt']['interval'] == 'annual'
    with db_session_factory() as db:
        assert db.get(BillingInvoice, 'in_current').issue is None
        assert db.get(BillingInvoice, 'in_new').issue is None
        assert db.get(Change, UUID(change['id'])).state == 'finalizing'
        assert db.get(SubscriptionAccountState, uid).allowance_anchor == anchor
        assert access.resolve(db, uid)['allowed']
    assert changes.tick(db_session_factory, get_settings())
    assert client.get(URL + '/changes', headers=auth).json()['change']['state'] == 'applied'
    assert changing[3]['schedule'] is None
    assert client.post(URL + f"/changes/{change['id']}/undo", headers=auth).status_code == 409
    # Canonical re-observation never duplicates the completion notice.
    client.post(URL + '/refresh', headers=auth)
    with db_session_factory() as db:
        assert db.scalar(select(func.count()).select_from(Notice).where(Notice.id.like('change:%:completed'))) == 1


def test_failed_transition_payment_grace_free_and_recovery(changing, client, db_session_factory):
    uid, auth = changing[:2]
    schedule(client, changing)
    renew(changing, status='open')
    assert client.post(URL + '/refresh', headers=auth).status_code == 200
    result = client.get('/api/v1/subscription', headers=auth).json()
    assert result['allowed'] and result['grace_until'] and result['billing_type'] == 'stripe', result
    changing[4][0] += timedelta(days=4)
    result = client.get('/api/v1/subscription', headers=auth).json()
    assert result['billing_type'] == 'free'
    # Payment management remains available while the schedule owns the subscription.
    portal = client.post(URL + '/portal', headers=auth)
    assert portal.status_code == 200, portal.text
    assert changing[2].calls[-1][2]['flow_data[type]'] == 'payment_method_update'
    value = changing[2].invoices['in_new']; value.update(status='paid', amount_paid=900, amount_remaining=0)
    value['status_transitions']['paid_at'] = int(changing[4][0].timestamp()); changing[3]['status'] = 'active'
    assert client.post(URL + '/refresh', headers=auth).status_code == 200
    assert client.get('/api/v1/subscription', headers=auth).json()['billing_type'] == 'stripe'
    with db_session_factory() as db:
        subjects = list(db.scalars(select(Notice.subject)))
        assert 'Subscription payment needs attention' in subjects and 'Free access is now active' in subjects and 'Paid access restored' in subjects


@pytest.mark.parametrize('mutation', ['stale_date', 'revision', 'foreign_digest', 'cancel', 'discount', 'unpaid', 'external_schedule'])
def test_preflight_rejects_unsafe_or_stale_requests(changing, client, mutation):
    uid, auth, provider, sub, clock, stub = changing
    payload = selection(client, auth)
    if mutation == 'stale_date': payload['expected_period_end'] = clock[0].isoformat()
    elif mutation == 'revision': payload['revision'] = 999
    elif mutation == 'foreign_digest': payload['digest_ids'] = [str(uuid4())]
    elif mutation == 'cancel': sub['cancel_at_period_end'] = True
    elif mutation == 'discount': sub['discounts'] = ['di_test']
    elif mutation == 'unpaid': sub['status'] = 'past_due'
    else: sub['schedule'] = 'sub_sched_other'
    response = client.post(URL + '/changes', headers=auth, json=payload)
    assert response.status_code in (409, 404), response.text
    assert not [c for c in stub.calls if c[0] == 'POST']


def test_pinned_interval_revision_and_no_upgrade_offer(changing, client, db_session_factory):
    with db_session_factory() as db:
        original = db.get(Plan, 1)
        db.add(Plan(code='explorer', revision=2, configuration={**original.configuration, 'monthly_price': '99.00'}, change_note='Changed'))
        db.add(Plan(code='upgrade', revision=1, configuration={**original.configuration, 'monthly_price': '99.00'}, change_note='Upgrade'))
        db.commit()
    choices = client.get(URL + '/changes', headers=changing[1]).json()['items']
    assert len(choices) == 1 and choices[0]['revision'] == 1 and choices[0]['interval'] == 'annual'


def test_notification_retry_dedup_and_transaction_rollback(changing, client, db_session_factory, monkeypatch):
    uid = changing[0]
    with db_session_factory() as db:
        notices.enqueue(db, uid, 'rolled-back', 'Rollback', 'Do not send'); db.rollback()
        assert db.get(Notice, 'rolled-back') is None
    schedule(client, changing)
    from app.services.email_service import EmailService
    def fail(*args): raise OSError('SMTP unavailable')
    monkeypatch.setattr(EmailService, 'send', fail)
    assert notices.tick(db_session_factory, get_settings())
    with db_session_factory() as db:
        item = db.scalar(select(Notice)); assert item.state == 'pending' and item.attempts == 1
        item.next_attempt_at = notices.now() - timedelta(seconds=1); db.commit()
    messages = []
    monkeypatch.setattr(EmailService, 'send', lambda self, message: messages.append(message))
    assert notices.tick(db_session_factory, get_settings())
    assert messages[0].recipient == 'subscriber@example.com'
    assert get_settings().frontend_base_url + '/radar/subscription' in messages[0].text
    assert not notices.tick(db_session_factory, get_settings())


def test_paid_downgrade_preserves_used_allowance_retains_digests_and_pauses(changing, client, db_session_factory):
    uid, auth, provider, sub, clock, stub = changing
    from app.schemas.digest import DigestCreate
    with db_session_factory() as db:
        source = db.get(Plan, 1)
        source.configuration = {**source.configuration, 'max_digests': 3, 'runs_per_month': 10, 'manual_runs_per_month': 10, 'papers_per_month': 100}
        target = Plan(code='basic', revision=1, configuration={**source.configuration, 'name': 'Basic', 'monthly_price': '5.00',
            'annual_price': None, 'max_digests': 1, 'runs_per_month': 1, 'manual_runs_per_month': 1, 'papers_per_month': 10,
            'max_papers_per_run': 10, 'schedule_frequencies': [], 'email_delivery': False,
            'stripe_sandbox': {'product_id': 'prod_basic', 'monthly_price_id': 'price_basic', 'annual_price_id': None}}, change_note='Lower tier')
        db.add(target)
        digests = [Digest(id=uuid4(), owner_id=uid, **DigestCreate.model_validate(_digest_payload(maximum_papers=3)).model_dump()) for _ in range(2)]
        db.add_all(digests); db.flush()
        current = access.resolve(db, uid)
        db.add(SubscriptionRunUsage(run_key=uuid4(), user_id=uid, checkout_id=billing.latest(db, uid).id,
            plan_revision_id=source.id, period_start=current['period_start'], period_end=access.month_at(current['period_start'], 2),
            state='settled', trigger='manual', requested_papers=10, actual_papers=10, request_context={}))
        anchor = db.get(SubscriptionAccountState, uid).allowance_anchor
        for d in digests:
            d.schedule = {'frequency': 'weekly', 'send_email': True, 'starts_at': clock[0].isoformat(), 'time_zone': 'UTC'}; d.schedule_next_at = clock[0]
        db.commit(); ids = [str(d.id) for d in digests]
    provider.client.mapping = lambda c: {'matches': True, 'issues': []}
    result = schedule(client, changing, code='basic', revision=1, interval='monthly', digest_ids=[ids[1]])
    renew(changing)
    assert client.post(URL + '/refresh', headers=auth).status_code == 200
    data = client.get('/api/v1/subscription', headers=auth).json()
    assert data['active_digest_ids'] == [ids[1]] and data['retained_digest_count'] == 2
    assert data['remaining']['runs'] == 0 and data['remaining']['papers'] == 0
    with db_session_factory() as db:
        assert db.get(SubscriptionAccountState, uid).allowance_anchor == anchor
        assert all(db.get(Digest, UUID(i)).schedule_paused for i in ids)
        assert db.get(BillingInvoice, 'in_current').issue is None
    assert client.get(f'/api/v1/digests/{ids[0]}', headers=auth).status_code == 200
    updated = client.put(URL + '/active-digests', headers=auth, json={'digest_ids': [ids[0]]})
    assert updated.status_code == 200 and updated.json()['selected_ids'] == [ids[0]]


def test_annual_to_monthly_switch_is_next_annual_renewal(changing, client, db_session_factory):
    schedule(client, changing); renew(changing)
    assert client.post(URL + '/refresh', headers=changing[1]).status_code == 200
    assert changes.tick(db_session_factory, get_settings())
    data = client.get(URL + '/changes', headers=changing[1]).json()
    assert data['items'][0]['interval'] == 'monthly'
    expected = changing[3]['items']['data'][0]['current_period_end']
    assert datetime.fromisoformat(data['effective_at'].replace('Z', '+00:00')).timestamp() == expected
    result = schedule(client, changing)
    assert result['state'] == 'scheduled' and result['interval'] == 'monthly'
    assert changing[3]['items']['data'][0]['price']['id'] == 'price_year'


def test_early_or_unverified_price_change_cannot_rebind(changing, client, db_session_factory):
    schedule(client, changing)
    changing[3]['items']['data'][0]['price'] = {'id': 'price_year'}
    assert client.post(URL + '/refresh', headers=changing[1]).status_code == 200
    with db_session_factory() as db:
        assert billing.latest(db, changing[0]).interval == 'monthly'
        assert not billing.latest(db, changing[0]).price_matches
    renew(changing)
    changing[-1].rows[changing[3]['schedule']]['metadata'] = {'radar_change_id': 'someone-else'}
    assert client.post(URL + '/refresh', headers=changing[1]).status_code == 200
    with db_session_factory() as db:
        assert billing.latest(db, changing[0]).interval == 'monthly'
        assert not billing.latest(db, changing[0]).price_matches


def test_undo_boundary_and_expired_idempotency_key(changing, client, db_session_factory):
    changing[-1].fail_after = 'create'
    change = schedule(client, changing)
    with db_session_factory() as db:
        row = db.get(Change, UUID(change['id'])); row.created_at = changes.now() - timedelta(hours=24); db.commit()
    count = len(changing[-1].calls)
    result = client.post(URL + f"/changes/{change['id']}/retry", headers=changing[1]).json()
    assert result['state'] == 'needs_review'
    assert not [c for c in changing[-1].calls[count:] if c[0] == 'POST']


def test_undo_stops_at_boundary_and_terminal_subscription_clears_pending(changing, client, db_session_factory):
    change = schedule(client, changing)
    changing[4][0] = datetime.fromisoformat(change['effective_at'].replace('Z', '+00:00')) - timedelta(seconds=20)
    writes = len(changing[-1].calls)
    assert client.post(URL + f"/changes/{change['id']}/undo", headers=changing[1]).status_code == 409
    assert not [c for c in changing[-1].calls[writes:] if c[0] == 'POST']
    renew(changing, status='open')
    assert client.post(URL + '/refresh', headers=changing[1]).status_code == 200
    changing[3]['status'] = 'canceled'
    assert client.post(URL + '/refresh', headers=changing[1]).status_code == 200
    with db_session_factory() as db:
        assert db.get(Change, UUID(change['id'])).state == 'stopped'
        assert changes.blocking(db, user_id=changing[0]) is None


def test_changed_price_cancellation_notifications_do_not_claim_withdrawal(changing, client, db_session_factory):
    changing[3]['cancel_at_period_end'] = True
    assert client.post(URL + '/refresh', headers=changing[1]).status_code == 200
    changing[3].update(status='canceled', cancel_at_period_end=False)
    assert client.post(URL + '/refresh', headers=changing[1]).status_code == 200
    with db_session_factory() as db:
        subjects = list(db.scalars(select(Notice.subject)))
        assert 'Cancellation scheduled' in subjects and 'Paid subscription ended' in subjects
        assert 'Cancellation withdrawn' not in subjects
