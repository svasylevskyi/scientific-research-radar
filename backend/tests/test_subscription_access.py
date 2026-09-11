from datetime import datetime, timedelta, timezone
from uuid import UUID
import pytest
from sqlalchemy import select
from app.models.stripe_sandbox import SandboxCheckout
from app.models.subscription_access import SubscriptionRunUsage as Usage
from app.models.digest_run import DigestRun
from app.services import subscription_access_service as access
from app.services import stripe_sandbox_service as billing
from test_subscription_observation import setup, start, enforce_database_foreign_keys
from test_digest_runs import RecordingRadarClient, _override_runner, _execute_next
from test_stripe_sandbox import Provider, settings as stripe_settings, account

STAMP = datetime(2030, 1, 31, 12, tzinfo=timezone.utc)
URL = '/api/v1/admin/subscription-access'


def seed_invoice(db, checkout, *, status='paid'):
    from app.models.billing_invoice import BillingInvoice
    checkout.latest_invoice_id = 'in_' + str(checkout.id)
    checkout.invoices_checked_at = STAMP
    invoice = BillingInvoice(id=checkout.latest_invoice_id, checkout_id=checkout.id, status=status, currency='eur',
        amount_due=900, amount_paid=900, amount_remaining=0, attempt_count=1, billing_reason='subscription_create',
        period_start=checkout.period_start, period_end=checkout.period_end, paid_at=STAMP, created_at=STAMP, observed_at=STAMP)
    db.add(invoice)
    db.flush()
    return invoice


@pytest.fixture
def enrolled(client, setup, db_session_factory, monkeypatch):
    monkeypatch.setattr(access, 'now', lambda: STAMP)
    uid, auth, admin, plan, digest = setup
    with db_session_factory() as db:
        row = SandboxCheckout(user_id=uid, plan_revision_id=plan['id'], interval='annual', price_id='price_test',
            parameters={}, subscription_id='sub_access', subscription_status='active', price_matches=True,
            period_start=STAMP, billing_anchor=STAMP, period_end=datetime(2031, 1, 31, 12, tzinfo=timezone.utc),
            active_through=datetime(2031, 1, 31, 12, tzinfo=timezone.utc), observed_at=STAMP)
        db.add(row); db.flush()
        seed_invoice(db, row)
        db.commit(); checkout = row.id
    result = client.post(f'{URL}/{uid}/policy', headers=admin, json={
        'mode': 'sandbox', 'expected_version': 0, 'change_note': 'Enable test limits'})
    assert result.status_code == 201, result.text
    return setup, checkout


def test_anniversary_windows_no_drift():
    assert access.window(STAMP, datetime(2030, 2, 28, 12, tzinfo=timezone.utc)) == (
        datetime(2030, 2, 28, 12, tzinfo=timezone.utc), datetime(2030, 3, 31, 12, tzinfo=timezone.utc))
    leap = STAMP.replace(year=2028)
    assert access.window(leap, datetime(2028, 2, 29, 11, tzinfo=timezone.utc))[0] == leap
    assert access.window(leap, datetime(2028, 2, 29, 12, tzinfo=timezone.utc))[1].day == 31


def test_reserve_settle_block_delete_and_toggle_preserve_usage(client, enrolled, db_session_factory):
    setup, checkout = enrolled
    uid, auth, admin, plan, digest = setup
    fake = RecordingRadarClient(); _override_runner(fake)
    run = start(client, setup)
    assert client.post(f'{URL}/{uid}/policy', headers=admin, json={
        'mode': 'complimentary', 'expected_version': 1, 'change_note': 'Too early'}).status_code == 409
    with db_session_factory() as db:
        data = access.overview(db, uid)
        assert data['usage']['reserved_runs'] == 1
        assert data['period_start'] == STAMP
    _execute_next(db_session_factory, fake)
    result = client.post(f"/api/v1/digests/{digest['id']}/runs", headers=auth)
    assert result.status_code == 403 and 'reset' in result.text
    assert client.get(f"/api/v1/digests/{digest['id']}/runs/{run}", headers=auth).status_code == 200
    assert client.delete(f"/api/v1/digests/{digest['id']}", headers=auth).status_code == 204
    with db_session_factory() as db:
        row = db.get(Usage, run)
        assert row.state == 'settled' and row.run_id is None
    for version, mode in [(1, 'complimentary'), (2, 'sandbox')]:
        assert client.post(f'{URL}/{uid}/policy', headers=admin, json={
            'mode': mode, 'expected_version': version, 'change_note': 'Test switch'}).status_code == 201
    assert client.get('/api/v1/subscription', headers=auth).json()['remaining']['runs'] == 0


