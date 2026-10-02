"""Scheduled higher-tier transitions use the real services and a fake provider."""
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import UUID, uuid4

import pytest
from sqlalchemy import func, select

from app.core.config import get_settings
from app.models.billing_invoice import BillingInvoice
from app.models.digest import Digest
from app.models.stripe_sandbox import SandboxCheckout
from app.models.subscription_access import SubscriptionAccountState, SubscriptionRunUsage
from app.models.subscription_change import SubscriptionChange as Change
from app.models.subscription_plan import SubscriptionPlanRevision as Plan
from app.schemas.digest import DigestCreate
from app.services import billing_invoice_service as invoices
from app.services import stripe_sandbox_service as billing
from app.services import subscription_access_service as access
from app.services import subscription_change_service as changes
from app.services.billing_renewal_policy import is_renewal_upgrade
from test_billing_invoices import invoice
from test_digests import _digest_payload, _register, _authorization
from test_stripe_sandbox import account
from test_subscriber_billing import subscriber
from test_subscription_changes import changing

URL = '/api/v1/subscription/billing'


def higher(factory, provider, **overrides):
    with factory() as db:
        source = db.get(Plan, 1)
        config = {**source.configuration, 'name': 'Researcher', 'monthly_price': '20.00', 'annual_price': '200.00',
            'max_digests': source.configuration['max_digests'] + 3,
            'runs_per_month': source.configuration['runs_per_month'] + 10,
            'papers_per_month': source.configuration['papers_per_month'] + 100,
            'stripe_sandbox': {'product_id': 'prod_researcher', 'monthly_price_id': 'price_researcher_month', 'annual_price_id': 'price_researcher_year'},
            **overrides}
        target = Plan(code='researcher', revision=1, configuration=config, change_note='Higher tier fixture')
        db.add(target); db.commit()
    provider.client.mapping = lambda configuration: {'matches': True, 'issues': []}
    return config


def request(client, auth, interval='annual', code='researcher', **overrides):
    response = client.get(URL + '/changes', headers=auth)
    assert response.status_code == 200, response.text
    data = response.json()
    option = next(o for o in data['items'] if o['code'] == code and o['interval'] == interval)
    return {'code': option['code'], 'revision': option['revision'], 'interval': interval,
        'expected_period_end': data['effective_at'],
        'digest_ids': [d['id'] for d in data['digests'][:option['max_digests']]], **overrides}


def submit(client, auth, payload):
    response = client.post(URL + '/changes', headers=auth, json=payload)
    assert response.status_code == 200, response.text
    return response.json()


def transition(changing, interval='annual', *, status='paid', iid='in_upgrade_renewal'):
    _, _, provider, sub, clock, stub = changing
    target = stub.rows[sub['schedule']]['phases'][1]
    start = datetime.fromtimestamp(target['start_date'], timezone.utc)
    end = access.month_at(start, 12 if interval == 'annual' else 1)
    sub['items']['data'][0].update(price={'id': target['items'][0]['price']},
        current_period_start=int(start.timestamp()), current_period_end=int(end.timestamp()))
    sub.update(latest_invoice=iid, status='active' if status == 'paid' else 'past_due', billing_cycle_anchor=int(start.timestamp()))
    value = invoice(sub, iid=iid, status=status, start=int(start.timestamp()), end=int(end.timestamp()))
    amount = 20000 if interval == 'annual' else 2000
    value.update(amount_due=amount, amount_paid=amount if status == 'paid' else 0,
        amount_remaining=0 if status == 'paid' else amount, billing_reason='subscription_update')
    value['lines']['data'][0]['pricing']['price_details']['price'] = target['items'][0]['price']
    provider.invoices[iid] = value
    clock[0] = start + timedelta(seconds=1)
    return value


@pytest.mark.parametrize('interval', ['monthly', 'annual'])
def test_higher_plan_can_be_scheduled_without_charge_or_immediate_access(changing, client, db_session_factory, interval):
    uid, auth, provider, sub, clock, stub = changing
    config = higher(db_session_factory, provider)
    payload = request(client, auth, interval)
    before = client.get('/api/v1/subscription', headers=auth).json()
    with db_session_factory() as db:
        anchor = db.get(SubscriptionAccountState, uid).allowance_anchor
    change = submit(client, auth, payload)
    assert change['state'] == 'scheduled' and change['interval'] == interval
    assert change['price'] == config['monthly_price' if interval == 'monthly' else 'annual_price']
    assert sub['items']['data'][0]['price']['id'] == 'price_month'
    assert client.get('/api/v1/subscription', headers=auth).json()['plan'] == before['plan']
    with db_session_factory() as db:
        row = db.get(Change, UUID(change['id']))
        assert row.parameters['proration_behavior'] == 'none'
        assert row.parameters['phases[1][proration_behavior]'] == 'none'
        assert row.parameters['phases[1][billing_cycle_anchor]'] == 'phase_start'
        assert row.parameters['phases[1][duration][interval]'] == ('year' if interval == 'annual' else 'month')
        assert db.scalar(select(func.count()).select_from(SandboxCheckout).where(SandboxCheckout.user_id == uid)) == 1
        assert db.get(SubscriptionAccountState, uid).allowance_anchor == anchor
    assert set(provider.invoices) == {'in_current'}
    # Repeated consent resumes the same intent, never a duplicate subscription.
    assert submit(client, auth, payload)['id'] == change['id']
    assert len(stub.rows) == 1


