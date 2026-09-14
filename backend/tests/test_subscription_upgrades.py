from copy import deepcopy
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4
import pytest
from sqlalchemy import select, func
from app.core.config import get_settings
from app.models.subscription_upgrade import SubscriptionUpgrade as Upgrade
from app.models.subscription_change import BillingNotification
from app.models.subscription_plan import SubscriptionPlanRevision as Plan
from app.models.subscription_access import SubscriptionAccountState, SubscriptionRunUsage
from app.models.billing_invoice import BillingInvoice
from app.services import subscription_upgrade_service as upgrades, stripe_sandbox_service as billing, subscription_access_service as access
from app.services import billing_invoice_service as invoices
from test_stripe_sandbox import account
from test_subscriber_billing import subscriber
from test_subscription_changes import changing
from test_digests import _register, _authorization
from test_billing_invoices import invoice

URL = '/api/v1/subscription/billing/upgrades'


class UpgradeProvider:
    def __init__(self, provider, sub, clock):
        self.provider, self.sub, self.clock = provider, sub, clock
        self.calls, self.keys = [], {}
        self.fail_payment = False
        self.timeout = None
        self.mutate = None
        self.debit, self.credit = 1837, -870
        original = provider.client.request
        def request(method, path, *, data=None, idempotency_key=None):
            if (method, path) not in [('POST', 'invoices/create_preview'), ('POST', 'subscriptions/' + sub['id'])]:
                return original(method, path, data=data, idempotency_key=idempotency_key)
            self.calls.append((method, path, deepcopy(data), idempotency_key))
            if path == 'invoices/create_preview':
                return self.make_invoice('upcoming_in_test', data['subscription_details[items][0][price]'],
                    int(data['subscription_details[proration_date]']), preview=True)
            if self.timeout == 'before':
                self.timeout = None
                raise billing.Error('Lost connection before write.', 503)
            if idempotency_key in self.keys:
                params, value = self.keys[idempotency_key]; assert params == data
                return deepcopy(value)
            assert data['payment_behavior'] == 'pending_if_incomplete'
            assert data['proration_behavior'] == 'always_invoice'
            assert data['items[0][id]'] == 'si_test'
            iid = 'in_upgrade' + str(len(self.keys) + 1)
            value = self.make_invoice(iid, data['items[0][price]'], int(data['proration_date']))
            provider.invoices[iid] = value
            sub['latest_invoice'] = iid
            if self.fail_payment:
                sub['pending_update'] = {'expires_at': int(clock[0].timestamp()) + 23 * 3600,
                    'subscription_items': [{'id': 'si_test', 'price': data['items[0][price]'], 'quantity': 1}]}
            else:
                sub['items']['data'][0]['price'] = {'id': data['items[0][price]']}
                sub['pending_update'] = None
            self.keys[idempotency_key] = deepcopy(data), deepcopy(sub)
            if self.timeout == 'after':
                self.timeout = None
                raise billing.Error('Provider accepted request but response was lost.', 503)
            return deepcopy(sub)
        provider.client.request = request

    def make_invoice(self, iid, target, start, *, preview=False):
        sub = self.sub
        value = invoice(sub, iid=iid, start=start, end=sub['items']['data'][0]['current_period_end'])
        value.update(total=self.debit + self.credit, amount_due=self.debit + self.credit,
            amount_remaining=0, amount_paid=self.debit + self.credit, status='paid', billing_reason='subscription_update',
            hosted_invoice_url='https://invoice.stripe.com/i/test_invoice')
        value['lines']['data'] = [{'amount': amount, 'currency': 'eur', 'quantity': 1,
            'period': {'start': start, 'end': sub['items']['data'][0]['current_period_end']},
            'parent': {'subscription_item_details': {'proration': True, 'subscription': sub['id'], 'subscription_item': 'si_test'}},
            'pricing': {'price_details': {'price': price}}} for price, amount in [(sub['items']['data'][0]['price']['id'], self.credit), (target, self.debit)]]
        if preview:
            value.update(status='draft', amount_paid=0, amount_remaining=0)
        elif self.fail_payment:
            value.update(status='open', amount_paid=0, amount_remaining=value['amount_due'])
            value['status_transitions']['paid_at'] = None
        if self.mutate:
            self.mutate(value, preview)
        return value

    def paid(self):
        value = self.provider.invoices[self.sub['latest_invoice']]
        value.update(status='paid', amount_paid=value['amount_due'], amount_remaining=0)
        value['status_transitions']['paid_at'] = int(self.clock[0].timestamp())
        self.sub['items']['data'][0]['price'] = {'id': self.sub['pending_update']['subscription_items'][0]['price']}
        self.sub['pending_update'] = None