def test_failure_releases_retry_uses_current_window(client, enrolled, db_session_factory, monkeypatch):
    setup, checkout = enrolled
    uid, auth, admin, _, digest = setup
    fake = RecordingRadarClient(); _override_runner(fake)
    run_id = start(client, setup)
    from app.repositories.digest_run_repository import DigestRunRepository
    with db_session_factory() as db:
        run = db.get(DigestRun, run_id)
        DigestRunRepository(db).mark_failed(run=run, stage=run.stages[0], message='Test failure')
        db.commit()
        assert db.get(Usage, run_id).state == 'released'
    later = datetime(2030, 2, 28, 12, tzinfo=timezone.utc)
    monkeypatch.setattr(access, 'now', lambda: later)
    with db_session_factory() as db:
        db.get(SandboxCheckout, checkout).observed_at = later
        db.get(SandboxCheckout, checkout).invoices_checked_at = later
        db.commit()
    response = client.post(f"/api/v1/digests/{digest['id']}/runs/{run_id}/retry", headers=auth)
    assert response.status_code == 202, response.text
    with db_session_factory() as db:
        row = db.get(Usage, run_id)
        assert access.utc(row.period_start) == later and row.state == 'reserved'


@pytest.mark.parametrize('status,allowed', [('active', True), ('past_due', False), ('unpaid', False), ('canceled', False), ('trialing', False), ('incomplete', False)])
def test_subscription_status_rules(client, enrolled, db_session_factory, status, allowed):
    setup, checkout = enrolled
    uid = setup[0]
    with db_session_factory() as db:
        row = db.get(SandboxCheckout, checkout)
        row.subscription_status, row.delinquent_since = status, STAMP
        row.cancel_at_period_end = True
        db.commit()
        assert access.resolve(db, uid)['allowed'] is allowed
        if status == 'past_due':
            row.delinquent_since = STAMP - timedelta(days=3)
            db.commit()
            assert not access.resolve(db, uid)['allowed']


def test_missing_stale_or_mismatched_observation_blocks(client, enrolled, db_session_factory):
    setup, checkout = enrolled
    with db_session_factory() as db:
        row = db.get(SandboxCheckout, checkout)
        row.observed_at = STAMP - timedelta(days=2); db.commit()
        assert 'overdue' in access.resolve(db, setup[0])['reason']
        row.observed_at, row.price_matches = STAMP, False; db.commit()
        assert 'price' in access.resolve(db, setup[0])['reason']
        row.price_matches, row.billing_anchor = True, None; db.commit()
        assert 'period' in access.resolve(db, setup[0])['reason']


def test_user_admin_authorization_and_digest_limits(client, enrolled, db_session_factory):
    setup, _ = enrolled
    uid, auth, admin, _, digest = setup
    assert client.get(f'{URL}/{uid}', headers=auth).status_code == 403
    assert client.post(f'{URL}/{uid}/policy', headers=auth, json={
        'mode': 'complimentary', 'expected_version': 1, 'change_note': 'Bypass'}).status_code == 403
    assert client.post(f'{URL}/{uid}/policy', headers=admin, json={
        'mode': 'complimentary', 'expected_version': 0, 'change_note': 'Stale'}).status_code == 409
    from test_digests import _digest_payload
    assert client.post('/api/v1/digests', headers=auth, json=_digest_payload()).status_code == 403
    response = client.get('/api/v1/subscription', headers=auth)
    assert 'stripe_sandbox' not in response.text and 'price_test' not in response.text
    assert client.patch(f"/api/v1/digests/{digest['id']}", headers=auth, json={'topic': 'Refined topic'}).status_code == 200


