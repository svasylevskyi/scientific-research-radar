from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from uuid import UUID, uuid4
import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import sessionmaker
from app.db.base import Base
from app.db.session import build_engine
from app.models.billing_sync import BillingSyncJob as Job, BillingSyncHeartbeat
from app.models.stripe_sandbox import SandboxCheckout, SandboxStripeEvent
from app.models.user import User
from app.models.subscription_plan import SubscriptionPlanRevision
from app.services import billing_sync_service as sync, stripe_sandbox_service as billing
from app.core.config import get_settings
from test_stripe_sandbox import Provider, account, event, settings, signed, WEBHOOK
from test_stripe_catalogue import configuration
from test_digests import _authorization, _register, PASSWORD

URL = '/api/v1/admin/billing-sync'


def config():
    value = settings()
    value.stripe_sync_reconcile_seconds = 900
    value.stripe_sync_max_failures = 3
    value.stripe_sync_poll_seconds = 5
    return value


def checkout(factory, account, provider):
    with factory() as db:
        billing.start_checkout(db, config(), account[0], 1, 'monthly', client=provider.client)
        return billing.latest(db, account[0]).id


def test_receipt_is_durable_minimal_and_no_provider_call(client, account, db_session_factory, monkeypatch):
    provider = Provider()
    checkout(db_session_factory, account, provider)
    sub = provider.complete()
    sub['customer_details'] = {'email': 'private@example.com'}
    monkeypatch.setattr(get_settings(), 'stripe_sandbox_webhook_secret', config().stripe_sandbox_webhook_secret)
    value = event(sub)
    body, headers = signed(value)
    calls = len(provider.calls)
    assert client.post(WEBHOOK, content=body, headers=headers).json()['queued']
    assert client.post(WEBHOOK, content=body, headers=headers).json()['queued']
    with db_session_factory() as db:
        job = db.get(Job, value['id'])
        assert job.state == 'pending' and job.attempts == 0
        assert 'private@example.com' not in str(job.payload) and 'customer_details' not in str(job.payload)
        assert db.scalar(select(func.count()).select_from(Job)) == 1
        assert db.get(SandboxStripeEvent, value['id']) is None
        assert billing.latest(db, account[0]).subscription_status is None
    assert len(provider.calls) == calls
    # A separate worker/session processes the committed inbox after the HTTP request.
    sync.tick(db_session_factory, config(), client=provider.client)
    with db_session_factory() as db:
        assert db.get(Job, value['id']).state == 'processed'
        assert db.get(SandboxStripeEvent, value['id']) is not None
        assert billing.latest(db, account[0]).subscription_status == 'active'


def test_failure_backoff_exhaustion_and_authorized_retry(account, db_session_factory, monkeypatch):
    provider = Provider(); cid = checkout(db_session_factory, account, provider)
    stamp = sync.now()
    monkeypatch.setattr(sync, 'now', lambda: stamp)
    with db_session_factory() as db:
        sync.receive(db, config(), event(provider.complete()))
    provider.fail_get = True
    # Claim just the webhook, avoiding the independent reconciliation job here.
    for failure in range(1, 4):
        with db_session_factory() as db:
            claim = sync.claim(db)
        assert claim
        assert sync.process(db_session_factory, config(), *claim, client=provider.client) is False
        with db_session_factory() as db:
            job = db.get(Job, 'evt_test')
            assert job.failures == failure and job.last_error
            assert db.get(SandboxStripeEvent, 'evt_test') is None
            assert db.get(SandboxCheckout, cid).subscription_status is None
            if failure < 3:
                assert job.state == 'retry'
                assert billing.utc(job.next_attempt_at) == stamp + timedelta(seconds=30 * 2 ** (failure - 1))
                assert sync.claim(db) is None
            else:
                assert job.state == 'failed' and job.next_attempt_at is None
        stamp += timedelta(hours=1)
    with db_session_factory() as db:
        actor = db.get(User, account[0])
        sync.retry(db, actor, 'evt_test')
        claim = sync.claim(db)
    provider.fail_get = False
    assert sync.process(db_session_factory, config(), *claim, client=provider.client)
    with db_session_factory() as db:
        job = db.get(Job, 'evt_test')
        assert job.state == 'processed' and job.last_error is None
        assert job.attempts == 4 and job.manual_retries == 1 and job.retried_by == account[0]


