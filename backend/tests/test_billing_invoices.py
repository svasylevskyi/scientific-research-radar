from copy import deepcopy
from datetime import timedelta
import pytest
from sqlalchemy import func, select
from app.models.billing_invoice import BillingInvoice
from app.models.billing_sync import BillingSyncJob
from app.models.stripe_sandbox import SandboxCheckout, SandboxStripeEvent
from app.services import billing_invoice_service as invoices, billing_sync_service as sync
from app.services import stripe_sandbox_service as billing, subscription_access_service as access
from test_stripe_sandbox import account, Provider, event
from test_billing_sync import checkout, config
from test_subscription_access import enrolled, STAMP
from test_subscription_observation import setup
from test_digests import _authorization, _register, PASSWORD


def invoice(sub, iid='in_current', status='paid', *, modern=True, start=None, end=None):
    start = start or int(STAMP.timestamp())
    end = end or start + 30 * 86400
    line = {'quantity': 1, 'period': {'start': start, 'end': end}}
    value = {'id': iid, 'object': 'invoice', 'livemode': False, 'customer': sub['customer'],
        'status': status, 'currency': 'eur', 'amount_due': 900, 'amount_paid': 900 if status == 'paid' else 0,
        'amount_remaining': 0 if status == 'paid' else 900, 'attempt_count': 1,
        'collection_method': 'charge_automatically', 'billing_reason': 'subscription_cycle',
        'created': start, 'status_transitions': {'paid_at': start if status == 'paid' else None},
        'lines': {'data': [line], 'has_more': False}, 'next_payment_attempt': None}
    if modern:
        value['parent'] = {'subscription_details': {'subscription': sub['id'], 'metadata': sub['metadata']}}
        line.update(parent={'subscription_item_details': {'subscription': sub['id'], 'proration': False}},
            pricing={'price_details': {'price': 'price_month'}}, quantity_decimal='1.0')
    else:
        value.update(subscription=sub['id'], subscription_details={'metadata': sub['metadata']})
        line.update(subscription=sub['id'], price={'id': 'price_month'}, proration=False)
    return value


def configured(factory, account):
    provider = Provider()
    cid = checkout(factory, account, provider)
    sub = provider.complete()
    sub.update(billing_cycle_anchor=int(STAMP.timestamp()), latest_invoice='in_current')
    sub['items']['data'][0].update(current_period_start=int(STAMP.timestamp()), current_period_end=int(STAMP.timestamp()) + 30 * 86400)
    provider.invoices['in_current'] = invoice(sub)
    return provider, cid, sub


@pytest.mark.parametrize('modern', [True, False])
def test_invoice_first_event_durable_minimal_and_canonical(account, db_session_factory, modern):
    provider, cid, sub = configured(db_session_factory, account)
    paid = invoice(sub, modern=modern)
    provider.invoices[paid['id']] = paid
    incoming = deepcopy(paid); incoming.update(status='open', customer_email='private@example.com')
    payload = event(incoming, event_type='invoice.payment_failed')
    calls = len(provider.calls)
    with db_session_factory() as db:
        sync.receive(db, config(), payload)
        sync.receive(db, config(), payload)
        job = db.get(BillingSyncJob, payload['id'])
        assert job is not None and 'private@example.com' not in str(job.payload)
        assert db.scalar(select(func.count()).select_from(BillingSyncJob)) == 1
        claim = sync.claim(db)
    assert len(provider.calls) == calls
    assert sync.process(db_session_factory, config(), *claim, client=provider.client)
    with db_session_factory() as db:
        row = db.get(SandboxCheckout, cid)
        assert row.latest_invoice_id == 'in_current' and row.invoices_checked_at
        saved = db.get(BillingInvoice, 'in_current')
        assert saved.status == 'paid' and saved.issue is None
        assert invoices.assessment(db, row, STAMP, 3)['covered']
        assert db.scalar(select(func.count()).select_from(BillingInvoice)) == 1
        assert db.get(SandboxStripeEvent, payload['id'])


def test_missed_event_reconciliation_and_payment_recovery(account, db_session_factory):
    provider, cid, sub = configured(db_session_factory, account)
    provider.invoices['in_current'] = invoice(sub, status='open')
    sync.tick(db_session_factory, config(), client=provider.client)
    with db_session_factory() as db:
        row = db.get(SandboxCheckout, cid)
        assert not invoices.assessment(db, row, STAMP, 3)['covered']
        assert invoices.assessment(db, row, STAMP, 3)['grace_until'] is None
    provider.invoices['in_current'] = invoice(sub)
    # Reconciliation, without an invoice webhook, repairs the existing snapshot.
    with db_session_factory() as db:
        billing.observe_subscription(db, provider.client, db.get(SandboxCheckout, cid), sub['id'])
        db.commit()
        assert invoices.assessment(db, db.get(SandboxCheckout, cid), STAMP, 3)['covered']
        assert db.scalar(select(func.count()).select_from(BillingInvoice)) == 1