def test_scheduled_checks_and_reservations_share_limits(client, enrolled, db_session_factory):
    setup, _ = enrolled
    fake = RecordingRadarClient(); _override_runner(fake)
    with db_session_factory() as db:
        data, issues = access.assess(db, setup[0], 3, 'scheduled', {'frequency': 'daily', 'send_email': True})
        assert any('frequency' in i for i in issues) and any('Email' in i for i in issues)
    run_id = start(client, setup)
    with db_session_factory() as db:
        _, issues = access.assess(db, setup[0], 3, 'scheduled', {'frequency': 'daily', 'send_email': False})
        assert any('Monthly run' in i for i in issues)
        row = db.get(DigestRun, run_id)
        access.reserve(db, row); db.commit()
        assert access.overview(db, setup[0])['usage']['reserved_runs'] == 1


def test_observation_assignment_does_not_grant_access(client, setup):
    uid, auth, admin, _, _ = setup
    assert client.post(f'{URL}/{uid}/policy', headers=admin, json={
        'mode': 'sandbox', 'expected_version': 0, 'change_note': 'No subscription'}).status_code == 201
    data = client.get('/api/v1/subscription', headers=auth).json()
    assert not data['allowed'] and data['plan'] is None


def test_provider_anchor_and_grace_clock_survive_reconciliation(client, account, db_session_factory):
    uid, _ = account
    provider = Provider()
    with db_session_factory() as db:
        billing.start_checkout(db, stripe_settings(), uid, 1, 'monthly', client=provider.client)
        sub = provider.complete()
        sub['billing_cycle_anchor'] = int(STAMP.timestamp())
        sub['items']['data'][0]['current_period_start'] = int(STAMP.timestamp())
        billing.refresh(db, stripe_settings(), uid, client=provider.client)
        row = billing.latest(db, uid)
        assert access.utc(row.billing_anchor) == STAMP
        assert row.active_through is not None
        sub['status'] = 'past_due'
        billing.refresh(db, stripe_settings(), uid, client=provider.client)
        initial = row.delinquent_since
        billing.refresh(db, stripe_settings(), uid, client=provider.client)
        assert access.utc(row.delinquent_since) == access.utc(initial)
        sub['status'] = 'active'
        billing.refresh(db, stripe_settings(), uid, client=provider.client)
        assert row.delinquent_since is None


def test_scheduler_waits_without_losing_cursor_then_resumes(client, enrolled, db_session_factory):
    from types import SimpleNamespace
    from app.core.config import Settings
    from app.models.digest import Digest
    from app.scheduler.dispatch import ScheduleDispatcher
    from app.services.schedule_preview_service import schedule_preview
    setup, checkout = enrolled
    uid, auth, admin, _, digest = setup
    did = UUID(digest['id'])
    with db_session_factory() as db:
        row = db.get(Digest, did)
        row.schedule = {'frequency': 'daily', 'send_email': True, 'starts_at': STAMP.isoformat(), 'time_zone': 'UTC'}
        row.schedule_next_at = STAMP
        db.commit()
        preview = schedule_preview(db, Settings(), row, now=STAMP)
        assert preview.state == 'waiting_for_subscription' and 'frequency' in preview.subscription_message
    dispatcher = ScheduleDispatcher(Settings(), db_session_factory, SimpleNamespace(model_name='fake'))
    assert dispatcher.tick(STAMP) == 0
    with db_session_factory() as db:
        row = db.get(Digest, did)
        assert access.utc(row.schedule_next_at) == STAMP
        assert access.utc(row.subscription_retry_at) == STAMP + timedelta(seconds=60)
        assert db.scalar(select(DigestRun)) is None
    assert client.post(f'{URL}/{uid}/policy', headers=admin, json={
        'mode': 'complimentary', 'expected_version': 1, 'change_note': 'Resume dev access'}).status_code == 201
    assert dispatcher.tick(STAMP + timedelta(seconds=61)) == 1