@pytest.fixture
def upgrading(changing, db_session_factory, monkeypatch):
    uid, auth, provider, sub, clock, schedule_stub = changing
    monkeypatch.setattr(upgrades, 'now', lambda: clock[0])
    from app.services import billing_upgrade_observation
    monkeypatch.setattr(billing_upgrade_observation, 'now', lambda: clock[0])
    sub['items']['data'][0]['id'] = 'si_test'
    with db_session_factory() as db:
        source = db.get(Plan, 1)
        config = {**source.configuration, 'name': 'Researcher', 'monthly_price': '19.00', 'annual_price': '190.00',
            'max_digests': source.configuration['max_digests'] + 2, 'runs_per_month': source.configuration['runs_per_month'] + 10,
            'manual_runs_per_month': source.configuration['manual_runs_per_month'] + 10, 'papers_per_month': source.configuration['papers_per_month'] + 100,
            'stripe_sandbox': {'product_id': 'prod_researcher', 'monthly_price_id': 'price_researcher', 'annual_price_id': 'price_researcher_year'}}
        target = Plan(code='researcher', revision=1, configuration=config, change_note='Upgrade tier')
        db.add(target); db.commit()
    provider.client.mapping = lambda c: {'matches': True, 'issues': []}
    stub = UpgradeProvider(provider, sub, clock)
    return changing, stub


def preview(client, upgrading):
    result = client.post(URL + '/preview', headers=upgrading[0][1], json={'code': 'researcher', 'revision': 1})
    assert result.status_code == 200, result.text
    return result.json()


def confirm(client, upgrading, quote):
    result = client.post(URL + f"/{quote['id']}/confirm", headers=upgrading[0][1])
    assert result.status_code == 200, result.text
    return result.json()


def test_preview_is_read_only_and_confirmation_preserves_usage(upgrading, client, db_session_factory):
    changing, provider = upgrading; uid, auth = changing[:2]
    with db_session_factory() as db:
        current = access.resolve(db, uid)
        state = db.get(SubscriptionAccountState, uid); anchor = state.allowance_anchor
        db.add(SubscriptionRunUsage(run_key=uuid4(), user_id=uid, checkout_id=billing.latest(db, uid).id,
            plan_revision_id=1, period_start=current['period_start'], period_end=current['period_end'],
            state='settled', trigger='manual', requested_papers=10, actual_papers=10, request_context={}))
        db.commit()
    quote = preview(client, upgrading)
    assert quote['credit'] == 870 and quote['charge'] == 1837 and quote['amount_due'] == 967
    assert all(path == 'invoices/create_preview' for method, path, *_ in provider.calls)
    with db_session_factory() as db:
        assert billing.latest(db, uid).plan_revision_id == 1
    result = confirm(client, upgrading, quote)
    assert result['state'] == 'applied', result
    with db_session_factory() as db:
        checkout = billing.latest(db, uid)
        assert checkout.price_id == 'price_researcher' and checkout.price_matches
        assert invoices.assessment(db, checkout, upgrades.now(), 3)['covered']
        assert db.get(BillingInvoice, 'in_current').issue is None
        assert db.get(BillingInvoice, checkout.latest_invoice_id).issue is None
        assert db.get(SubscriptionAccountState, uid).allowance_anchor == anchor
        assert access.overview(db, uid)['usage']['completed_papers'] == 10
        assert db.scalar(select(func.count()).select_from(BillingNotification).where(BillingNotification.id.like('upgrade:%:completed'))) == 1
    assert confirm(client, upgrading, quote)['state'] == 'applied'
    assert len(provider.keys) == 1


