"""Live-mode integration coverage uses a fake HTTP transport: no external charges."""
from copy import deepcopy
from datetime import datetime, timezone
import json

import httpx
import pytest
from pydantic import SecretStr, ValidationError
from sqlalchemy import select

from app.core.config import Settings, get_settings
from app.models.stripe_sandbox import SandboxCheckout, StripeEnvironment
from app.models.billing_sync import BillingSyncJob
from app.services import stripe_sandbox_service as billing, billing_sync_service as sync
from app.services import billing_invoice_service as invoices
from app.services.stripe_environment import ensure_database_mode
from test_stripe_sandbox import Provider, account, event, signed, settings as sandbox_settings
from test_billing_invoices import invoice
from test_subscription_access import STAMP
from test_digests import _register, _authorization


def live_settings(**kwargs):
    return Settings(_env_file=None, stripe_mode='live', stripe_api_key='rk_live_fake',
        stripe_webhook_secret='whsec_testing', stripe_checkout_enabled=True,
        stripe_portal_configuration_id='bpc_test', frontend_base_url='https://radar.example', **kwargs)


def live_value(value):
    if isinstance(value, dict):
        result = {k: live_value(v) for k, v in value.items()}
        if 'livemode' in result:
            result['livemode'] = True
        if 'radar_attempt_id' in result:
            result.pop('radar_sandbox', None)
            result['radar_mode'] = 'live'
        return result
    if isinstance(value, list):
        return [live_value(v) for v in value]
    return value.replace('cs_test_', 'cs_live_') if isinstance(value, str) else value


class LiveProvider(Provider):
    def __init__(self):
        super().__init__()
        self.client = billing.StripeSandboxClient(live_settings(), transport=httpx.MockTransport(self.live_handle))

    def live_handle(self, request):
        assert request.headers['authorization'] == httpx.BasicAuth('rk_live_fake', '')._auth_header
        # Reuse the stateful fake's storage and idempotency, exposing live HTTP objects.
        translated = httpx.Request(request.method, str(request.url).replace('cs_live_', 'cs_test_'),
            headers=request.headers, content=request.content)
        response = super().handle(translated)
        return httpx.Response(response.status_code, json=live_value(response.json()))


@pytest.mark.parametrize('mode,key', [('sandbox', 'rk_live_wrong'), ('live', 'sk_test_wrong')])
def test_settings_reject_wrong_mode_key(mode, key):
    with pytest.raises(ValidationError, match='match STRIPE_MODE'):
        Settings(_env_file=None, stripe_mode=mode, stripe_api_key=key)


def test_live_never_falls_back_to_legacy_sandbox_credentials():
    config = Settings(_env_file=None, stripe_mode='live', stripe_sandbox_api_key='rk_test_old',
        stripe_sandbox_webhook_secret='whsec_old', stripe_sandbox_checkout_enabled=True,
        stripe_sandbox_portal_configuration_id='bpc_old')
    assert config.effective_stripe_api_key is None
    assert config.effective_stripe_webhook_secret is None
    assert config.effective_stripe_portal_configuration_id is None
    assert not config.effective_stripe_checkout_enabled
    with pytest.raises(billing.Error):
        billing.StripeSandboxClient(config)


def test_live_checkout_requires_https_and_credentials():
    with pytest.raises(ValidationError, match='requires'):
        Settings(_env_file=None, stripe_mode='live', stripe_checkout_enabled=True)
    with pytest.raises(ValidationError, match='HTTPS'):
        Settings(_env_file=None, stripe_mode='live', stripe_checkout_enabled=True,
            stripe_api_key='rk_live_fake', stripe_webhook_secret='whsec_fake')


@pytest.mark.parametrize('mode', ['sandbox', 'live'])
def test_database_mode_binding_cannot_be_switched(db_session_factory, mode):
    with db_session_factory() as db:
        ensure_database_mode(db, Settings(_env_file=None, stripe_mode=mode))
        db.commit()
        assert db.get(StripeEnvironment, 1).mode == mode
        ensure_database_mode(db, Settings(_env_file=None, stripe_mode=mode))
        with pytest.raises(billing.Error, match='separate database'):
            ensure_database_mode(db, Settings(_env_file=None, stripe_mode='live' if mode == 'sandbox' else 'sandbox'))