def test_protected_admin_account_and_expired_history(client, enrolled, db_session_factory):
    from test_digests import _authorization, _register
    from app.models.user import User, UserRole
    setup, checkout = enrolled
    response = _register(client, 'ordinary-access@example.com', 'Ordinary admin')
    auth = _authorization(response)
    with db_session_factory() as db:
        db.get(User, UUID(response.json()['user']['id'])).role = UserRole.ADMIN
        protected = db.scalar(select(User).where(User.is_super_admin.is_(True)))
        protected_id = protected.id
        row = db.get(SandboxCheckout, checkout)
        row.period_end = STAMP
        row.cancel_at_period_end = True
        db.commit()
    assert client.get(f'{URL}/{protected_id}', headers=auth).status_code == 403
    assert client.post(f'{URL}/{protected_id}/policy', headers=auth, json={
        'mode': 'sandbox', 'expected_version': 0, 'change_note': 'Forbidden'}).status_code == 403
    assert not client.get('/api/v1/subscription', headers=setup[1]).json()['allowed']
    assert client.get(f"/api/v1/digests/{setup[4]['id']}", headers=setup[1]).status_code == 200


def test_concurrent_access_policy_versions(tmp_path):
    from concurrent.futures import ThreadPoolExecutor
    from sqlalchemy.orm import sessionmaker
    from app.db.base import Base
    from app.db.session import build_engine
    from app.models.user import User
    from uuid import uuid4
    engine = build_engine(f'sqlite:///{tmp_path / "access-race.db"}')
    Base.metadata.create_all(engine)
    factory = sessionmaker(engine, expire_on_commit=False, autoflush=False)
    uid = uuid4()
    with factory() as db:
        db.add(User(id=uid, email='race@example.com', full_name='Race', password_hash='unused')); db.commit()
    def save(_):
        with factory() as db:
            try:
                access.change_policy(db, uid, uid, 'sandbox', 0, 'Concurrent enrollment')
                db.commit()
                return 'saved'
            except access.AccessDenied:
                db.rollback()
                return 'conflict'
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(save, range(2))) == ['conflict', 'saved']
    engine.dispose()


