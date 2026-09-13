from datetime import datetime, timedelta, timezone
from uuid import UUID
import pytest
from sqlalchemy import func, select
from app.models.subscription_access import FreeSubscription, SubscriptionAccessPolicy as Policy, SubscriptionRunUsage as Usage
from app.models.subscription_plan import SubscriptionPlanRevision as Plan
from app.models.stripe_sandbox import SandboxCheckout
from app.services import subscription_access_service as access, free_subscription_service as free
from test_digests import _authorization, _super_admin_login, _digest_payload, PASSWORD
from test_digest_runs import RecordingRadarClient, _override_runner, _execute_next


def register(client, email='free@example.com'):
    r = client.register_verified(json={'email': email, 'full_name': 'Free User', 'password': PASSWORD,
        'password_confirmation': PASSWORD}, legacy_account=False)
    assert r.status_code == 201, r.text
    return UUID(r.json()['user']['id']), _authorization(r)


def test_verified_registration_enforces_free_without_stripe(client, db_session_factory, monkeypatch):
    from app.services import stripe_sandbox_service
    monkeypatch.setattr(stripe_sandbox_service, 'StripeSandboxClient', lambda *a, **k: pytest.fail('Free registration must not use Stripe'))
    uid, auth = register(client)
    data = client.get('/api/v1/subscription', headers=auth).json()
    assert data['allowed'] and data['billing_type'] == 'free' and data['mode'] == 'sandbox'
    assert data['remaining'] == {'runs': 1, 'manual_runs': 1, 'papers': 10, 'digests': 1}
    assert data['version'] == 1 and data['checkout_id'] is None
    with db_session_factory() as db:
        assigned = db.get(FreeSubscription, uid)
        assert db.get(Plan, assigned.plan_revision_id).configuration['stripe_sandbox'] is None
        assert db.scalar(select(func.count()).select_from(SandboxCheckout)) == 0
        assert db.scalar(select(func.count()).select_from(Policy).where(Policy.user_id == uid)) == 1
    assert client.post('/api/v1/digests', headers=auth, json=_digest_payload(maximum_papers=11)).status_code == 403
    first = client.post('/api/v1/digests', headers=auth, json=_digest_payload(maximum_papers=10))
    assert first.status_code == 201
    assert client.post('/api/v1/digests', headers=auth, json=_digest_payload(maximum_papers=10)).status_code == 403
    assert not client.get('/api/v1/subscription', headers=auth).json()['create_allowed']


def test_free_reservation_settlement_override_and_reset(client, db_session_factory, monkeypatch):
    uid, auth = register(client)
    admin = _authorization(_super_admin_login(client, db_session_factory))
    with db_session_factory() as db:
        anchor = access.utc(db.get(FreeSubscription, uid).anchor)
    monkeypatch.setattr(access, 'now', lambda: anchor + timedelta(seconds=1))
    digest = client.post('/api/v1/digests', headers=auth, json=_digest_payload(maximum_papers=3)).json()
    fake = RecordingRadarClient(); _override_runner(fake)
    r = client.post(f"/api/v1/digests/{digest['id']}/runs", headers=auth)
    assert r.status_code == 202, r.text
    policy_url = f'/api/v1/admin/subscription-access/{uid}/policy'
    assert client.post(policy_url, headers=admin, json={'mode': 'complimentary', 'expected_version': 1, 'change_note': 'Busy'}).status_code == 409
    _execute_next(db_session_factory, fake)
    data = client.get('/api/v1/subscription', headers=auth).json()
    assert data['remaining']['runs'] == 0
    assert client.post(f"/api/v1/digests/{digest['id']}/runs", headers=auth).status_code == 403
    for version, mode in [(1, 'complimentary'), (2, 'sandbox')]:
        assert client.post(policy_url, headers=admin, json={'mode': mode, 'expected_version': version, 'change_note': 'Toggle'}).status_code == 201
        if mode == 'complimentary':
            assert client.get('/api/v1/subscription', headers=auth).json()['remaining']['runs'] is None
    assert client.get('/api/v1/subscription', headers=auth).json()['remaining']['runs'] == 0
    with db_session_factory() as db:
        assert access.utc(db.get(FreeSubscription, uid).anchor) == anchor
        assert db.scalar(select(Usage.checkout_id).where(Usage.user_id == uid)) is None
        row = db.scalar(select(Usage).where(Usage.user_id == uid))
        assert row.state == 'settled'
    monkeypatch.setattr(access, 'now', lambda: access.month_at(anchor, 1))
    assert client.get('/api/v1/subscription', headers=auth).json()['remaining']['runs'] == 1


