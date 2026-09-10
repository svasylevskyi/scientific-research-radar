from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest
from sqlalchemy import create_engine, event, func, select
from sqlalchemy.orm import sessionmaker
from app.db.base import Base
from app.models.user import User
from app.models.digest import Digest
from app.models.digest_run import DigestRun, DigestRunStageType
from app.models.subscription_plan import SubscriptionPlanRevision
from app.models.subscription_observation import ObservationAccount, ObservationAssignment, ObservedRunUsage
from app.services import subscription_observation_service as service
from app.scheduler.dispatch import ScheduleDispatcher
from app.core.config import Settings
from test_digests import _authorization, _register, _super_admin_login, _digest_payload, PASSWORD
from test_digest_runs import RecordingRadarClient, _override_runner, _execute_next, _runner
from test_subscription_catalogue import payload
from test_scheduler_delivery import setup_schedule, NOW

URL = '/api/v1/admin/subscription-observation'


@pytest.fixture(autouse=True)
def enforce_database_foreign_keys(db_session_factory):
    engine = db_session_factory.kw['bind']
    if engine.dialect.name == 'sqlite':
        with engine.connect() as connection:
            connection.exec_driver_sql('PRAGMA foreign_keys=ON')


@pytest.fixture
def setup(client, db_session_factory):
    user = _register(client, 'observer@example.com', 'Observed user')
    uid = UUID(user.json()['user']['id'])
    auth = _authorization(user)
    admin = _authorization(_super_admin_login(client, db_session_factory))
    plan = client.post('/api/v1/admin/subscription-plans', headers=admin, json=payload(
        max_digests=1, max_papers_per_run=3, papers_per_month=3, runs_per_month=1, manual_runs_per_month=1,
        schedule_frequencies=[], email_delivery=False)).json()
    digest = client.post('/api/v1/digests', headers=auth, json=_digest_payload(maximum_papers=3)).json()
    return uid, auth, admin, plan, digest


def assign(client, setup, version=0, plan=True):
    uid, _, admin, p, _ = setup
    result = client.post(f'{URL}/{uid}/assignments', headers=admin, json={
        'plan_revision_id': p['id'] if plan else None, 'expected_version': version, 'change_note': 'Observe limits'})
    assert result.status_code == 201, result.text
    return result.json()


def start(client, setup):
    _, auth, _, _, digest = setup
    result = client.post(f"/api/v1/digests/{digest['id']}/runs", headers=auth)
    assert result.status_code == 202, result.text
    return UUID(result.json()['id'])


def test_reserve_settle_no_enforcement_and_deletion_retains_usage(client, setup, db_session_factory):
    uid, auth, admin, _, digest = setup
    assign(client, setup)
    fake = RecordingRadarClient(); _override_runner(fake)
    first = start(client, setup)
    with db_session_factory() as db:
        data = service.overview(db, uid)
        assert data['usage']['reserved_runs'] == 1 and data['usage']['reserved_papers'] == 3
        assert data['items'][0]['assessments'][0]['would_block'] is False
    _execute_next(db_session_factory, fake)
    with db_session_factory() as db:
        data = service.overview(db, uid)
        assert data['usage']['completed_runs'] == 1 and data['usage']['completed_papers'] == 1
        assert data['usage']['reserved_papers'] == 0
        assert data['remaining']['papers'] == 2
    second = start(client, setup)  # Would exceed plan, but still queues.
    with db_session_factory() as db:
        row = db.get(ObservedRunUsage, second)
        assert row.assessments[0]['would_block'] is True
        assert any('Monthly run' in reason for reason in row.assessments[0]['reasons'])
    _execute_next(db_session_factory, fake)
    assert client.delete(f"/api/v1/digests/{digest['id']}", headers=auth).status_code == 204
    with db_session_factory() as db:
        row = db.get(ObservedRunUsage, first)
        assert row and row.run_id is None and row.digest_id is None
        assert service.overview(db, uid)['usage']['completed_runs'] == 2
        assert service.overview(db, uid)['digest_count'] == 0