@pytest.mark.parametrize('interval', ['monthly', 'annual'])
def test_paid_upgrade_renewal_verifies_invoice_and_preserves_monthly_usage(changing, client, db_session_factory, interval):
    uid, auth, provider, sub, clock, stub = changing
    config = higher(db_session_factory, provider)
    with db_session_factory() as db:
        before = access.resolve(db, uid)
        state = db.get(SubscriptionAccountState, uid); anchor = state.allowance_anchor
        digest = Digest(id=uuid4(), owner_id=uid, **DigestCreate.model_validate(_digest_payload(maximum_papers=3)).model_dump())
        digest.schedule_paused = True  # Upgrading must not silently resume a saved pause.
        db.add(digest)
        db.add(SubscriptionRunUsage(run_key=uuid4(), user_id=uid, checkout_id=billing.latest(db, uid).id,
            plan_revision_id=before['plan']['id'], period_start=before['period_start'],
            period_end=access.month_at(before['period_start'], 2), state='settled', trigger='manual',
            requested_papers=5, actual_papers=5, request_context={}))
        db.commit(); did = digest.id
    change = submit(client, auth, request(client, auth, interval))
    transition(changing, interval)
    assert client.post(URL + '/refresh', headers=auth).status_code == 200
    result = client.get('/api/v1/subscription', headers=auth).json()
    assert result['allowed'] and result['billing_type'] == 'stripe' and result['plan']['name'] == 'Researcher'
    assert result['remaining']['runs'] == config['runs_per_month'] - 1
    assert result['remaining']['papers'] == config['papers_per_month'] - 5
    with db_session_factory() as db:
        assert db.get(SubscriptionAccountState, uid).allowance_anchor == anchor
        assert db.get(Digest, did).schedule_paused
        assert db.get(BillingInvoice, 'in_current').issue is None
        assert db.get(BillingInvoice, 'in_upgrade_renewal').issue is None
        assert db.get(Change, UUID(change['id'])).state == 'finalizing'
    assert changes.tick(db_session_factory, get_settings())
    assert client.get(URL + '/changes', headers=auth).json()['change']['state'] == 'applied'
    assert client.post(URL + f"/changes/{change['id']}/undo", headers=auth).status_code == 409


@pytest.mark.parametrize('status,attempts,substatus', [('open', 1, 'past_due'), ('open', 0, 'active'), ('draft', 0, 'active')])
def test_unpaid_first_upgrade_invoice_never_gets_higher_tier_grace(changing, client, db_session_factory, status, attempts, substatus):
    uid, auth, provider, sub, clock, _ = changing
    higher(db_session_factory, provider)
    change = submit(client, auth, request(client, auth))
    value = transition(changing, status=status); value['attempt_count'] = attempts; sub['status'] = substatus
    assert client.post(URL + '/refresh', headers=auth).status_code == 200
    result = client.get('/api/v1/subscription', headers=auth).json()
    assert not (result['allowed'] and result['billing_type'] == 'stripe'), result
    with db_session_factory() as db:
        assessment = invoices.assessment(db, billing.latest(db, uid), clock[0], 3)
        assert not assessment['covered'] and assessment['grace_until'] is None
        assert db.get(Change, UUID(change['id'])).state == 'awaiting_payment'
    # Canonical payment recovery activates the exact requested tier and interval.
    value.update(status='paid', amount_paid=value['amount_due'], amount_remaining=0)
    value['status_transitions']['paid_at'] = int(clock[0].timestamp()); sub['status'] = 'active'
    assert client.post(URL + '/refresh', headers=auth).status_code == 200
    result = client.get('/api/v1/subscription', headers=auth).json()
    assert result['allowed'] and result['billing_type'] == 'stripe' and result['plan']['name'] == 'Researcher'
    assert result['grace_until'] is None


