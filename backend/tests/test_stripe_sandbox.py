from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import json
import time
from types import SimpleNamespace
from urllib.parse import parse_qs
from uuid import UUID, uuid4

import httpx
import pytest
from pydantic import SecretStr
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import sessionmaker

from app.core.config import get_settings
from app.db.base import Base
from app.models.stripe_sandbox import SandboxCheckout, SandboxStripeEvent
from app.models.subscription_plan import SubscriptionPlanRevision
from app.models.user import User
from app.services import stripe_sandbox_service as billing
from test_digests import _authorization, _register, _super_admin_login, PASSWORD
from test_stripe_catalogue import configuration, transport as catalogue_transport

URL = '/api/v1/admin/subscription-testing'
WEBHOOK = '/api/v1/webhooks/stripe-sandbox'


def settings():
    return SimpleNamespace(stripe_sandbox_api_key=SecretStr('rk_test_fake'),
        stripe_sandbox_webhook_secret=SecretStr('whsec_testing'), stripe_sandbox_checkout_enabled=True,
        stripe_sandbox_portal_configuration_id='bpc_test', frontend_base_url='https://radar.example')


class Provider:
    """Fake HTTP provider, including idempotency and mutable canonical objects."""
    def __init__(self):
        self.calls, self.sessions, self.subscriptions, self.idempotency = [], {}, {}, {}
        self.timeout_once, self.fail_get, self.live, self.portal_updates = False, False, False, False
        catalogue, _ = catalogue_transport()
        self.catalogue = catalogue
        self.client = billing.StripeSandboxClient(settings(), transport=httpx.MockTransport(self.handle))

    def handle(self, request):
        path = request.url.path.removeprefix('/v1/')
        body = {key: values[0] for key, values in parse_qs(request.content.decode()).items()}
        self.calls.append((request.method, path, body, request.headers.get('Idempotency-Key')))
        if path.startswith(('products/', 'prices/')):
            return self.catalogue.handle_request(request)
        if self.fail_get and request.method == 'GET':
            return httpx.Response(503, json={'error': {'message': 'sensitive detail'}})
        if request.method == 'POST' and path == 'checkout/sessions':
            key = request.headers['Idempotency-Key']
            if key in self.idempotency:
                params, result = self.idempotency[key]
                assert params == body
            else:
                session_id = 'cs_test_' + str(len(self.sessions) + 1)
                result = {'id': session_id, 'object': 'checkout.session', 'livemode': False,
                    'mode': body['mode'], 'client_reference_id': body['client_reference_id'],
                    'metadata': {'radar_attempt_id': body['metadata[radar_attempt_id]'], 'radar_sandbox': '1'},
                    'status': 'open', 'subscription': None, 'customer': None,
                    'url': 'https://checkout.stripe.com/c/pay/' + session_id}
                self.sessions[session_id] = result
                self.idempotency[key] = body, result
            if self.timeout_once:
                self.timeout_once = False
                raise httpx.ReadTimeout('ambiguous result', request=request)
        elif path.startswith('checkout/sessions/'):
            result = self.sessions[path.split('/')[-1]]
        elif path.startswith('subscriptions/'):
            result = self.subscriptions[path.split('/')[-1]]
        elif path.startswith('billing_portal/configurations/'):
            result = {'id': 'bpc_test', 'livemode': False, 'active': True,
                      'features': {'subscription_update': {'enabled': self.portal_updates}, 'subscription_cancel': {'enabled': True}}}
        elif path == 'billing_portal/sessions':
            result = {'id': 'bps_test', 'object': 'billing_portal.session', 'customer': body['customer'], 'url': 'https://billing.stripe.com/p/session/test'}
        else:
            raise AssertionError(path)
        return httpx.Response(200, json={**result, **({'livemode': True} if self.live else {})})

    def complete(self, session_id='cs_test_1'):
        session = self.sessions[session_id]
        sub_id = 'sub_' + session_id.removeprefix('cs_test_')
        sub = {'id': sub_id, 'object': 'subscription', 'livemode': False, 'metadata': dict(session['metadata']),
               'customer': 'cus_' + sub_id, 'status': 'active', 'cancel_at_period_end': False,
               'items': {'data': [{'price': {'id': 'price_month'}, 'quantity': 1, 'current_period_end': 1900000000}]}}
        self.subscriptions[sub_id] = sub
        session.update(status='complete', subscription=sub_id, customer=sub['customer'], url=None)
        return sub