def test_failure_release_retry_original_month_assignment_and_idempotency(client, setup, db_session_factory, monkeypatch):
    uid, auth, _, _, digest = setup
    original = assign(client, setup)
    stamp = datetime(2030, 1, 31, 23, 59, tzinfo=timezone.utc)
    monkeypatch.setattr(service, 'now', lambda: stamp)
    fake = RecordingRadarClient(fail_stage=DigestRunStageType.TREND_ANALYSIS); _override_runner(fake)
    run_id = start(client, setup)
    _execute_next(db_session_factory, fake)
    with db_session_factory() as db:
        data = service.overview(db, uid, stamp.date().replace(day=1))
        assert data['usage']['released_runs'] == 1
        assert data['usage']['completed_papers'] == 0 and data['usage']['reserved_papers'] == 0
        assert db.get(ObservedRunUsage, run_id).actual_papers == 1
    assign(client, setup, version=1, plan=False)
    stamp = datetime(2030, 2, 1, tzinfo=timezone.utc)
    result = client.post(f"/api/v1/digests/{digest['id']}/runs/{run_id}/retry", headers=auth)
    assert result.status_code == 202, result.text
    with db_session_factory() as db:
        row = db.get(ObservedRunUsage, run_id)
        assert row.assignment_id == original['id'] and row.period_start.isoformat() == '2030-01-01'
        assert row.attempts == 2
        service.reserve(db, db.get(DigestRun, run_id))  # Repeated enqueue is idempotent.
        db.commit()
        assert row.attempts == 2
        assert service.overview(db, uid)['usage']['reserved_runs'] == 0
    fake.fail_stage = None
    _execute_next(db_session_factory, fake)
    with db_session_factory() as db:
        service.settle(db, db.get(DigestRun, run_id), success=True); db.commit()
        data = service.overview(db, uid, datetime(2030, 1, 1).date())
        assert data['usage']['completed_runs'] == 1 and data['usage']['completed_papers'] == 1
        assert data['total'] == 1 and data['items'][0]['attempts'] == 2


def test_complimentary_default_revision_pinning_and_stale_edit(client, setup, db_session_factory):
    uid, _, admin, plan, _ = setup
    assert client.get(f'{URL}/{uid}', headers=admin).json()['assignment']['mode'] == 'complimentary'
    saved = assign(client, setup)
    changed = client.post('/api/v1/admin/subscription-plans', headers=admin,
        json={**payload(name='Renamed', monthly_price='20.00'), 'expected_revision': 1}).json()
    data = client.get(f'{URL}/{uid}', headers=admin).json()
    assert data['assignment']['plan']['id'] == plan['id'] and data['assignment']['plan']['revision'] == 1
    stale = client.post(f'{URL}/{uid}/assignments', headers=admin, json={
        'plan_revision_id': changed['id'], 'expected_version': 0, 'change_note': 'Stale'})
    assert stale.status_code == 409
    history = client.get(f'{URL}/{uid}/assignments', headers=admin).json()
    assert history['total'] == 1 and history['items'][0]['id'] == saved['id']


def test_admin_only_super_admin_protection_and_invalid_plan(client, setup, db_session_factory):
    uid, auth, super_admin, _, _ = setup
    assert client.get(f'{URL}/{uid}').status_code == 401
    assert client.get(f'{URL}/{uid}', headers=auth).status_code == 403
    assert client.post(f'{URL}/{uid}/assignments', headers=auth, json={'expected_version': 0, 'change_note': 'Bad'}).status_code == 403
    assert client.post(f'{URL}/{uid}/assignments', headers=super_admin, json={
        'plan_revision_id': 9999, 'expected_version': 0, 'change_note': 'Missing plan'}).status_code == 422
    client.put(f'/api/v1/admin/users/{uid}/role', headers=super_admin, json={'role': 'admin'})
    admin = _authorization(client.post('/api/v1/auth/login', json={'email': 'observer@example.com', 'password': PASSWORD}))
    with db_session_factory() as db:
        super_id = db.scalar(select(User.id).where(User.is_super_admin.is_(True)))
    for suffix in ['', '/assignments']:
        assert client.get(f'{URL}/{super_id}{suffix}', headers=admin).status_code == 403
    assert client.post(f'{URL}/{super_id}/assignments', headers=admin, json={
        'expected_version': 0, 'change_note': 'Protected'}).status_code == 403
    assert client.get(f'{URL}/{uid}', headers=admin).status_code == 200
    assert client.get(f'{URL}/{uuid4()}', headers=admin).status_code == 404