def test_new_registrations_use_latest_reviewed_free_revision(client, db_session_factory):
    first, _ = register(client)
    with db_session_factory() as db:
        p = db.get(Plan, db.get(FreeSubscription, first).plan_revision_id)
        db.add(Plan(code='free', revision=2, configuration={**p.configuration, 'name': 'Free Plus', 'runs_per_month': 2}, change_note='Refine default'))
        db.add(Plan(code='free', revision=3, configuration={**p.configuration, 'state': 'draft', 'subscriber_visible': False}, change_note='Draft'))
        db.commit()
    second, auth = register(client, 'free2@example.com')
    with db_session_factory() as db:
        assert db.get(FreeSubscription, first).plan_revision_id != db.get(FreeSubscription, second).plan_revision_id
    assert client.get('/api/v1/subscription', headers=auth).json()['plan']['name'] == 'Free Plus'


def test_free_publication_and_admin_names(client, db_session_factory):
    uid, auth = register(client)
    admin = _authorization(_super_admin_login(client, db_session_factory))
    plans = client.get('/api/v1/subscription/plans').json()['items']
    assert plans[0]['billing_type'] == 'free' and 'stripe_sandbox' not in plans[0]
    assert client.get(f'/api/v1/admin/users/{uid}', headers=admin).json()['subscription_plan_name'] == 'Free'
    assert client.get('/api/v1/admin/users?q=free@example.com', headers=admin).json()['items'][0]['subscription_plan_name'] == 'Free'


def test_free_plan_validation():
    from app.schemas.subscription_plan import SubscriptionPlanSave
    from pydantic import ValidationError
    p = dict(code='free', expected_revision=0, change_note='Test', configuration=free.default_configuration())
    assert SubscriptionPlanSave.model_validate(p).configuration.billing_type == 'free'
    for changes in [{'monthly_price': '1.00'}, {'annual_price': '0.00'}, {'trial_days': 1},
        {'stripe_sandbox': {'product_id': 'prod_test', 'monthly_price_id': 'price_test'}}]:
        with pytest.raises(ValidationError): SubscriptionPlanSave.model_validate({**p, 'configuration': {**p['configuration'], **changes}})
    with pytest.raises(ValidationError): SubscriptionPlanSave.model_validate({**p, 'code': 'otherfree'})


def test_legacy_account_unchanged_and_admin_can_enforce_free(client, db_session_factory):
    r = client.register_verified(json={'email': 'legacy@example.com', 'full_name': 'Legacy', 'password': PASSWORD, 'password_confirmation': PASSWORD})
    uid = r.json()['user']['id']; auth = _authorization(r)
    assert client.get('/api/v1/subscription', headers=auth).json()['mode'] == 'complimentary'
    admin = _authorization(_super_admin_login(client, db_session_factory))
    url = f'/api/v1/admin/subscription-access/{uid}/policy'
    assert client.post(url, headers=auth, json={'mode': 'sandbox', 'expected_version': 0, 'change_note': 'Self'}).status_code == 403
    assert client.post(url, headers=admin, json={'mode': 'sandbox', 'expected_version': 0, 'change_note': 'Enforce'}).status_code == 201
    assert client.get('/api/v1/subscription', headers=auth).json()['billing_type'] == 'free'