@pytest.fixture
def account(client, db_session_factory):
    response = _super_admin_login(client, db_session_factory)
    headers = _authorization(response)
    user_id = UUID(response.json()['user']['id'])
    with db_session_factory() as db:
        db.add(SubscriptionPlanRevision(code='explorer', revision=1, configuration=configuration(),
                                       created_by=user_id, change_note='Sandbox test'))
        db.commit()
    return user_id, headers


def event(obj, *, event_id='evt_test', event_type='customer.subscription.updated'):
    return {'id': event_id, 'object': 'event', 'livemode': False, 'type': event_type, 'data': {'object': obj}}


def signed(value, *, timestamp=None):
    body = json.dumps(value).encode()
    stamp = str(int(time.time()) if timestamp is None else timestamp)
    signature = hmac.new(b'whsec_testing', stamp.encode() + b'.' + body, hashlib.sha256).hexdigest()
    return body, {'Stripe-Signature': f't={stamp},v1={signature}'}


def test_timeout_retry_uses_durable_intent_and_same_parameters(account, db_session_factory):
    provider = Provider()
    provider.timeout_once = True
    with db_session_factory() as db:
        with pytest.raises(billing.Error, match='resume safely'):
            billing.start_checkout(db, settings(), account[0], 1, 'monthly', client=provider.client)
        db.rollback()
        row = billing.latest(db, account[0])
        assert row.checkout_status == 'creating' and row.checkout_id is None
        result = billing.start_checkout(db, settings(), account[0], 1, 'monthly', client=provider.client)
        assert result['url'].startswith('https://checkout.stripe.com/')
        assert billing.start_checkout(db, settings(), account[0], 1, 'monthly', client=provider.client) == result
        assert db.scalar(select(func.count()).select_from(SandboxCheckout)) == 1
    posts = [call for call in provider.calls if call[:2] == ('POST', 'checkout/sessions')]
    assert len(posts) == 2 and posts[0][2:] == posts[1][2:] and len(provider.sessions) == 1
    params = posts[0][2]
    assert params['line_items[0][price]'] == 'price_month' and params['automatic_tax[enabled]'] == 'false'
    assert params['subscription_data[metadata][radar_attempt_id]'] == params['client_reference_id']
    assert params['success_url'] == 'https://radar.example/admin/subscription-testing?stripe_return=checkout'


def test_webhook_lifecycle_dedup_order_and_new_checkout_after_cancellation(account, db_session_factory):
    provider = Provider()
    with db_session_factory() as db:
        billing.start_checkout(db, settings(), account[0], 1, 'monthly', client=provider.client)
        subscription = provider.complete()
        first = event(dict(subscription))
        billing.handle_event(db, settings(), first, client=provider.client)
        calls = len(provider.calls)
        billing.handle_event(db, settings(), first, client=provider.client)
        assert len(provider.calls) == calls
        assert billing.latest(db, account[0]).subscription_status == 'active'
        with pytest.raises(billing.Error, match='already have'):
            billing.start_checkout(db, settings(), account[0], 1, 'annual', client=provider.client)
        db.rollback()
        for i, status in enumerate(['past_due', 'active', 'unpaid', 'canceled']):
            subscription.update(status=status, cancel_at_period_end=status == 'active')
            subscription['items']['data'][0]['current_period_end'] += 10000
            # Event snapshot still says active. Only the current provider object is applied.
            billing.handle_event(db, settings(), event(first['data']['object'], event_id=f'evt_{i}'), client=provider.client)
            row = billing.latest(db, account[0])
            assert row.subscription_status == status
            assert row.cancel_at_period_end == (status == 'active')
            assert int(billing.utc(row.period_end).timestamp()) == 1900000000 + (i + 1) * 10000
        billing.start_checkout(db, settings(), account[0], 1, 'annual', client=provider.client)
        assert len(provider.sessions) == 2
        assert billing.latest(db, account[0]).interval == 'annual'
        assert db.scalar(select(func.count()).select_from(SandboxStripeEvent)) == 5


