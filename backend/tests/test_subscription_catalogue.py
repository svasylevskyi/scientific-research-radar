from uuid import UUID
import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from app.models.subscription_plan import SubscriptionPlanRevision
from test_digests import _register, _authorization, _super_admin_login, _digest_payload, PASSWORD

URL = '/api/v1/admin/subscription-plans'


def payload(**changes):
    config = dict(name='Explorer', monthly_price='9.00', max_digests=2, max_papers_per_run=20,
                  papers_per_month=50, runs_per_month=5, manual_runs_per_month=1,
                  schedule_frequencies=['weekly', 'monthly'])
    config.update(changes)
    return dict(code='explorer', expected_revision=0, change_note='Initial proposal', configuration=config)


def test_all_admins_can_customize_but_users_cannot(client, db_session_factory):
    member = _register(client, 'catalogue@example.com', 'Catalogue Admin')
    regular = _authorization(member)
    super_headers = _authorization(_super_admin_login(client, db_session_factory))
    for path in [URL, URL + '/explorer/revisions']:
        assert client.get(path).status_code == 401
        assert client.get(path, headers=regular).status_code == 403
    assert client.post(URL, json=payload(), headers=regular).status_code == 403
    assert client.put(f"/api/v1/admin/users/{member.json()['user']['id']}/role",
                      json={'role': 'admin'}, headers=super_headers).status_code == 200
    admin = _authorization(client.post('/api/v1/auth/login', json={'email': 'catalogue@example.com', 'password': PASSWORD}))
    saved = client.post(URL, json=payload(), headers=super_headers)
    assert saved.status_code == 201
    first = saved.json()
    assert first['revision'] == 1
    assert first['configuration']['monthly_price'] == '9.00'
    assert client.post(URL, json=payload(), headers=admin).status_code == 409
    edit = {**payload(monthly_price='12.00', state='reviewed'), 'expected_revision': 1, 'change_note': 'Updated proposal'}
    updated = client.post(URL, json=edit, headers=admin)
    assert updated.status_code == 201
    assert updated.json()['created_by'] == member.json()['user']['id']
    assert client.post(URL, json=edit, headers=super_headers).status_code == 409
    archive = {**payload(state='archived'), 'expected_revision': 2, 'change_note': 'Retire proposal'}
    assert client.post(URL, json=archive, headers=admin).status_code == 201
    listing = client.get(URL, headers=admin).json()
    assert listing['total'] == 1 and listing['items'][0]['revision'] == 3
    history = client.get(URL + '/explorer/revisions?limit=1&offset=2', headers=admin).json()
    assert history['total'] == 3 and history['items'][0] == first
    assert client.delete(URL + '/explorer', headers=admin).status_code in {404, 405}
    # No public endpoint and no user assignment or limit enforcement.
    assert client.get('/api/v1/subscription-plans', headers=admin).status_code == 404
    for i in range(3):
        assert client.post('/api/v1/digests', json=_digest_payload(topic=f'Unrestricted {i}'), headers=admin).status_code == 201


@pytest.mark.parametrize('changes', [dict(monthly_price='9.001'), dict(monthly_price='NaN'),
    dict(monthly_price='-1'), dict(max_papers_per_run=31), dict(manual_runs_per_month=6),
    dict(papers_per_month=10), dict(schedule_frequencies=['daily', 'daily']),
    dict(schedule_frequencies=['hourly']), dict(max_digests=True), dict(currency='ZZZ'),
    dict(name='  '), dict(state='published'), dict(unknown_field='x')])
def test_invalid_plan_values_are_rejected(client, db_session_factory, changes):
    admin = _authorization(_super_admin_login(client, db_session_factory))
    assert client.post(URL, json=payload(**changes), headers=admin).status_code == 422


def test_database_rejects_competing_revision_writes(db_session_factory):
    with db_session_factory() as first, db_session_factory() as second:
        # Both writers prepared the same next revision before either committed.
        a = SubscriptionPlanRevision(code='race', revision=1, configuration={}, change_note='A')
        b = SubscriptionPlanRevision(code='race', revision=1, configuration={}, change_note='B')
        first.add(a)
        second.add(b)
        first.commit()
        with pytest.raises(IntegrityError):
            second.commit()
        second.rollback()
        assert second.scalar(select(SubscriptionPlanRevision)).change_note == 'A'


def test_display_order_uses_latest_revision_before_pagination(client, db_session_factory):
    admin = _authorization(_super_admin_login(client, db_session_factory))
    for code, order in [('zebra', 2), ('alpha', 10), ('beta', 2), ('first', 0)]:
        assert client.post(URL, json={**payload(display_order=order), 'code': code}, headers=admin).status_code == 201
    assert client.post(URL, json={**payload(display_order=20), 'code': 'first', 'expected_revision': 1}, headers=admin).status_code == 201
    first = client.get(URL + '?limit=2', headers=admin).json()
    second = client.get(URL + '?limit=2&offset=2', headers=admin).json()
    assert first['total'] == second['total'] == 4
    assert [p['code'] for p in first['items']] == ['beta', 'zebra']
    assert [p['code'] for p in second['items']] == ['alpha', 'first']
