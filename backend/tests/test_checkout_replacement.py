"""Real owner-scoped API / PostgreSQL lifecycle with a deterministic Stripe double."""
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

import httpx
import pytest
from sqlalchemy import func, select

from app.models.stripe_sandbox import SandboxCheckout
from app.models.subscription_plan import SubscriptionPlanRevision as Plan
from app.services import checkout_replacement_service as replacement
from app.services import stripe_sandbox_service as billing
from app.services.billing_provider import StripeSandboxClient
from test_subscriber_billing import subscriber  # noqa: F401
from test_stripe_sandbox import account, Provider, event, settings  # noqa: F401
from test_digests import _authorization, _register

ROOT = '/api/v1/subscription/billing'


class ReplacementProvider(Provider):
    def __init__(self):
        super().__init__()
        self.client = StripeSandboxClient(settings(), transport=httpx.MockTransport(self.handle))
        self.expire_mode = 'ok'
        self.expirations = []
        self.expiration_attempts = 0

    def handle(self, request):
        path = request.url.path.removeprefix('/v1/')
        if request.method == 'POST' and path.endswith('/expire'):
            sid = path.split('/')[-2]
            self.calls.append(('POST', path, {}, request.headers.get('Idempotency-Key')))
            self.expiration_attempts += 1
            if self.expire_mode == 'complete':
                self.complete(sid)
            if self.expire_mode == 'before':
                raise httpx.ReadTimeout('before expiration', request=request)
            session = self.sessions[sid]
            if session['status'] != 'open':
                return httpx.Response(400, json={'error': {'message': 'not open'}})
            session.update(status='expired', url=None)
            self.expirations.append(sid)
            if self.expire_mode in {'after', 'unknown'}:
                if self.expire_mode == 'unknown': self.fail_get = True
                raise httpx.ReadTimeout('after expiration', request=request)
            return httpx.Response(200, json=session)
        response = super().handle(request)
        if response.status_code == 200 and path.startswith('checkout/sessions'):
            data = response.json()
            session = self.sessions[data['id']]
            session.setdefault('payment_status', 'unpaid')
            data['payment_status'] = session['payment_status']
            return httpx.Response(200, json=data)
        return response


@pytest.fixture
def pending(client, subscriber, monkeypatch, db_session_factory):
    uid, auth, _ = subscriber
    provider = ReplacementProvider()
    monkeypatch.setattr(billing, 'StripeSandboxClient', lambda *a, **k: provider.client)
    with db_session_factory() as db:
        base = db.get(Plan, 1)
        # Separate catalogue tier; real catalogue/mapping validation still runs.
        for code, name in [('researcher', 'Researcher'), ('professional', 'Professional')]:
            c = deepcopy(base.configuration)
            c['name'] = name
            db.add(Plan(code=code, revision=1, configuration=c, change_note='Replacement fixture'))
        db.commit()
    result = client.post(ROOT + '/checkout', headers=auth, json={'code': 'explorer', 'revision': 1, 'interval': 'monthly'})
    assert result.status_code == 200, result.text
    original = client.get(ROOT, headers=auth).json()['attempt']
    assert original['price'] == '9.00' and original['currency'] == 'EUR'
    return uid, auth, provider, original


def body(original, code='researcher', interval='annual', revision=1):
    return dict(expected_attempt_id=original['id'], code=code, revision=revision, interval=interval)


@pytest.mark.parametrize('code,interval', [('researcher', 'monthly'), ('researcher', 'annual'), ('explorer', 'annual')])
def test_confirmed_replacement_expires_then_creates_and_retains_history(client, pending, db_session_factory, code, interval):
    uid, auth, provider, original = pending
    old_parameters = deepcopy(provider.idempotency[next(iter(provider.idempotency))][0])
    before = len(provider.calls)
    result = client.post(ROOT + '/checkout/replace', headers=auth, json=body(original, code, interval))
    assert result.status_code == 200, result.text
    assert result.json()['url'].endswith('cs_test_2')
    assert provider.sessions['cs_test_1']['status'] == 'expired'
    assert provider.expirations == ['cs_test_1']
    writes = [(method, path) for method, path, *_ in provider.calls[before:] if method == 'POST']
    assert writes == [('POST', 'checkout/sessions/cs_test_1/expire'), ('POST', 'checkout/sessions')]
    with db_session_factory() as db:
        source = db.get(SandboxCheckout, UUID(original['id']))
        successor = billing.latest(db, uid)
        assert source.parameters == old_parameters
        assert source.replacement_intent['state'] == 'replaced'
        assert source.replacement_intent['successor_id'] == str(successor.id)
        assert successor.interval == interval
        assert source.subscription_id is None and successor.subscription_id is None
        assert db.scalar(select(func.count()).select_from(SandboxCheckout)) == 2
    state = client.get(ROOT, headers=auth).json()
    assert state['resume_allowed'] and state['replace_allowed'] and not state['checkout_allowed']
    assert state['attempt']['code'] == code and state['attempt']['interval'] == interval
    assert state['replacement'] is None
    stale_resume = client.post(ROOT + '/resume', headers=auth, json={'expected_attempt_id': original['id']})
    assert stale_resume.status_code == 409