def test_reconciliation_repairs_missed_events_and_stops_terminal_polling(account, db_session_factory, monkeypatch):
    provider = Provider(); cid = checkout(db_session_factory, account, provider)
    sub = provider.complete()  # No webhook at all.
    stamp = sync.now(); monkeypatch.setattr(sync, 'now', lambda: stamp)
    sync.tick(db_session_factory, config(), client=provider.client)
    with db_session_factory() as db:
        assert db.get(SandboxCheckout, cid).subscription_status == 'active'
        job = db.get(Job, 'reconcile:' + str(cid))
        assert job.state == 'processed' and job.last_success_at
        assert billing.utc(job.next_attempt_at) == stamp + timedelta(seconds=900)
        assert sync.claim(db) is None
    sub.update(status='past_due')
    stamp += timedelta(seconds=901)
    sync.tick(db_session_factory, config(), client=provider.client)
    with db_session_factory() as db:
        assert db.get(SandboxCheckout, cid).subscription_status == 'past_due'
    sub.update(status='canceled')
    stamp += timedelta(seconds=901)
    sync.tick(db_session_factory, config(), client=provider.client)
    with db_session_factory() as db:
        assert db.get(SandboxCheckout, cid).subscription_status == 'canceled'
        assert db.get(Job, 'reconcile:' + str(cid)).next_attempt_at is None


def test_expired_claim_recovers_and_fences_old_worker(account, db_session_factory, monkeypatch):
    provider = Provider(); checkout(db_session_factory, account, provider)
    stamp = sync.now(); monkeypatch.setattr(sync, 'now', lambda: stamp)
    with db_session_factory() as db:
        sync.receive(db, config(), event(provider.complete()))
        old_claim = sync.claim(db)
    stamp += timedelta(seconds=sync.LEASE_SECONDS + 1)
    with db_session_factory() as db:
        new_claim = sync.claim(db)
    assert new_claim[0] == old_claim[0] and new_claim[1] != old_claim[1]
    assert sync.process(db_session_factory, config(), *old_claim, client=provider.client) is False
    assert sync.process(db_session_factory, config(), *new_claim, client=provider.client)
    with db_session_factory() as db:
        assert db.get(Job, 'evt_test').attempts == 2


def test_lease_expiry_rolls_back_state_and_dedup_marker(account, db_session_factory, monkeypatch):
    provider = Provider(); cid = checkout(db_session_factory, account, provider)
    stamp = sync.now(); monkeypatch.setattr(sync, 'now', lambda: stamp)
    with db_session_factory() as db:
        sync.receive(db, config(), event(provider.complete()))
        claim = sync.claim(db)
    original = provider.client.request
    def slow(*args, **kwargs):
        nonlocal stamp
        result = original(*args, **kwargs)
        stamp += timedelta(seconds=sync.LEASE_SECONDS + 1)
        return result
    provider.client.request = slow
    assert sync.process(db_session_factory, config(), *claim, client=provider.client) is False
    with db_session_factory() as db:
        assert db.get(SandboxCheckout, cid).subscription_status is None
        assert db.get(SandboxStripeEvent, 'evt_test') is None
        assert db.get(Job, 'evt_test').state == 'processing'