def test_concurrent_reservations_cannot_overspend(tmp_path, monkeypatch):
    from concurrent.futures import ThreadPoolExecutor
    from datetime import date
    from uuid import uuid4
    from sqlalchemy.orm import sessionmaker
    from app.db.base import Base
    from app.db.session import build_engine
    from app.models.user import User
    from app.models.digest import Digest
    from app.models.subscription_plan import SubscriptionPlanRevision
    from app.models.subscription_access import SubscriptionAccessPolicy
    from app.models.digest_run import DigestRunStatus
    from app.repositories.digest_run_repository import DigestRunRepository
    from test_subscription_catalogue import payload
    from test_digests import _digest_payload
    monkeypatch.setattr(access, 'now', lambda: STAMP)
    engine = build_engine(f'sqlite:///{tmp_path / "usage-race.db"}')
    Base.metadata.create_all(engine)
    sessions = sessionmaker(engine, expire_on_commit=False, autoflush=False)
    uid, did = uuid4(), uuid4()
    with sessions() as db:
        db.add(User(id=uid, email='usage@example.com', full_name='Usage', password_hash='unused')); db.flush()
        config = payload(max_digests=1, max_papers_per_run=3, papers_per_month=3, runs_per_month=1, manual_runs_per_month=1)
        # The API payload nests the revision note alongside plan configuration.
        from app.schemas.subscription_plan import SubscriptionPlanConfiguration
        config = SubscriptionPlanConfiguration.model_validate(config['configuration']).model_dump(mode='json')
        plan = SubscriptionPlanRevision(code='explorer', revision=1,
            configuration=config, created_by=uid, change_note='Race')
        db.add(plan); db.flush()
        db.add(SandboxCheckout(user_id=uid, plan_revision_id=plan.id, interval='monthly', price_id='price_test', parameters={},
            subscription_id='sub_race', subscription_status='active', price_matches=True, period_start=STAMP,
            billing_anchor=STAMP, period_end=STAMP + timedelta(days=28), active_through=STAMP + timedelta(days=28), observed_at=STAMP))
        db.flush()
        seed_invoice(db, db.scalar(select(SandboxCheckout).where(SandboxCheckout.user_id == uid)))
        db.add(SubscriptionAccessPolicy(user_id=uid, version=1, mode='sandbox', created_by=uid, change_note='Race'))
        values = _digest_payload(maximum_papers=3)
        values.update(reporting_from=date.fromisoformat(values['reporting_from']), reporting_to=date.fromisoformat(values['reporting_to']))
        db.add(Digest(id=did, owner_id=uid, **values)); db.flush()
        ids = []
        for _ in range(2):
            run = DigestRunRepository(db).create_running(digest_id=did, owner_id=uid, digest_snapshot=_digest_payload(maximum_papers=3),
                history_context=[], feedback_context=[], model_name='fake', prompt_version='test')
            run.status = DigestRunStatus.FAILED; db.flush(); ids.append(run.id)
        db.commit()
    def reserve(rid):
        with sessions() as db:
            try:
                access.reserve(db, db.get(DigestRun, rid)); db.commit(); return 'reserved'
            except access.AccessDenied:
                db.rollback(); return 'blocked'
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(reserve, ids)) == ['blocked', 'reserved']
    with sessions() as db:
        assert access.overview(db, uid)['usage']['reserved_runs'] == 1
    engine.dispose()


def test_legacy_scheduled_retry_keeps_email_intent(client, enrolled, db_session_factory):
    from types import SimpleNamespace
    from app.core.config import Settings
    from app.scheduler.dispatch import ScheduleDispatcher
    from app.repositories.digest_run_repository import DigestRunRepository
    setup, _ = enrolled
    uid, auth, admin, _, digest = setup
    def change(mode, version):
        result = client.post(f'{URL}/{uid}/policy', headers=admin, json={
            'mode': mode, 'expected_version': version, 'change_note': 'Test legacy retry'})
        assert result.status_code == 201, result.text
    change('complimentary', 1)
    response = client.put(f"/api/v1/digests/{digest['id']}/schedule", headers=auth, json={
        'frequency': 'weekly', 'send_email': True, 'starts_at': STAMP.isoformat(), 'time_zone': 'UTC'})
    assert response.status_code == 200, response.text
    assert ScheduleDispatcher(Settings(), db_session_factory, SimpleNamespace(model_name='fake')).tick(STAMP) == 1
    with db_session_factory() as db:
        run = db.scalar(select(DigestRun))
        rid = run.id
        DigestRunRepository(db).mark_failed(run=run, stage=run.stages[0], message='Test')
        db.commit()
        assert db.get(Usage, rid) is None  # Originally admitted under complimentary access.
    assert client.delete(f"/api/v1/digests/{digest['id']}/schedule", headers=auth).status_code == 204
    change('sandbox', 2)
    fake = RecordingRadarClient(); _override_runner(fake)
    response = client.post(f"/api/v1/digests/{digest['id']}/runs/{rid}/retry", headers=auth)
    assert response.status_code == 403 and 'Email delivery' in response.text
    with db_session_factory() as db:
        assert db.get(DigestRun, rid).status == 'failed' and db.get(Usage, rid) is None


def test_accepted_run_settles_after_cancellation(client, enrolled, db_session_factory):
    setup, checkout = enrolled
    fake = RecordingRadarClient(); _override_runner(fake)
    rid = start(client, setup)
    with db_session_factory() as db:
        db.get(SandboxCheckout, checkout).subscription_status = 'canceled'; db.commit()
    _execute_next(db_session_factory, fake)
    with db_session_factory() as db:
        assert db.get(DigestRun, rid).status == 'completed'
        assert db.get(Usage, rid).state == 'settled'
        assert not access.resolve(db, setup[0])['allowed']