def test_scheduled_runs_observe_frequency_email_and_do_not_consume_manual(client, db_session_factory):
    auth, digest = setup_schedule(client)
    uid = UUID(digest['owner_id'])
    with db_session_factory() as db:
        plan = SubscriptionPlanRevision(code='test', revision=1, configuration=payload(
            email_delivery=False, schedule_frequencies=[])['configuration'], change_note='Limits', created_by=uid)
        from app.schemas.subscription_plan import SubscriptionPlanConfiguration
        plan.configuration = SubscriptionPlanConfiguration(**plan.configuration).model_dump(mode='json')
        db.add(plan); db.flush()
        service.assign(db, uid, uid, plan.id, 0, 'Observe schedule'); db.commit()
    dispatcher = ScheduleDispatcher(Settings(), db_session_factory, SimpleNamespace(model_name='test'))
    assert dispatcher.tick(NOW) == 1
    assert dispatcher.tick(NOW) == 0
    with db_session_factory() as db:
        data = service.overview(db, uid)
        assert data['usage']['reserved_runs'] == 1 and data['usage']['manual_runs'] == 0
        reasons = data['items'][0]['assessments'][0]['reasons']
        assert 'Schedule frequency is not included in the plan' in reasons
        assert 'Email delivery is not included in the plan' in reasons
    _execute_next(db_session_factory, RecordingRadarClient())
    with db_session_factory() as db:
        assert service.overview(db, uid)['usage']['completed_runs'] == 1


def test_enqueue_rollback_has_no_usage(client, setup, db_session_factory):
    uid, _, _, _, digest = setup
    with db_session_factory() as db:
        _runner(db, RecordingRadarClient()).start_digest(digest_id=UUID(digest['id']), owner_id=uid, commit=False)
        assert db.scalar(select(func.count()).select_from(ObservedRunUsage)) == 1
        db.rollback()
    with db_session_factory() as db:
        assert db.scalar(select(func.count()).select_from(ObservedRunUsage)) == 0
        assert db.scalar(select(func.count()).select_from(DigestRun)) == 0


def test_concurrent_assignment_versions_have_one_winner(tmp_path):
    engine = create_engine(f'sqlite:///{tmp_path / "observation.db"}', connect_args={'check_same_thread': False, 'timeout': 20})
    Base.metadata.create_all(engine)
    factory = sessionmaker(engine, expire_on_commit=False, autoflush=False)
    uid = uuid4()
    with factory() as db:
        db.add(User(id=uid, email='race@example.com', full_name='Race', password_hash='unused')); db.commit()
    def save(_):
        with factory() as db:
            try:
                service.assign(db, uid, uid, None, 0, 'Concurrent edit')
                db.commit()
                return 'saved'
            except service.ObservationError:
                db.rollback()
                return 'conflict'
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(save, range(2))) == ['conflict', 'saved']
    with factory() as db:
        assert db.scalar(select(func.count()).select_from(ObservationAssignment)) == 1
    engine.dispose()


def test_concurrent_reservations_do_not_double_count(tmp_path):
    from app.repositories.digest_run_repository import DigestRunRepository
    from app.db.session import build_engine
    engine = build_engine(f'sqlite:///{tmp_path / "reservations.db"}')
    Base.metadata.create_all(engine)
    factory = sessionmaker(engine, expire_on_commit=False, autoflush=False)
    uid, did = uuid4(), uuid4()
    with factory() as db:
        db.add(User(id=uid, email='reserve@example.com', full_name='Reserve', password_hash='unused')); db.flush()
        values = _digest_payload()
        from datetime import date
        values['reporting_from'] = date.fromisoformat(values['reporting_from'])
        values['reporting_to'] = date.fromisoformat(values['reporting_to'])
        db.add(Digest(id=did, owner_id=uid, **values)); db.flush()
        run = DigestRunRepository(db).create_running(digest_id=did, owner_id=uid,
            digest_snapshot=_digest_payload(), history_context=[], feedback_context=[], model_name='test', prompt_version='test')
        rid = run.id
        db.commit()
    def reserve(_):
        with factory() as db:
            run = db.get(DigestRun, rid)
            service.reserve(db, run)
            db.commit()
    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(reserve, range(2)))
    with factory() as db:
        assert db.get(ObservedRunUsage, rid).attempts == 1
        assert service.overview(db, uid)['usage']['reserved_runs'] == 1
        # Removing the whole user also removes private observation records.
        db.delete(db.get(User, uid)); db.commit()
        assert db.scalar(select(func.count()).select_from(ObservedRunUsage)) == 0
    engine.dispose()