def test_later_ordinary_renewal_keeps_normal_paid_tier_grace(changing, client, db_session_factory):
    uid, auth, provider, sub, clock, _ = changing
    higher(db_session_factory, provider); submit(client, auth, request(client, auth))
    transition(changing); assert client.post(URL + '/refresh', headers=auth).status_code == 200
    assert changes.tick(db_session_factory, get_settings())
    item = sub['items']['data'][0]
    start = datetime.fromtimestamp(item['current_period_end'], timezone.utc); end = access.month_at(start, 12)
    item.update(current_period_start=int(start.timestamp()), current_period_end=int(end.timestamp()))
    sub.update(latest_invoice='in_next_year', status='past_due')
    value = invoice(sub, iid='in_next_year', status='open', start=int(start.timestamp()), end=int(end.timestamp()))
    value['lines']['data'][0]['pricing']['price_details']['price'] = 'price_researcher_year'
    value.update(amount_due=20000, amount_paid=0, amount_remaining=20000)
    provider.invoices['in_next_year'] = value; clock[0] = start + timedelta(seconds=1)
    with db_session_factory() as db:
        billing.observe_subscription(db, provider.client, billing.latest(db, uid), sub['id']); db.commit()
        assessment = invoices.assessment(db, billing.latest(db, uid), clock[0], 3)
        assert not assessment['covered'] and assessment['grace_until'] == start + timedelta(days=3)


def test_discounted_yearly_higher_tier_is_still_a_renewal_upgrade(changing, client, db_session_factory):
    config = higher(db_session_factory, changing[2], annual_price='90.00')
    assert request(client, changing[1])['interval'] == 'annual'
    with db_session_factory() as db:
        source = db.get(Plan, 1); target = db.scalar(select(Plan).where(Plan.code == 'researcher'))
        assert Decimal(config['annual_price']) / 12 < Decimal(source.configuration['monthly_price'])
        assert is_renewal_upgrade(source=source, target=target)


@pytest.mark.parametrize('mutation', ['currency', 'benefit_loss', 'price_only', 'hidden', 'trial', 'missing_yearly', 'new_revision'])
def test_higher_renewal_options_do_not_bypass_catalogue_and_entitlement_rules(changing, client, db_session_factory, mutation):
    config = higher(db_session_factory, changing[2])
    with db_session_factory() as db:
        target = db.scalar(select(Plan).where(Plan.code == 'researcher')); source = db.get(Plan, 1)
        if mutation == 'currency': config['currency'] = 'USD'
        elif mutation == 'benefit_loss': config['max_papers_per_run'] = source.configuration['max_papers_per_run'] - 1
        elif mutation == 'price_only':
            for key in (*changes.LIMITS, 'schedule_frequencies', 'email_delivery'): config[key] = source.configuration[key]
        elif mutation == 'hidden': config['subscriber_visible'] = False
        elif mutation == 'trial': config['trial_days'] = 7
        elif mutation == 'missing_yearly': config['annual_price'] = None
        else: db.add(Plan(code=target.code, revision=2, configuration={**config, 'subscriber_visible': False}, change_note='Withdraw latest'))
        target.configuration = config; db.commit()
    options = client.get(URL + '/changes', headers=changing[1]).json()['items']
    assert not any(o['code'] == 'researcher' and o['interval'] == 'annual' for o in options)


def test_changed_offer_and_renewal_are_rejected_before_scheduling(changing, client, db_session_factory):
    higher(db_session_factory, changing[2]); payload = request(client, changing[1])
    with db_session_factory() as db:
        target = db.scalar(select(Plan).where(Plan.code == 'researcher'))
        db.add(Plan(code=target.code, revision=2, configuration=deepcopy(target.configuration), change_note='New terms')); db.commit()
    assert client.post(URL + '/changes', headers=changing[1], json=payload).status_code == 409
    payload = request(client, changing[1]); payload['expected_period_end'] = changing[4][0].isoformat()
    assert client.post(URL + '/changes', headers=changing[1], json=payload).status_code == 409
    assert not [call for call in changing[-1].calls if call[0] == 'POST']


@pytest.mark.parametrize('stage', ['create', 'configure', 'release'])
def test_new_upgrade_schedule_retries_exact_durable_intent(changing, client, db_session_factory, stage):
    higher(db_session_factory, changing[2]); stub = changing[-1]
    if stage != 'release': stub.fail_after = stage
    change = submit(client, changing[1], request(client, changing[1]))
    if stage == 'release':
        stub.fail_after = stage
        change = client.post(URL + f"/changes/{change['id']}/undo", headers=changing[1]).json()
    assert change['state'] in {'preparing', 'undoing'} and change['error']
    response = client.post(URL + f"/changes/{change['id']}/retry", headers=changing[1])
    assert response.json()['state'] == ('undone' if stage == 'release' else 'scheduled')
    with db_session_factory() as db:
        assert db.scalar(select(func.count()).select_from(Change)) == 1
    assert len(stub.rows) == 1