def test_failed_payment_preserves_old_plan_and_secure_payment_recovers(upgrading, client, db_session_factory):
    changing, provider = upgrading; uid, auth = changing[:2]
    provider.fail_payment = True
    quote = preview(client, upgrading)
    result = confirm(client, upgrading, quote)
    assert result['state'] == 'pending_payment', result
    data = client.get('/api/v1/subscription', headers=auth).json()
    assert data['allowed'] and data['plan']['id'] == 1 and data['grace_until'] is None
    assert client.post('/api/v1/subscription/billing/cancel', headers=auth).status_code == 409
    assert not client.get('/api/v1/subscription/billing/changes', headers=auth).json()['items']
    hosted = client.post(URL + f"/{quote['id']}/payment", headers=auth)
    assert hosted.status_code == 200 and hosted.json()['url'].startswith('https://invoice.stripe.com/')
    # A returned browser visit is not payment evidence.
    assert client.get('/api/v1/subscription?stripe_return=success', headers=auth).json()['plan']['id'] == 1
    provider.paid()
    assert client.post('/api/v1/subscription/billing/refresh', headers=auth).status_code == 200
    assert client.get('/api/v1/subscription', headers=auth).json()['plan']['id'] != 1
    assert client.get(URL, headers=auth).json()['upgrade']['state'] == 'applied'


@pytest.mark.parametrize('when', ['before', 'after'])
def test_ambiguous_write_reuses_one_intent_and_key(upgrading, client, db_session_factory, when):
    changing, provider = upgrading
    quote = preview(client, upgrading); provider.timeout = when
    result = confirm(client, upgrading, quote)
    assert result['state'] == 'submitting'
    result = client.post(URL + f"/{quote['id']}/retry", headers=changing[1]).json()
    assert result['state'] == 'applied', result
    writes = [c for c in provider.calls if c[1].startswith('subscriptions/')]
    assert len(provider.keys) == 1
    assert len({c[3] for c in writes}) == 1
    assert all(c[2]['proration_date'] == str(int(datetime.fromisoformat(quote['proration_at'].replace('Z', '+00:00')).timestamp())) for c in writes)


@pytest.mark.parametrize('mutation', ['amount', 'extra_line', 'pagination', 'quantity', 'price', 'period', 'item', 'subscription', 'currency', 'balance', 'manual', 'credit_note'])
def test_invalid_preview_never_creates_charge(upgrading, client, mutation):
    changing, provider = upgrading
    def mutate(value, preview):
        line = value['lines']['data'][1]
        if mutation == 'amount': value['total'] += 1
        elif mutation == 'extra_line': value['lines']['data'].append(deepcopy(line))
        elif mutation == 'pagination': value['lines']['has_more'] = True
        elif mutation == 'quantity': line['quantity'] = 2
        elif mutation == 'price': line['pricing']['price_details']['price'] = 'price_other'
        elif mutation == 'period': line['period']['start'] += 1
        elif mutation == 'item': line['parent']['subscription_item_details']['subscription_item'] = 'si_other'
        elif mutation == 'subscription': value['parent']['subscription_details']['subscription'] = 'sub_other'
        elif mutation == 'currency': value['currency'] = 'usd'
        elif mutation == 'balance': value['starting_balance'] = -100
        elif mutation == 'manual': value['paid_out_of_band'] = True
        else: value['post_payment_credit_notes_amount'] = 1
    provider.mutate = mutate
    response = client.post(URL + '/preview', headers=changing[1], json={'code': 'researcher', 'revision': 1})
    assert response.status_code == 409, response.text
    assert not provider.keys