def test_live_retry_invoice_webhook_and_portal(account, db_session_factory):
    config, provider = live_settings(), LiveProvider()
    provider.timeout_once = True
    with db_session_factory() as db:
        with pytest.raises(billing.Error, match='resume safely'):
            billing.start_checkout(db, config, account[0], 1, 'monthly', client=provider.client)
        db.rollback()
        row = billing.latest(db, account[0])
        assert row.livemode and row.parameters['metadata[radar_mode]'] == 'live'
        assert 'metadata[radar_sandbox]' not in row.parameters
        assert not row.checkout_id
        result = billing.start_checkout(db, config, account[0], 1, 'monthly', client=provider.client)
        assert 'cs_live_' in result['url']
        cid = billing.latest(db, account[0]).id
    calls = [c for c in provider.calls if c[:2] == ('POST', 'checkout/sessions')]
    assert len(calls) == 2 and calls[0][2:] == calls[1][2:]
    sub = provider.complete()
    sub.update(latest_invoice='in_live', billing_cycle_anchor=int(STAMP.timestamp()))
    sub['items']['data'][0].update(current_period_start=int(STAMP.timestamp()), current_period_end=int(STAMP.timestamp()) + 30 * 86400)
    provider.invoices['in_live'] = invoice(sub, iid='in_live')
    incoming = live_value(event(provider.invoices['in_live'], event_type='invoice.paid'))
    body, headers = signed(incoming)
    verified = billing.verify_event(body, headers['Stripe-Signature'], config)
    with db_session_factory() as db:
        sync.receive(db, config, verified)
        sync.receive(db, config, verified)
        assert len(list(db.scalars(select(BillingSyncJob)))) == 1
        claim = sync.claim(db)
    assert sync.process(db_session_factory, config, *claim, client=provider.client)
    with db_session_factory() as db:
        row = db.get(SandboxCheckout, cid)
        assert row.checkout_id == 'cs_live_1' and row.subscription_status == 'active'
        assert invoices.assessment(db, row, STAMP, 3)['covered']
        assert billing.portal(db, config, account[0], client=provider.client)['url'].startswith('https://billing.stripe.com/')
        with pytest.raises(billing.Error, match='different Stripe mode'):
            billing.sync_attempt(db, Provider().client, row)
        wrong = deepcopy(provider.invoices['in_live'])
        with pytest.raises(billing.Error):
            invoices.observe(db, row, wrong)


@pytest.mark.parametrize('expected_mode', ['sandbox', 'live'])
def test_webhook_rejects_other_mode_with_valid_signature(expected_mode):
    config = live_settings() if expected_mode == 'live' else sandbox_settings()
    value = event({'id': 'sub_test'})
    value['livemode'] = expected_mode == 'sandbox'
    body, headers = signed(value)
    with pytest.raises(billing.Error, match='signature or payload'):
        billing.verify_event(body, headers['Stripe-Signature'], config)


@pytest.mark.parametrize('mode,returned', [('live', False), ('sandbox', True), ('live', None)])
def test_transport_rejects_wrong_or_missing_mode(mode, returned):
    config = live_settings() if mode == 'live' else sandbox_settings()
    transport = httpx.MockTransport(lambda req: httpx.Response(200, json={'id':'sub_test', 'livemode': returned}))
    with pytest.raises(billing.Error, match='object'):
        billing.StripeSandboxClient(config, transport=transport).request('GET', 'subscriptions/sub_test')


def test_mode_endpoint_available_to_all_admins_not_users(client, db_session_factory, account, monkeypatch):
    from app.models.user import User
    monkeypatch.setattr(get_settings(), 'stripe_mode', 'live')
    route = '/api/v1/admin/subscription-testing/mode'
    assert client.get(route, headers=account[1]).json()['mode'] == 'live'
    response = _register(client, email='mode-admin@example.com', full_name='Mode Admin')
    auth = _authorization(response)
    assert client.get(route, headers=auth).status_code == 403
    from uuid import UUID
    with db_session_factory() as db:
        user = db.get(User, UUID(response.json()['user']['id']))
        user.role = 'admin'
        db.commit()
    result = client.get(route, headers=auth)
    assert result.status_code == 200 and result.json()['mode'] == 'live'
    assert set(result.json()) == {'mode', 'checkout_enabled'}
    assert client.get(route).status_code == 401
    assert client.get('/api/v1/subscription/plans').json()['sandbox'] is False


def test_legacy_checkout_binds_database_to_sandbox(account, db_session_factory):
    with db_session_factory() as db:
        db.add(SandboxCheckout(user_id=account[0], plan_revision_id=1, interval='monthly',
            price_id='price_month', parameters={}))
        db.commit()
        with pytest.raises(billing.Error, match='bound to Stripe sandbox'):
            ensure_database_mode(db, live_settings())
        db.rollback()
        ensure_database_mode(db, sandbox_settings())
        db.commit()
        assert db.get(StripeEnvironment, 1).mode == 'sandbox'


def test_live_product_picker_and_wrong_mode_prices():
    from test_plan_editor import catalogue_mock, PRICE
    from app.services.stripe_catalogue_service import list_products
    mock, _ = catalogue_mock()
    def handle(request):
        response = mock.handle_request(request)
        return httpx.Response(200, json=live_value(response.json()))
    rows = list_products(live_settings(), transport=httpx.MockTransport(handle))
    assert rows[0]['prices'][0]['amount'] == '9.00'
    with pytest.raises(billing.Error, match='wrong-mode'):
        list_products(live_settings(), transport=mock)


@pytest.mark.parametrize('returned_live', [True, False])
def test_live_schedule_verification(account, returned_live):
    from app.models.subscription_change import SubscriptionChange
    from app.services.billing_change_observation import verified_schedule
    checkout = SandboxCheckout(parameters={'metadata[radar_mode]': 'live'},
        subscription_id='sub_live', customer_id='cus_live')
    change = SubscriptionChange(schedule_id='sub_sched_live')
    value = {'id': 'sub_sched_live', 'object': 'subscription_schedule',
        'livemode': returned_live, 'customer': 'cus_live', 'subscription': 'sub_live'}
    client = billing.StripeSandboxClient(live_settings(),
        transport=httpx.MockTransport(lambda req: httpx.Response(200, json=value)))
    if returned_live:
        assert verified_schedule(client=client, checkout=checkout, change=change) == value
    else:
        with pytest.raises(billing.Error):
            verified_schedule(client=client, checkout=checkout, change=change)