def test_same_selection_resumes_without_expiration_and_reads_never_write(client, pending):
    _, auth, provider, original = pending
    count = len(provider.calls)
    for _ in range(2):
        assert client.get(ROOT, headers=auth).status_code == 200
        assert client.get('/api/v1/subscription/plans').status_code == 200
    assert len(provider.calls) == count
    result = client.post(ROOT + '/checkout/replace', headers=auth, json=body(original, 'explorer', 'monthly'))
    assert result.status_code == 200 and result.json()['url'].endswith('cs_test_1')
    assert provider.expiration_attempts == 0 and len(provider.sessions) == 1


@pytest.mark.parametrize('invalid', ['stale', 'hidden', 'trial', 'missing-price', 'mapping', 'free'])
def test_invalid_target_never_invalidates_original(client, pending, db_session_factory, invalid):
    _, auth, provider, original = pending
    payload = body(original)
    with db_session_factory() as db:
        target = db.scalar(select(Plan).where(Plan.code == 'researcher'))
        c = deepcopy(target.configuration)
        if invalid == 'stale': payload['revision'] = 900
        if invalid == 'hidden': c['subscriber_visible'] = False
        if invalid == 'trial': c['trial_days'] = 7
        if invalid == 'missing-price': c['stripe_sandbox']['annual_price_id'] = None
        if invalid == 'mapping': c['annual_price'] = '999.00'
        if invalid == 'free': c['billing_type'] = 'free'
        target.configuration = c
        db.commit()
    before = len(provider.calls)
    result = client.post(ROOT + '/checkout/replace', headers=auth, json=payload)
    assert result.status_code in (409, 422), result.text
    assert not any(c[0] == 'POST' for c in provider.calls[before:])
    assert provider.sessions['cs_test_1']['status'] == 'open'
    assert len(provider.sessions) == 1


@pytest.mark.parametrize('mode', ['after', 'before', 'unknown'])
def test_ambiguous_expiration_reconciles_before_creating(client, pending, db_session_factory, mode):
    uid, auth, provider, original = pending
    provider.expire_mode = mode
    result = client.post(ROOT + '/checkout/replace', headers=auth, json=body(original))
    if mode == 'after':
        assert result.status_code == 200, result.text
        assert len(provider.sessions) == 2
        return
    assert result.status_code == 503, result.text
    assert len(provider.sessions) == 1
    state = client.get(ROOT, headers=auth).json()
    assert state['replacement']['code'] == 'researcher'
    assert not state['checkout_allowed'] and not state['replace_allowed']
    assert state['resume_allowed']
    # A stale resume of the original cannot silently resume a new target.
    stale = client.post(ROOT + '/resume', headers=auth, json={'expected_attempt_id': original['id']})
    assert stale.status_code == 409
    blocked = client.post(ROOT + '/checkout/replace', headers=auth, json=body(original, 'professional'))
    assert blocked.status_code == 409
    provider.expire_mode = 'ok'; provider.fail_get = False
    resumed = client.post(ROOT + '/resume', headers=auth, json={
        'expected_attempt_id': original['id'], 'expected_replacement_id': state['replacement']['id']})
    assert resumed.status_code == 200, resumed.text
    assert len(provider.sessions) == 2
    with db_session_factory() as db:
        assert billing.latest(db, uid).checkout_id == 'cs_test_2'


@pytest.mark.parametrize('when', ['before-read', 'during-expire', 'complete-without-subscription'])
def test_completion_wins_race_without_second_subscription(client, pending, when):
    _, auth, provider, original = pending
    if when == 'before-read': provider.complete()
    if when == 'during-expire': provider.expire_mode = 'complete'
    if when == 'complete-without-subscription': provider.sessions['cs_test_1']['status'] = 'complete'
    result = client.post(ROOT + '/checkout/replace', headers=auth, json=body(original))
    assert result.status_code in (409, 503), result.text
    assert len(provider.sessions) == 1
    assert provider.expirations == []


@pytest.mark.parametrize('status', ['incomplete', 'past_due', 'unpaid', 'active', 'trialing'])
def test_subscription_is_not_treated_as_abandoned_checkout(client, pending, status):
    _, auth, provider, original = pending
    provider.complete()['status'] = status
    result = client.post(ROOT + '/checkout/replace', headers=auth, json=body(original))
    assert result.status_code == 409, result.text
    assert len(provider.sessions) == 1 and provider.expiration_attempts == 0