@pytest.mark.parametrize('mutation', ['customer', 'subscription', 'livemode', 'amount'])
def test_bad_invoice_rolls_back_observation_and_marker(account, db_session_factory, mutation):
    provider, cid, sub = configured(db_session_factory, account)
    value = provider.invoices['in_current']
    if mutation == 'customer': value['customer'] = 'cus_other'
    elif mutation == 'subscription': value['parent']['subscription_details']['subscription'] = 'sub_other'
    elif mutation == 'livemode': value['livemode'] = True
    else: value['amount_paid'] = -1
    with db_session_factory() as db:
        sync.receive(db, config(), event(sub))
        claim = sync.claim(db)
    assert not sync.process(db_session_factory, config(), *claim, client=provider.client)
    with db_session_factory() as db:
        assert db.get(BillingInvoice, 'in_current') is None
        assert db.get(SandboxCheckout, cid).invoices_checked_at is None
        assert db.get(SandboxStripeEvent, 'evt_test') is None
        assert db.get(BillingSyncJob, 'evt_test').state == 'retry'


@pytest.mark.parametrize('mutation', ['currency', 'proration', 'price', 'manual', 'credit_note', 'missing_paid_at', 'multi_line'])
def test_unsupported_settlement_is_visible_but_not_access_evidence(account, db_session_factory, mutation):
    provider, cid, sub = configured(db_session_factory, account)
    value = provider.invoices['in_current']; line = value['lines']['data'][0]
    if mutation == 'currency': value['currency'] = 'usd'
    elif mutation == 'proration': line['parent']['subscription_item_details']['proration'] = True
    elif mutation == 'price': line['pricing']['price_details']['price'] = 'price_other'
    elif mutation == 'manual': value['paid_out_of_band'] = True
    elif mutation == 'credit_note': value['post_payment_credit_notes_amount'] = 1
    elif mutation == 'missing_paid_at': value['status_transitions']['paid_at'] = None
    else: value['lines']['data'].append(deepcopy(line))
    sync.tick(db_session_factory, config(), client=provider.client)
    with db_session_factory() as db:
        result = invoices.assessment(db, db.get(SandboxCheckout, cid), STAMP, 3)
        assert result['issue'] and not result['covered']


def test_zero_due_paid_invoice_is_settlement(account, db_session_factory):
    provider, cid, sub = configured(db_session_factory, account)
    provider.invoices['in_current'].update(amount_due=0, amount_paid=0)
    sync.tick(db_session_factory, config(), client=provider.client)
    with db_session_factory() as db:
        assert invoices.assessment(db, db.get(SandboxCheckout, cid), STAMP, 3)['covered']


def test_latest_retrieval_identity_checked(account, db_session_factory):
    provider, cid, sub = configured(db_session_factory, account)
    provider.invoices['in_current']['id'] = 'in_wrong'
    sync.tick(db_session_factory, config(), client=provider.client)
    with db_session_factory() as db:
        assert db.get(SandboxCheckout, cid).invoices_checked_at is None
        assert 'different invoice' in db.get(BillingSyncJob, 'reconcile:' + str(cid)).last_error


def test_bounded_pagination_backfills_and_rechecks_latest(account, db_session_factory):
    provider, cid, sub = configured(db_session_factory, account)
    original = provider.client.request
    queries = []
    def request(method, path, **kwargs):
        if path.startswith('invoices?'):
            queries.append(path)
            older = 'starting_after=in_current' in path
            return {'object': 'list', 'has_more': not older, 'data': [invoice(sub, 'in_old' if older else 'in_current')]}
        return original(method, path, **kwargs)
    provider.client.request = request
    with db_session_factory() as db:
        row = db.get(SandboxCheckout, cid)
        billing.observe_subscription(db, provider.client, row, sub['id']); db.commit()
        assert row.invoice_history_cursor == 'in_current' and not row.invoice_history_complete
        assert len(queries) == 1
        billing.observe_subscription(db, provider.client, row, sub['id']); db.commit()
        assert row.invoice_history_complete and len(queries) == 3
        assert db.scalar(select(func.count()).select_from(BillingInvoice)) == 2


def test_grace_requires_previous_settlement_and_never_restarts(client, enrolled, db_session_factory, monkeypatch):
    setup, cid = enrolled
    uid = setup[0]
    at = STAMP
    monkeypatch.setattr(access, 'now', lambda: at)
    with db_session_factory() as db:
        row = db.get(SandboxCheckout, cid)
        paid = db.get(BillingInvoice, row.latest_invoice_id)
        old_end = paid.period_end
        paid.period_start = STAMP - timedelta(days=31)
        paid.period_end = STAMP
        current = BillingInvoice(id='in_renewal', checkout_id=cid, status='open', currency='eur', amount_due=900,
            amount_paid=0, amount_remaining=900, attempt_count=1, billing_reason='subscription_cycle',
            period_start=STAMP, period_end=old_end, created_at=STAMP, observed_at=STAMP)
        db.add(current)
        row.latest_invoice_id, row.subscription_status = current.id, 'past_due'
        db.commit()
        result = access.resolve(db, uid)
        assert result['allowed'] and result['grace_until']
        end = result['grace_until']
        at = end + timedelta(seconds=1)
        row.observed_at = row.invoices_checked_at = at
        current.attempt_count = 5; row.delinquent_since = at
        db.commit()
        assert not access.resolve(db, uid)['allowed']
        assert access.resolve(db, uid)['grace_until'] == end
        current.status, current.amount_paid, current.amount_remaining, current.paid_at = 'paid', 900, 0, at
        row.subscription_status = 'active'; db.commit()
        assert access.resolve(db, uid)['allowed']
        row.subscription_status = 'canceled'; db.commit()
        assert not access.resolve(db, uid)['allowed']