def test_out_of_order_events_cannot_regress_cancellation(account, db_session_factory):
    provider = Provider(); cid = checkout(db_session_factory, account, provider)
    sub = provider.complete()
    with db_session_factory() as db:
        sync.receive(db, config(), event(sub))
    sub.update(status='canceled')
    sync.tick(db_session_factory, config(), client=provider.client)
    with db_session_factory() as db:
        sync.receive(db, config(), event({**sub, 'status': 'active'}, event_id='evt_old'))
    for _ in range(2):
        sync.tick(db_session_factory, config(), client=provider.client)
    with db_session_factory() as db:
        assert db.get(SandboxCheckout, cid).subscription_status == 'canceled'
        assert db.get(Job, 'evt_old').state == 'processed'


def test_admin_visibility_retry_permissions_and_heartbeat(client, account, db_session_factory):
    provider = Provider(); checkout(db_session_factory, account, provider)
    with db_session_factory() as db:
        sync.receive(db, config(), event(provider.complete()))
        job = db.get(Job, 'evt_test'); job.state = 'failed'; job.next_attempt_at = None; db.commit()
    regular = _register(client, 'sync@example.com', 'Sync admin')
    user_headers = _authorization(regular)
    assert client.get(URL).status_code == 401
    assert client.get(URL, headers=user_headers).status_code == 403
    uid = regular.json()['user']['id']
    client.put(f'/api/v1/admin/users/{uid}/role', headers=account[1], json={'role': 'admin'})
    admin = _authorization(client.post('/api/v1/auth/login', json={'email': 'sync@example.com', 'password': PASSWORD}))
    assert client.get(URL, headers=admin).json()['total'] == 0  # Protected super-admin.
    assert client.get(URL, headers=account[1]).json()['counts']['failed'] == 1
    assert client.post(URL + '/evt_test/retry', headers=admin).status_code == 404
    assert client.post(URL + '/evt_test/retry', headers=account[1]).status_code == 202
    assert client.post(URL + '/evt_test/retry', headers=account[1]).status_code == 409
    result = client.get(URL, headers=account[1]).json()
    assert result['worker_healthy'] is False
    sync.tick(db_session_factory, config(), client=provider.client)
    result = client.get(URL, headers=account[1]).json()
    assert result['worker_healthy'] is True
    assert all('payload' not in row and 'lease_token' not in row for row in result['items'])


def test_missing_identifier_is_actionable_and_never_creates_checkout(account, db_session_factory):
    provider = Provider(); cid = checkout(db_session_factory, account, provider)
    with db_session_factory() as db:
        row = db.get(SandboxCheckout, cid); row.checkout_id = None; row.checkout_status = 'creating'; db.commit()
    calls = len(provider.calls)
    sync.tick(db_session_factory, config(), client=provider.client)
    assert len(provider.calls) == calls
    with db_session_factory() as db:
        assert 'Resume the original checkout' in db.get(Job, 'reconcile:' + str(cid)).last_error


def test_concurrent_delivery_and_claim_have_one_winner(tmp_path):
    engine = build_engine(f'sqlite:///{tmp_path / "billing-sync.db"}')
    Base.metadata.create_all(engine)
    factory = sessionmaker(engine, autoflush=False, expire_on_commit=False)
    uid = uuid4()
    with factory() as db:
        db.add(User(id=uid, email='race@example.com', full_name='Race', password_hash='unused')); db.flush()
        db.add(SubscriptionPlanRevision(code='explorer', revision=1, configuration=configuration(), change_note='test', created_by=uid)); db.commit()
    provider = Provider(); checkout(factory, (uid, {}), provider)
    value = event(provider.complete())
    def receive(_):
        with factory() as db:
            sync.receive(db, config(), value)
    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(receive, range(2)))
    def claim(_):
        with factory() as db:
            return sync.claim(db)
    with ThreadPoolExecutor(max_workers=2) as pool:
        claims = list(pool.map(claim, range(2)))
    assert sum(item is not None for item in claims) == 1
    assert sync.process(factory, config(), *next(item for item in claims if item), client=provider.client)
    with factory() as db:
        assert db.scalar(select(func.count()).select_from(Job)) == 1
        assert db.scalar(select(func.count()).select_from(SandboxStripeEvent)) == 1
    engine.dispose()