@pytest.mark.parametrize('mutation', ['expired', 'amount', 'revision', 'subscription', 'pending_schedule'])
def test_stale_confirmation_requires_new_review(upgrading, client, db_session_factory, mutation):
    changing, provider = upgrading
    quote = preview(client, upgrading)
    if mutation == 'expired': changing[4][0] += timedelta(minutes=11)
    elif mutation == 'amount': provider.debit += 1
    elif mutation == 'subscription': changing[3]['items']['data'][0]['quantity'] = 2
    elif mutation == 'pending_schedule': changing[3]['schedule'] = 'sub_sched_external'
    else:
        with db_session_factory() as db:
            target = db.scalar(select(Plan).where(Plan.code == 'researcher'))
            db.add(Plan(code='researcher', revision=2, configuration=target.configuration, change_note='New revision')); db.commit()
    result = client.post(URL + f"/{quote['id']}/confirm", headers=changing[1])
    assert result.status_code == 409, result.text
    assert not provider.keys


def test_owner_scoping_of_quotes_confirmation_and_payment(upgrading, client):
    quote = preview(client, upgrading)
    other = _authorization(_register(client, 'upgrade-other@example.com', 'Other'))
    assert client.get(URL, headers=other).json()['upgrade'] is None
    for action in ('confirm', 'retry', 'payment'):
        assert client.post(URL + f"/{quote['id']}/{action}", headers=other).status_code == 404
        assert client.post(URL + f"/{quote['id']}/{action}").status_code == 401
    assert not upgrading[1].keys


def test_pending_expiry_void_preserves_original_coverage(upgrading, client):
    changing, provider = upgrading; provider.fail_payment = True
    quote = preview(client, upgrading); confirm(client, upgrading, quote)
    raw = changing[2].invoices[changing[3]['latest_invoice']]
    raw['status'] = 'void'; changing[3]['pending_update'] = None
    response = client.post(URL + f"/{quote['id']}/retry", headers=changing[1])
    assert response.json()['state'] == 'expired'
    data = client.get('/api/v1/subscription', headers=changing[1]).json()
    assert data['allowed'] and data['plan']['id'] == 1
    assert client.post(URL + f"/{quote['id']}/payment", headers=changing[1]).status_code == 409


@pytest.mark.parametrize('mutation', ['amount', 'unpaid', 'base_credit_note'])
def test_bad_settlement_cannot_activate_upgrade(upgrading, client, db_session_factory, mutation):
    changing, provider = upgrading
    quote = preview(client, upgrading)
    if mutation == 'base_credit_note':
        # Introduce a base-invoice adjustment after confirmation preflight, at the actual write.
        original = provider.make_invoice
        def adjusted(*args, **kwargs):
            result = original(*args, **kwargs)
            if not kwargs.get('preview'): changing[2].invoices['in_current']['post_payment_credit_notes_amount'] = 100
            return result
        provider.make_invoice = adjusted
    else:
        def mutate(value, preview):
            if not preview:
                if mutation == 'amount': value['amount_paid'] -= 1
                else: value.update(status='open', amount_paid=0, amount_remaining=value['amount_due'])
        provider.mutate = mutate
    result = confirm(client, upgrading, quote)
    assert result['state'] != 'applied', result
    with db_session_factory() as db:
        assert billing.latest(db, changing[0]).plan_revision_id == 1
        assert not access.resolve(db, changing[0])['allowed']


def test_repeated_upgrades_verify_entire_payment_chain(upgrading, client, db_session_factory):
    changing, provider = upgrading; uid, auth = changing[:2]
    quote = preview(client, upgrading); assert confirm(client, upgrading, quote)['state'] == 'applied'
    changing[4][0] += timedelta(minutes=1)
    with db_session_factory() as db:
        second = db.scalar(select(Plan).where(Plan.code == 'researcher'))
        db.add(Plan(code='professional', revision=1, configuration={**second.configuration, 'name': 'Professional', 'monthly_price': '39.00',
            'max_digests': second.configuration['max_digests'] + 2,
            'stripe_sandbox': {'product_id': 'prod_professional', 'monthly_price_id': 'price_professional', 'annual_price_id': 'price_professional_year'}}, change_note='Third tier'))
        db.commit()
    next_quote = client.post(URL + '/preview', headers=auth, json={'code': 'professional', 'revision': 1})
    assert next_quote.status_code == 200, next_quote.text
    second = confirm(client, upgrading, next_quote.json())
    assert second['state'] == 'applied', second
    with db_session_factory() as db:
        assert access.resolve(db, uid)['allowed']
        assert billing.latest(db, uid).price_id == 'price_professional'
        assert all(i.issue is None for i in db.scalars(select(BillingInvoice)))
    changing[2].invoices['in_upgrade1']['post_payment_credit_notes_amount'] = 100
    assert client.post('/api/v1/subscription/billing/refresh', headers=auth).status_code == 200
    assert not client.get('/api/v1/subscription', headers=auth).json()['allowed']