def test_unverified_invoice_blocks_only_opted_in_account(client, enrolled, db_session_factory):
    setup, cid = enrolled
    with db_session_factory() as db:
        row = db.get(SandboxCheckout, cid)
        row.latest_invoice_id = None; db.commit()
        assert not access.resolve(db, setup[0])['allowed']
    assert client.get('/api/v1/subscription', headers=setup[1]).json()['create_allowed'] is False


def test_admin_invoice_visibility(client, account, db_session_factory):
    provider, cid, sub = configured(db_session_factory, account)
    sync.tick(db_session_factory, config(), client=provider.client)
    url = f'/api/v1/admin/billing-sync/checkouts/{cid}/invoices'
    assert client.get(url).status_code == 401
    user = _register(client, 'invoice-admin@example.com', 'Invoice admin')
    assert client.get(url, headers=_authorization(user)).status_code == 403
    uid = user.json()['user']['id']
    client.put(f'/api/v1/admin/users/{uid}/role', headers=account[1], json={'role': 'admin'})
    admin = _authorization(client.post('/api/v1/auth/login', json={'email': 'invoice-admin@example.com', 'password': PASSWORD}))
    assert client.get(url, headers=admin).status_code == 404
    result = client.get(url, headers=account[1])
    assert result.status_code == 200 and result.json()['total'] == 1
    assert 'customer' not in result.json()['items'][0]


def test_replayed_payment_events_preserve_spent_allowance(client, enrolled, db_session_factory):
    from test_digest_runs import RecordingRadarClient, _override_runner, _execute_next
    from test_subscription_observation import start
    from app.models.subscription_access import SubscriptionRunUsage
    setup, cid = enrolled
    fake = RecordingRadarClient(); _override_runner(fake)
    rid = start(client, setup); _execute_next(db_session_factory, fake)
    provider = Provider()
    with db_session_factory() as db:
        row = db.get(SandboxCheckout, cid)
        sub = {'id': row.subscription_id, 'object': 'subscription', 'livemode': False,
            'customer': 'cus_access', 'metadata': {'radar_attempt_id': str(cid), 'radar_sandbox': '1'},
            'status': 'active', 'cancel_at_period_end': False, 'billing_cycle_anchor': int(STAMP.timestamp()),
            'latest_invoice': 'in_current', 'items': {'data': [{'price': {'id': row.price_id}, 'quantity': 1,
                'current_period_start': int(STAMP.timestamp()), 'current_period_end': int(access.utc(row.period_end).timestamp())}]}}
        value = invoice(sub, end=int(access.utc(row.period_end).timestamp()))
        value['lines']['data'][0]['pricing']['price_details']['price'] = row.price_id
        provider.subscriptions[sub['id']] = sub; provider.invoices[value['id']] = value
        usage = db.get(SubscriptionRunUsage, rid)
        before = (usage.state, usage.actual_papers, usage.period_start)
        for eid, kind in [('evt_paid', 'invoice.paid'), ('evt_paid', 'invoice.paid'), ('evt_old_failure', 'invoice.payment_failed')]:
            sync.receive(db, config(), event(value, event_id=eid, event_type=kind))
            claim = sync.claim(db)
            if claim:
                assert sync.process(db_session_factory, config(), *claim, client=provider.client)
        db.expire_all()
        usage = db.get(SubscriptionRunUsage, rid)
        assert (usage.state, usage.actual_papers, usage.period_start) == before
        assert access.overview(db, setup[0])['remaining']['runs'] == 0
        assert db.scalar(select(func.count()).select_from(SubscriptionRunUsage)) == 1


def test_invoice_permission_failure_is_retryable(account, db_session_factory):
    provider, cid, sub = configured(db_session_factory, account)
    original = provider.client.request
    def restricted(method, path, **kwargs):
        if path.startswith('invoices'):
            raise billing.Error('Sandbox key needs invoice read permission.')
        return original(method, path, **kwargs)
    provider.client.request = restricted
    sync.tick(db_session_factory, config(), client=provider.client)
    with db_session_factory() as db:
        job = db.get(BillingSyncJob, 'reconcile:' + str(cid))
        assert job.state == 'retry' and job.next_attempt_at
        assert db.get(SandboxCheckout, cid).invoices_checked_at is None