def test_subscription_event_can_arrive_before_checkout_response(account, db_session_factory):
    provider = Provider()
    provider.timeout_once = True
    with db_session_factory() as db:
        with pytest.raises(billing.Error):
            billing.start_checkout(db, settings(), account[0], 1, 'monthly', client=provider.client)
        db.rollback()
        sub = provider.complete()
        billing.handle_event(db, settings(), event(sub), client=provider.client)
        row = billing.latest(db, account[0])
        assert row.checkout_id is None and row.subscription_status == 'active'
        with pytest.raises(billing.Error, match='already have'):
            billing.start_checkout(db, settings(), account[0], 1, 'monthly', client=provider.client)
        db.rollback()
        billing.handle_event(db, settings(), event(provider.sessions['cs_test_1'], event_id='evt_checkout',
                             event_type='checkout.session.completed'), client=provider.client)
        assert billing.latest(db, account[0]).checkout_id == 'cs_test_1'


def test_expired_checkout_and_unresolved_old_attempt(account, db_session_factory):
    provider = Provider()
    with db_session_factory() as db:
        billing.start_checkout(db, settings(), account[0], 1, 'monthly', client=provider.client)
        provider.sessions['cs_test_1']['status'] = 'expired'
        billing.start_checkout(db, settings(), account[0], 1, 'annual', client=provider.client)
        assert len(provider.sessions) == 2
        row = billing.latest(db, account[0])
        row.checkout_id, row.checkout_status = None, 'creating'
        row.created_at = datetime.now(timezone.utc) - timedelta(hours=25)
        # Make this the only record, to exercise the unresolved retry safety fence.
        for other in db.scalars(select(SandboxCheckout).where(SandboxCheckout.id != row.id)):
            db.delete(other)
        db.commit()
        before = len(provider.calls)
        with pytest.raises(billing.Error, match='too old'):
            billing.start_checkout(db, settings(), account[0], 1, 'annual', client=provider.client)
        assert len(provider.calls) == before


def test_portal_is_own_customer_and_disallows_plan_switches(account, db_session_factory):
    provider = Provider()
    with db_session_factory() as db:
        billing.start_checkout(db, settings(), account[0], 1, 'monthly', client=provider.client)
        sub = provider.complete()
        billing.refresh(db, settings(), account[0], client=provider.client)
        result = billing.portal(db, settings(), account[0], client=provider.client)
        assert result['url'].startswith('https://billing.stripe.com/')
        assert provider.calls[-1][2]['customer'] == sub['customer']
        provider.portal_updates = True
        with pytest.raises(billing.Error, match='disable subscription'):
            billing.portal(db, settings(), account[0], client=provider.client)
        db.rollback()
        sub['items']['data'][0]['price']['id'] = 'price_edited'
        billing.refresh(db, settings(), account[0], client=provider.client)
        assert billing.latest(db, account[0]).price_matches is False