@pytest.mark.parametrize('invalid', ['paid', 'recovery', 'mode'])
def test_unverified_or_recoverable_old_session_is_not_replaced(client, pending, invalid):
    _, auth, provider, original = pending
    session = provider.sessions['cs_test_1']
    if invalid == 'paid': session['payment_status'] = 'paid'
    if invalid == 'recovery': session['after_expiration'] = {'recovery': {'enabled': True}}
    if invalid == 'mode': session['livemode'] = True
    result = client.post(ROOT + '/checkout/replace', headers=auth, json=body(original))
    assert result.status_code in (409, 502, 503), result.text
    assert provider.expiration_attempts == 0 and len(provider.sessions) == 1


def test_successor_timeout_uses_same_durable_successor_and_idempotency_key(client, pending, db_session_factory):
    uid, auth, provider, original = pending
    provider.timeout_once = True
    result = client.post(ROOT + '/checkout/replace', headers=auth, json=body(original))
    assert result.status_code == 503
    with db_session_factory() as db:
        successor = billing.latest(db, uid)
        assert successor.checkout_status == 'creating' and str(successor.id) != original['id']
    retry = client.post(ROOT + '/checkout/replace', headers=auth, json=body(original))
    assert retry.status_code == 200, retry.text
    assert len(provider.sessions) == 2
    state = client.get(ROOT, headers=auth).json()
    assert state['attempt']['code'] == 'researcher'
    assert len({c[3] for c in provider.calls if c[:2] == ('POST', 'checkout/sessions')}) == 2


def test_repeated_replacement_does_not_expire_unrelated_successor(client, pending):
    _, auth, provider, original = pending
    first = client.post(ROOT + '/checkout/replace', headers=auth, json=body(original))
    assert first.status_code == 200
    assert client.post(ROOT + '/checkout/replace', headers=auth, json=body(original)).json() == first.json()
    assert client.post(ROOT + '/checkout/replace', headers=auth, json=body(original, 'professional')).status_code == 409
    second_original = client.get(ROOT, headers=auth).json()['attempt']
    assert client.post(ROOT + '/checkout/replace', headers=auth, json=body(second_original, 'professional')).status_code == 200
    assert client.post(ROOT + '/checkout/replace', headers=auth, json=body(original)).status_code == 409
    assert provider.sessions['cs_test_3']['status'] == 'open'


def test_owner_binding_checked_before_provider_requests(client, pending):
    _, auth, provider, original = pending
    other = _authorization(_register(client, 'other-checkout@example.com', 'Other'))
    before = len(provider.calls)
    result = client.post(ROOT + '/checkout/replace', headers=other, json=body(original))
    assert result.status_code in (403, 404)
    assert client.post(ROOT + '/checkout/replace', headers=auth, json=body({'id': str(uuid4())})).status_code == 404
    assert len(provider.calls) == before


@pytest.mark.parametrize('old', [False, True])
def test_unknown_original_creation_recovers_exact_request_or_fails_closed(client, pending, db_session_factory, old):
    uid, auth, provider, original = pending
    with db_session_factory() as db:
        source = db.get(SandboxCheckout, UUID(original['id']))
        source.checkout_id = None; source.checkout_status = 'creating'
        if old: source.created_at = datetime.now(timezone.utc) - timedelta(hours=24)
        db.commit()
    before = len([c for c in provider.calls if c[0] == 'POST'])
    result = client.post(ROOT + '/checkout/replace', headers=auth, json=body(original))
    if old:
        assert result.status_code == 409
        assert len([c for c in provider.calls if c[0] == 'POST']) == before
        assert len(provider.sessions) == 1
    else:
        assert result.status_code == 200, result.text
        assert len(provider.sessions) == 2
        old_calls = [c for c in provider.calls if c[:2] == ('POST', 'checkout/sessions') and c[2]['line_items[0][price]'] == 'price_month']
        assert old_calls[0][2:] == old_calls[1][2:]


def test_two_tabs_with_different_targets_cannot_replace_each_other(db_session_factory, pending):
    uid, _, provider, original = pending
    def choose(code):
        with db_session_factory() as db:
            try:
                return replacement.replace(db, settings(), uid, UUID(original['id']), code, 1, 'annual', client=provider.client)
            except billing.Error as e:
                db.rollback()
                return e.status_code
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(choose, ['researcher', 'professional']))
    assert sum(isinstance(r, dict) for r in results) == 1
    assert 409 in results
    assert len(provider.sessions) == 2 and len(provider.expirations) == 1


def test_stale_original_webhook_uses_canonical_expired_session(client, pending, db_session_factory):
    uid, auth, provider, original = pending
    old_snapshot = deepcopy(provider.sessions['cs_test_1'])
    assert client.post(ROOT + '/checkout/replace', headers=auth, json=body(original)).status_code == 200
    with db_session_factory() as db:
        billing.handle_event(db, settings(), event(old_snapshot, event_id='evt_late', event_type='checkout.session.expired'), client=provider.client)
        assert billing.latest(db, uid).checkout_id == 'cs_test_2'
        assert db.get(SandboxCheckout, UUID(original['id'])).checkout_status == 'expired'