def test_upgrade_annual_interval_does_not_reset_billing_period(upgrading, client, db_session_factory):
    changing, provider = upgrading; uid, auth = changing[:2]
    sub = changing[3]; item = sub['items']['data'][0]
    item['price'] = {'id': 'price_year'}
    item['current_period_end'] = item['current_period_start'] + 365 * 86400
    value = changing[2].invoices['in_current']
    value['lines']['data'][0]['pricing']['price_details']['price'] = 'price_year'
    value['lines']['data'][0]['period']['end'] = item['current_period_end']
    with db_session_factory() as db:
        checkout = billing.latest(db, uid); checkout.interval = 'annual'; checkout.price_id = 'price_year'; db.commit()
    assert client.post('/api/v1/subscription/billing/refresh', headers=auth).status_code == 200
    quote = preview(client, upgrading)
    assert quote['interval'] == 'annual'
    result = confirm(client, upgrading, quote)
    assert result['state'] == 'applied', result
    assert sub['items']['data'][0]['current_period_end'] == item['current_period_end']
    with db_session_factory() as db:
        assert billing.latest(db, uid).interval == 'annual'
        assert billing.latest(db, uid).price_id == 'price_researcher_year'


def test_renewal_after_upgrade_uses_full_price_and_normal_grace(upgrading, client, db_session_factory):
    changing, provider = upgrading; uid, auth = changing[:2]
    quote = preview(client, upgrading); assert confirm(client, upgrading, quote)['state'] == 'applied'
    sub = changing[3]; item = sub['items']['data'][0]
    start = item['current_period_end']; end = start + 30 * 86400
    item.update(current_period_start=start, current_period_end=end)
    sub.update(latest_invoice='in_renewed', status='past_due')
    value = invoice(sub, iid='in_renewed', status='open', start=start, end=end)
    value['lines']['data'][0]['pricing']['price_details']['price'] = 'price_researcher'
    changing[2].invoices[value['id']] = value
    changing[4][0] = datetime.fromtimestamp(start, timezone.utc) + timedelta(seconds=1)
    assert client.post('/api/v1/subscription/billing/refresh', headers=auth).status_code == 200
    data = client.get('/api/v1/subscription', headers=auth).json()
    assert data['allowed'] and data['grace_until'], data
    changing[4][0] += timedelta(days=4)
    assert client.get('/api/v1/subscription', headers=auth).json()['billing_type'] == 'free'
    value.update(status='paid', amount_paid=900, amount_remaining=0)
    value['status_transitions']['paid_at'] = int(changing[4][0].timestamp()); sub['status'] = 'active'
    assert client.post('/api/v1/subscription/billing/refresh', headers=auth).status_code == 200
    assert client.get('/api/v1/subscription', headers=auth).json()['billing_type'] == 'stripe'


def test_payment_link_host_and_old_idempotency_window_are_guarded(upgrading, client, db_session_factory):
    changing, provider = upgrading; provider.fail_payment = True
    quote = preview(client, upgrading); confirm(client, upgrading, quote)
    raw = changing[2].invoices[changing[3]['latest_invoice']]
    raw['hosted_invoice_url'] = 'https://invoice.stripe.com.attacker.example/pay'
    assert client.post(URL + f"/{quote['id']}/payment", headers=changing[1]).status_code >= 400
    # A different fixture state simulates a crash before the original request reached Stripe.
    with db_session_factory() as db:
        row = db.get(Upgrade, UUID(quote['id'])); row.state = 'submitting'; row.invoice_id = None
        row.submitted_at = upgrades.now() - timedelta(hours=24); db.commit()
    changing[3]['pending_update'] = None; changing[3]['latest_invoice'] = 'in_current'
    before = len(provider.keys)
    result = client.post(URL + f"/{quote['id']}/retry", headers=changing[1]).json()
    assert result['state'] == 'needs_review' and len(provider.keys) == before