@pytest.mark.parametrize('change', ['disabled', 'live_key', 'no_secret', 'archived', 'trial', 'revision', 'price_mismatch', 'live_response'])
def test_fail_closed_checkout(account, db_session_factory, change):
    provider, config = Provider(), settings()
    revision = 1
    if change == 'disabled': config.stripe_sandbox_checkout_enabled = False
    if change == 'no_secret': config.stripe_sandbox_webhook_secret = None
    if change == 'live_key': config.stripe_sandbox_api_key = SecretStr('sk_live_fake')
    if change == 'live_response': provider.live = True
    with db_session_factory() as db:
        plan = billing.explorer(db)
        if change in ('archived', 'trial', 'price_mismatch'):
            plan.configuration = {**plan.configuration, **({'state': 'archived'} if change == 'archived' else
                {'trial_days': 7} if change == 'trial' else {'monthly_price': '99.00'})}
            db.commit()
        if change == 'revision': revision = 9
        with pytest.raises(billing.Error):
            billing.start_checkout(db, config, account[0], revision, 'monthly',
                **({} if change == 'live_key' else {'client': provider.client}))
        db.rollback()
        assert not billing.latest(db, account[0]) or change == 'live_response'
    if change != 'live_response': assert not provider.sessions


@pytest.mark.parametrize('mutation', ['no_signature', 'old', 'future', 'altered', 'live', 'bad_json'])
def test_signature_validation(mutation):
    value = event({})
    if mutation == 'live': value['livemode'] = True
    offset = -301 if mutation == 'old' else 301 if mutation == 'future' else 0
    body, headers = signed(value, timestamp=int(time.time()) + offset)
    signature = headers['Stripe-Signature']
    if mutation == 'no_signature': signature = ''
    if mutation == 'altered': body += b' '
    if mutation == 'bad_json': body = b'garbage'
    with pytest.raises(billing.Error) as error:
        billing.verify_event(body, signature, settings())
    assert error.value.status_code == 400


def test_failed_webhook_can_retry_without_losing_event(account, db_session_factory):
    provider = Provider()
    with db_session_factory() as db:
        billing.start_checkout(db, settings(), account[0], 1, 'monthly', client=provider.client)
        value = event(provider.complete())
        provider.fail_get = True
        with pytest.raises(billing.Error):
            billing.handle_event(db, settings(), value, client=provider.client)
        db.rollback()
        assert db.get(SandboxStripeEvent, value['id']) is None
        provider.fail_get = False
        billing.handle_event(db, settings(), value, client=provider.client)
        assert db.get(SandboxStripeEvent, value['id']) is not None


def test_admin_apis_ownership_and_public_signed_webhook(client, account, db_session_factory, monkeypatch):
    provider = Provider()
    config = get_settings()
    for name, value in vars(settings()).items():
        monkeypatch.setattr(config, name, value)
    monkeypatch.setattr(billing, 'StripeSandboxClient', lambda _: provider.client)
    regular_response = _register(client, 'billing@example.com', 'Billing admin')
    regular = _authorization(regular_response)
    for method, suffix, body in [('GET', '', None), ('POST', '/checkout', {'revision': 1, 'interval': 'monthly'}),
                                  ('POST', '/refresh', None), ('POST', '/portal', None)]:
        assert client.request(method, URL + suffix, json=body).status_code == 401
        assert client.request(method, URL + suffix, json=body, headers=regular).status_code == 403
    assert not provider.calls
    response = client.post(URL + '/checkout', json={'revision': 1, 'interval': 'monthly'}, headers=account[1])
    assert response.status_code == 200, response.text
    assert client.get(URL, headers=account[1]).json()['attempts'][0]['checkout_status'] == 'open'
    assert client.post(URL + '/checkout', json={'revision': 1, 'interval': 'monthly', 'customer': 'cus_victim'}, headers=account[1]).status_code == 422
    uid = regular_response.json()['user']['id']
    client.put(f'/api/v1/admin/users/{uid}/role', json={'role': 'admin'}, headers=account[1])
    admin = _authorization(client.post('/api/v1/auth/login', json={'email': 'billing@example.com', 'password': PASSWORD}))
    assert client.get(URL, headers=admin).json()['attempts'] == []
    assert client.post(URL + '/portal', headers=admin).status_code == 409
    body, headers = signed(event(provider.complete()))
    assert client.post(WEBHOOK, content=body).status_code == 400
    response = client.post(WEBHOOK, content=body, headers={**headers, 'X-Radar-Request': '', 'Origin': 'https://stripe.example'})
    assert response.status_code == 200, response.text
    assert response.json()['queued'] is True
    assert client.get(URL, headers=account[1]).json()['attempts'][0]['subscription_status'] is None
    from app.services.billing_sync_service import tick
    tick(db_session_factory, config, client=provider.client)
    assert client.get(URL, headers=account[1]).json()['attempts'][0]['subscription_status'] == 'active'
    # Regular browser endpoint origin guard is untouched.
    assert client.post(URL + '/refresh', headers={**account[1], 'Origin': 'https://hostile.example'}).status_code == 403


