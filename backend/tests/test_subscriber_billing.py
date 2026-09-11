from copy import deepcopy
from uuid import UUID
import pytest
from sqlalchemy import func, select
from app.models.subscription_plan import SubscriptionPlanRevision as Plan
from app.models.subscription_access import SubscriptionAccessPolicy as Policy
from app.models.stripe_sandbox import SandboxCheckout
from app.services import stripe_sandbox_service as billing
from app.services import subscriber_billing_service as service
from test_stripe_sandbox import account, Provider, settings
from test_stripe_catalogue import configuration
from test_digests import _register, _authorization

URL = '/api/v1/subscription'


@pytest.fixture
def subscriber(client, account, db_session_factory, monkeypatch):
    response = _register(client, 'subscriber@example.com', 'Subscriber')
    uid, auth = UUID(response.json()['user']['id']), _authorization(response)
    provider = Provider()
    monkeypatch.setattr(billing, 'StripeSandboxClient', lambda *args, **kwargs: provider.client)
    from app.core.config import get_settings
    cfg = get_settings()
    for key, value in vars(settings()).items(): monkeypatch.setattr(cfg, key, value)
    with db_session_factory() as db:
        plan = db.get(Plan, 1)
        plan.configuration = {**plan.configuration, 'state': 'reviewed', 'subscriber_visible': True}
        db.add(Policy(user_id=uid, version=1, mode='sandbox', created_by=account[0], change_note='Test opt-in'))
        db.commit()
    return uid, auth, provider


def test_public_catalogue_hides_drafts_metadata_and_superseded_revisions(client, account, db_session_factory):
    assert client.get(URL + '/plans').json()['items'] == []
    with db_session_factory() as db:
        original = db.get(Plan, 1)
        original.configuration = {**original.configuration, 'state': 'reviewed', 'subscriber_visible': True}
        db.commit()
    data = client.get(URL + '/plans').json()['items']
    assert len(data) == 1 and 'stripe_sandbox' not in data[0] and 'created_by' not in data[0]
    with db_session_factory() as db:
        original = db.get(Plan, 1)
        db.add(Plan(code=original.code, revision=2, configuration={**original.configuration, 'subscriber_visible': False}, created_by=account[0], change_note='Withdraw'))
        db.commit()
    assert client.get(URL + '/plans').json()['items'] == []


def test_subscriber_checkout_and_resume_are_owner_scoped(client, subscriber, db_session_factory):
    uid, auth, provider = subscriber
    assert client.get(URL + '/billing', headers=auth).json()['checkout_allowed']
    selection = {'code': 'explorer', 'revision': 1, 'interval': 'monthly'}
    response = client.post(URL + '/billing/checkout', headers=auth, json=selection)
    assert response.status_code == 200, response.text
    assert response.json()['url'].startswith('https://checkout.stripe.com/')
    state = client.get(URL + '/billing', headers=auth).json()
    assert state['resume_allowed'] and not state['checkout_allowed']
    assert client.post(URL + '/billing/resume', headers=auth).status_code == 200
    with db_session_factory() as db:
        row = billing.latest(db, uid)
        assert row.parameters['success_url'] == 'https://radar.example/subscription?stripe_return=checkout'
        assert db.scalar(select(func.count()).select_from(SandboxCheckout)) == 1
    other = _authorization(_register(client, 'other-subscriber@example.com', 'Other'))
    assert client.get(URL + '/billing', headers=other).json()['attempt'] is None
    assert client.post(URL + '/billing/portal', headers=other).status_code == 409
    assert client.post(URL + '/billing/resume', headers=other).status_code == 409
    assert client.post(URL + '/billing/checkout', headers=other, json=selection).status_code == 403


@pytest.mark.parametrize('change', ['hidden', 'stale', 'trial', 'mismatch'])
def test_unavailable_checkout_rejected_before_provider_write(client, subscriber, db_session_factory, change):
    uid, auth, provider = subscriber
    with db_session_factory() as db:
        p = db.get(Plan, 1); c = dict(p.configuration)
        if change == 'hidden': c['subscriber_visible'] = False
        elif change == 'trial': c['trial_days'] = 7
        elif change == 'mismatch': c['monthly_price'] = '999.00'
        p.configuration = c
        if change == 'stale': db.add(Plan(code=p.code, revision=2, configuration=c, change_note='New', created_by=None))
        db.commit()
    result = client.post(URL + '/billing/checkout', headers=auth, json={'code': 'explorer', 'revision': 1, 'interval': 'monthly'})
    assert result.status_code in (409, 422), result.text
    assert not any(c[0] == 'POST' for c in provider.calls)