def test_early_creation_capabilities_and_freed_slot(client, enrolled, db_session_factory):
    setup, _ = enrolled
    uid, auth, admin, _, digest = setup
    data = client.get('/api/v1/subscription', headers=auth).json()
    assert not data['create_allowed'] and 'Upgrade' in data['create_reasons'][0]
    assert data['paper_limit'] == 3 and not data['schedule_allowed']
    assert client.get(f'{URL}/{uid}', headers=admin).json()['create_allowed'] is False
    assert client.delete(f"/api/v1/digests/{digest['id']}", headers=auth).status_code == 204
    assert client.get('/api/v1/subscription', headers=auth).json()['create_allowed'] is True


def test_retry_preview_uses_original_papers_and_checks_ownership(client, enrolled, db_session_factory):
    from app.repositories.digest_run_repository import DigestRunRepository
    from test_digests import _authorization, _register
    setup, checkout = enrolled
    uid, auth, _, _, digest = setup
    fake = RecordingRadarClient(); _override_runner(fake)
    rid = start(client, setup)
    with db_session_factory() as db:
        run = db.get(DigestRun, rid)
        run.digest_snapshot = {**run.digest_snapshot, 'maximum_papers': 8}
        DigestRunRepository(db).mark_failed(run=run, stage=run.stages[0], message='Test')
        db.commit()
    path = f"/api/v1/subscription?digest_id={digest['id']}&run_id={rid}"
    data = client.get(path, headers=auth).json()
    assert data['run_allowed'] and not data['retry_allowed']
    assert any('requests 8' in reason for reason in data['retry_reasons'])
    other = _authorization(_register(client, 'access-preview@example.com', 'Other'))
    assert client.get(path, headers=other).status_code == 404
    assert client.get(f'/api/v1/subscription?run_id={rid}', headers=auth).status_code == 422


def test_exhausted_runs_warn_before_creation_but_allow_saving_settings(client, enrolled, db_session_factory):
    setup, _ = enrolled
    fake = RecordingRadarClient(); _override_runner(fake)
    rid = start(client, setup)
    _execute_next(db_session_factory, fake)
    assert client.delete(f"/api/v1/digests/{setup[4]['id']}", headers=setup[1]).status_code == 204
    data = client.get('/api/v1/subscription', headers=setup[1]).json()
    assert data['create_allowed'] and 'exhausted' in data['research_warning']


def test_inactive_access_preview_keeps_existing_paper_edit_boundary(client, enrolled, db_session_factory):
    setup, checkout = enrolled
    with db_session_factory() as db:
        db.get(SandboxCheckout, checkout).subscription_status = 'canceled'; db.commit()
    data = client.get('/api/v1/subscription', headers=setup[1]).json()
    assert not data['create_allowed'] and not data['schedule_allowed'] and data['paper_limit'] == 0


def test_manual_only_exhaustion_warns_before_form(client, enrolled, db_session_factory):
    from app.models.subscription_plan import SubscriptionPlanRevision
    setup, _ = enrolled
    with db_session_factory() as db:
        plan = db.get(SubscriptionPlanRevision, setup[3]['id'])
        plan.configuration = {**plan.configuration, 'manual_runs_per_month': 0}
        db.commit()
    data = client.get('/api/v1/subscription', headers=setup[1]).json()
    assert data['remaining']['runs'] == 1 and 'manual-run allowance' in data['research_warning']


def test_feature_limits_do_not_promise_monthly_reset(client, enrolled, db_session_factory):
    setup, _ = enrolled
    with db_session_factory() as db:
        _, issues = access.assess(db, setup[0], 1, 'scheduled', {'frequency': 'daily', 'send_email': False})
        assert any('frequency' in i for i in issues)
        assert not any('reset' in i for i in issues)