def test_concurrent_checkout_and_duplicate_webhooks_use_one_attempt(tmp_path):
    engine = create_engine(f'sqlite:///{tmp_path / "billing.db"}', connect_args={'check_same_thread': False, 'timeout': 30})
    Base.metadata.create_all(engine)
    sessions = sessionmaker(engine, autoflush=False, expire_on_commit=False)
    with sessions() as db:
        user = User(id=uuid4(), email='race@example.com', full_name='Admin', password_hash='unused')
        db.add(user); db.flush()
        uid = user.id
        db.add(SubscriptionPlanRevision(code='explorer', revision=1, configuration=configuration(), change_note='Test', created_by=uid))
        db.commit()
    provider = Provider()
    def checkout(_):
        with sessions() as db:
            return billing.start_checkout(db, settings(), uid, 1, 'monthly', client=provider.client)
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(checkout, range(2)))
    assert results[0] == results[1] and len(provider.sessions) == 1
    value = event(provider.complete())
    def receive(_):
        with sessions() as db:
            return billing.handle_event(db, settings(), value, client=provider.client)
    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(receive, range(2)))
    with sessions() as db:
        assert db.scalar(select(func.count()).select_from(SandboxCheckout)) == 1
        assert db.scalar(select(func.count()).select_from(SandboxStripeEvent)) == 1
    engine.dispose()


@pytest.mark.parametrize('url', ['http://checkout.stripe.com/pay', 'https://checkout.stripe.com.attacker.test/',
    'https://checkout.stripe.com@attacker.test/', 'javascript:alert(1)', 'https://127.0.0.1/', None])
def test_only_hosted_stripe_redirects_are_accepted(url):
    with pytest.raises(billing.Error):
        billing.redirect_url(url, 'checkout.stripe.com')


def test_plan_edit_cannot_change_pending_checkout_and_body_limit(client, account, db_session_factory, monkeypatch):
    provider = Provider()
    with db_session_factory() as db:
        first = billing.start_checkout(db, settings(), account[0], 1, 'monthly', client=provider.client)
        db.add(SubscriptionPlanRevision(code='explorer', revision=2,
            configuration={**configuration(), 'monthly_price': '15.00'}, created_by=account[0], change_note='New price'))
        db.commit()
        with pytest.raises(billing.Error, match='earlier checkout'):
            billing.start_checkout(db, settings(), account[0], 2, 'annual', client=provider.client)
        db.rollback()
        assert billing.start_checkout(db, settings(), account[0], 1, 'monthly', client=provider.client) == first
        assert billing.overview(db, settings(), account[0])['attempts'][0]['revision'] == 1
    assert client.post(WEBHOOK, content=b'x' * 1_048_577).status_code == 413


def test_mismatched_subscription_metadata_cannot_attach_customer(account, db_session_factory):
    provider = Provider()
    with db_session_factory() as db:
        billing.start_checkout(db, settings(), account[0], 1, 'monthly', client=provider.client)
        sub = provider.complete()
        snapshot = {**sub, 'metadata': dict(sub['metadata'])}
        sub['metadata']['radar_attempt_id'] = str(uuid4())
        with pytest.raises(billing.Error, match='does not match'):
            billing.handle_event(db, settings(), event(snapshot), client=provider.client)
        db.rollback()
        assert billing.latest(db, account[0]).customer_id is None
        assert db.scalar(select(func.count()).select_from(SandboxStripeEvent)) == 0