def test_only_actual_upgrades_are_offered_and_new_preview_supersedes_old(upgrading, client, db_session_factory):
    changing, provider = upgrading; uid, auth = changing[:2]
    first = preview(client, upgrading); changing[4][0] += timedelta(seconds=1)
    second = preview(client, upgrading)
    assert client.post(URL + f"/{first['id']}/confirm", headers=auth).json()['state'] == 'expired'
    with db_session_factory() as db:
        target = db.scalar(select(Plan).where(Plan.code == 'researcher'))
        target.configuration = {**target.configuration, 'max_digests': 1, 'schedule_frequencies': []}
        db.commit()
    assert client.get(URL, headers=auth).json()['items'] == []
    assert client.post(URL + f"/{second['id']}/confirm", headers=auth).status_code == 409
    assert not provider.keys


def test_invalid_supplement_cannot_grant_renewal_grace(upgrading, client):
    changing, provider = upgrading; auth = changing[1]
    quote = preview(client, upgrading); assert confirm(client, upgrading, quote)['state'] == 'applied'
    sub = changing[3]; item = sub['items']['data'][0]
    start = item['current_period_end']; end = start + 30 * 86400
    item.update(current_period_start=start, current_period_end=end)
    sub.update(latest_invoice='in_renewed', status='past_due')
    value = invoice(sub, iid='in_renewed', status='open', start=start, end=end)
    value['lines']['data'][0]['pricing']['price_details']['price'] = 'price_researcher'
    changing[2].invoices[value['id']] = value
    changing[2].invoices['in_upgrade1']['post_payment_credit_notes_amount'] = 100
    changing[4][0] = datetime.fromtimestamp(start, timezone.utc) + timedelta(seconds=1)
    assert client.post('/api/v1/subscription/billing/refresh', headers=auth).status_code == 200
    data = client.get('/api/v1/subscription', headers=auth).json()
    assert data['grace_until'] is None


@pytest.mark.parametrize('mutation', ['item', 'period', 'invoice', 'source_payment'])
def test_retry_revalidates_source_before_charge(upgrading, client, mutation):
    changing, provider = upgrading
    quote = preview(client, upgrading); provider.timeout = 'before'
    assert confirm(client, upgrading, quote)['state'] == 'submitting'
    item = changing[3]['items']['data'][0]
    if mutation == 'item': item['id'] = 'si_replaced'
    elif mutation == 'period': item['current_period_start'] += 1
    elif mutation == 'source_payment': changing[2].invoices['in_current']['post_payment_credit_notes_amount'] = 100
    else:
        changing[2].invoices['in_replaced'] = {**changing[2].invoices['in_current'], 'id': 'in_replaced'}
        changing[3]['latest_invoice'] = 'in_replaced'
    result = client.post(URL + f"/{quote['id']}/retry", headers=changing[1]).json()
    assert result['state'] == 'needs_review', result
    assert not provider.keys


def test_new_upgrade_after_voided_attempt_keeps_valid_coverage(upgrading, client):
    changing, provider = upgrading; auth = changing[1]
    provider.fail_payment = True
    quote = preview(client, upgrading); assert confirm(client, upgrading, quote)['state'] == 'pending_payment'
    changing[2].invoices[changing[3]['latest_invoice']]['status'] = 'void'
    changing[3]['pending_update'] = None
    assert client.post(URL + f"/{quote['id']}/retry", headers=auth).json()['state'] == 'expired'
    provider.fail_payment = False; changing[4][0] += timedelta(minutes=1)
    second = preview(client, upgrading)
    assert confirm(client, upgrading, second)['state'] == 'applied'
    data = client.get('/api/v1/subscription', headers=auth).json()
    assert data['allowed'] and data['plan']['id'] != 1, data