def test_subscriber_portal_and_refresh_do_not_grant_policy(client, subscriber, db_session_factory):
    uid, auth, provider = subscriber
    client.post(URL + '/billing/checkout', headers=auth, json={'code': 'explorer', 'revision': 1, 'interval': 'monthly'})
    provider.complete()
    result = client.post(URL + '/billing/refresh', headers=auth)
    assert result.status_code == 200 and result.json()['portal_allowed'] and not result.json()['checkout_allowed']
    result = client.post(URL + '/billing/portal', headers=auth)
    assert result.status_code == 200, result.text
    post = next(c for c in provider.calls if c[:2] == ('POST', 'billing_portal/sessions'))
    assert post[2]['return_url'] == 'https://radar.example/subscription?stripe_return=portal'
    assert post[2]['customer'] == 'cus_sub_1'
    assert client.post(URL + '/billing/checkout', headers=auth, json={'code': 'explorer', 'revision': 1, 'interval': 'monthly'}).status_code == 409
    with db_session_factory() as db:
        assert db.scalar(select(func.count()).select_from(Policy).where(Policy.user_id == uid)) == 1
    # A success query string is just navigation, never payment evidence.
    assert not client.get(URL + '?stripe_return=checkout', headers=auth).json()['allowed']


def test_auth_and_payload_tampering(client, subscriber):
    _, auth, provider = subscriber
    for suffix in ['/billing', '/billing/checkout', '/billing/portal', '/billing/refresh', '/billing/resume']:
        response = client.get(URL + suffix) if suffix == '/billing' else client.post(URL + suffix, json={})
        assert response.status_code == 401
    response = client.post(URL + '/billing/checkout', headers=auth, json={'code': 'explorer', 'revision': 1, 'interval': 'monthly', 'customer': 'cus_other', 'return_url': 'https://evil.example'})
    assert response.status_code == 422 and not provider.calls


def test_published_plan_validation():
    from app.schemas.subscription_plan import SubscriptionPlanConfiguration
    from pydantic import ValidationError
    c = configuration()
    with pytest.raises(ValidationError): SubscriptionPlanConfiguration.model_validate({**c, 'state': 'draft', 'subscriber_visible': True})
    valid = {**c, 'state': 'reviewed', 'subscriber_visible': True}
    assert SubscriptionPlanConfiguration.model_validate(valid).subscriber_visible
    for field, value in [('tax_display', 'exclusive'), ('trial_days', 7), ('stripe_sandbox', None)]:
        with pytest.raises(ValidationError): SubscriptionPlanConfiguration.model_validate({**valid, field: value})


def test_non_explorer_selection_uses_exact_code_and_display_order(client, subscriber, db_session_factory):
    uid, auth, provider = subscriber
    with db_session_factory() as db:
        c = dict(db.get(Plan, 1).configuration)
        db.add(Plan(code='researcher', revision=1, configuration={**c, 'name': 'Researcher', 'display_order': 0}, change_note='Publish', created_by=None))
        db.get(Plan, 1).configuration = {**c, 'display_order': 10}
        db.commit()
    assert [p['code'] for p in client.get(URL + '/plans').json()['items']] == ['researcher', 'explorer']
    result = client.post(URL + '/billing/checkout', headers=auth, json={'code': 'researcher', 'revision': 1, 'interval': 'monthly'})
    assert result.status_code == 200, result.text
    with db_session_factory() as db:
        assert db.get(Plan, billing.latest(db, uid).plan_revision_id).code == 'researcher'
    # Same revision number on another plan cannot resume/change this intent.
    result = client.post(URL + '/billing/checkout', headers=auth, json={'code': 'explorer', 'revision': 1, 'interval': 'monthly'})
    assert result.status_code == 409