def test_cancel_then_choose_different_target_is_explicit_and_owner_scoped(changing, client, db_session_factory):
    uid, auth, provider, sub, _, stub = changing
    higher(db_session_factory, provider)
    # Save both offered payloads before requesting the first change.
    annual = request(client, auth); monthly = request(client, auth, 'monthly')
    change = submit(client, auth, annual)
    assert client.post(URL + '/changes', headers=auth, json=monthly).status_code == 409
    other = _authorization(_register(client, 'other-renewal@example.com', 'Other'))
    assert client.post(URL + f"/changes/{change['id']}/undo", headers=other).status_code == 404
    result = client.post(URL + f"/changes/{change['id']}/undo", headers=auth)
    assert result.json()['state'] == 'undone' and sub['schedule'] is None
    assert sub['status'] == 'active' and sub['items']['data'][0]['price']['id'] == 'price_month'
    assert submit(client, auth, monthly)['id'] != change['id']
    assert not any(path.startswith('subscriptions/') and method == 'DELETE' for method, path, *_ in provider.calls)


def test_unverified_or_early_higher_price_cannot_grant_new_benefits(changing, client, db_session_factory):
    uid, auth, provider, sub, _, stub = changing
    higher(db_session_factory, provider); submit(client, auth, request(client, auth))
    sub['items']['data'][0]['price'] = {'id': 'price_researcher_year'}
    assert client.post(URL + '/refresh', headers=auth).status_code == 200
    with db_session_factory() as db:
        assert billing.latest(db, uid).price_id == 'price_month' and not billing.latest(db, uid).price_matches
    transition(changing)
    stub.rows[sub['schedule']]['metadata'] = {'radar_change_id': 'unrelated'}
    assert client.post(URL + '/refresh', headers=auth).status_code == 200
    with db_session_factory() as db:
        assert billing.latest(db, uid).price_id == 'price_month' and not access.resolve(db, uid)['allowed']


def test_yearly_to_higher_monthly_waits_for_the_current_year_to_end(changing, client, db_session_factory):
    uid, auth, provider, sub, clock, _ = changing
    item = sub['items']['data'][0]
    start = datetime.fromtimestamp(item['current_period_start'], timezone.utc)
    end = access.month_at(start, 12)
    # Set up an originally purchased Yearly subscription, not an external price edit.
    with db_session_factory() as db:
        checkout = billing.latest(db, uid)
        checkout.interval, checkout.price_id = 'annual', 'price_year'
        db.commit()
    item.update(price={'id': 'price_year'}, current_period_end=int(end.timestamp()))
    current = invoice(sub, start=int(start.timestamp()), end=int(end.timestamp()))
    current['lines']['data'][0]['pricing']['price_details']['price'] = 'price_year'
    provider.invoices['in_current'] = current
    assert client.post(URL + '/refresh', headers=auth).status_code == 200
    higher(db_session_factory, provider)
    payload = request(client, auth, 'monthly')
    assert datetime.fromisoformat(payload['expected_period_end'].replace('Z', '+00:00')) == end
    change = submit(client, auth, payload)
    assert change['interval'] == 'monthly' and change['state'] == 'scheduled'
    assert sub['items']['data'][0]['price']['id'] == 'price_year'


def test_downgrade_to_another_lower_plan_requires_confirmed_cancellation(changing, client, db_session_factory):
    uid, auth, provider, sub, _, _ = changing
    with db_session_factory() as db:
        source = db.get(Plan, 1)
        source.configuration = {**source.configuration, 'name': 'Professional', 'monthly_price': '30.00',
            'annual_price': '300.00', 'max_digests': 10, 'runs_per_month': 100, 'papers_per_month': 1000}
        for code, name, price, limit in [('researcher', 'Researcher', '20.00', 5), ('starter', 'Explorer', '10.00', 2)]:
            db.add(Plan(code=code, revision=1, change_note='Lower tier', configuration={**source.configuration,
                'name': name, 'monthly_price': price, 'annual_price': None, 'max_digests': limit,
                'stripe_sandbox': {'product_id': f'prod_{code}', 'monthly_price_id': f'price_{code}', 'annual_price_id': None}}))
        db.commit()
    provider.client.mapping = lambda configuration: {'matches': True, 'issues': []}
    first = request(client, auth, 'monthly', 'researcher')
    alternate = request(client, auth, 'monthly', 'starter')
    change = submit(client, auth, first)
    assert client.post(URL + '/changes', headers=auth, json=alternate).status_code == 409
    response = client.post(URL + f"/changes/{change['id']}/undo", headers=auth)
    assert response.json()['state'] == 'undone'
    assert sub['status'] == 'active' and sub['items']['data'][0]['price']['id'] == 'price_month'
    replacement = submit(client, auth, alternate)
    assert replacement['plan_name'] == 'Explorer' and replacement['state'] == 'scheduled'
