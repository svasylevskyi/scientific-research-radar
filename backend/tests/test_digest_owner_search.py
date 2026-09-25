"""Search the complete accessible owner population, before pagination."""
from datetime import datetime, timezone
from uuid import UUID, uuid4

import pytest

from app.models.user import User, UserRole
from app.repositories.digest_repository import DigestRepository
from app.schemas.digest import DigestCreate
from test_digests import _authorization, _digest_payload, _register, _super_admin_login


@pytest.fixture
def owners(client, db_session_factory):
    admin = _register(client, 'search-admin@example.com', 'Manager')
    root = _super_admin_login(client, db_session_factory)
    names = ['Zulu Team', 'beta Team', 'Alpha Team', 'Alpha Team', 'delta Team', 'echo Team', 'charlie Team']
    with db_session_factory() as db:
        db.get(User, UUID(admin.json()['user']['id'])).role = UserRole.ADMIN
        privileged = db.get(User, UUID(root.json()['user']['id']))
        privileged.full_name = 'Aardvark Team'
        people = [User(id=uuid4(), full_name=name, email=f'person{i}@group.example.com', password_hash='unused-test-hash',
                       created_at=datetime(2020, 1, 1, tzinfo=timezone.utc)) for i, name in enumerate(names)]
        people += [User(id=uuid4(), full_name='Email Match', email='embedded.team@example.com', password_hash='unused-test-hash'),
                   User(id=uuid4(), full_name='Literal %_ Name', email='literal@example.com', password_hash='unused-test-hash')]
        db.add_all(people + [User(id=uuid4(), full_name=f'Unrelated {i}', email=f'other{i}@example.com', password_hash='unused-test-hash') for i in range(105)])
        db.flush()
        for user in [*people, privileged]:
            DigestRepository(db).create(owner_id=user.id, values=DigestCreate.model_validate(_digest_payload(topic=f'Digest for {user.full_name}')).model_dump())
        db.commit()
        ids = [str(user.id) for user in people]
    return {'admin': _authorization(admin), 'root': _authorization(root), 'ids': ids}


def test_suggestions_are_five_alphabetical_matches_from_all_accessible_users(client, owners):
    result = client.get('/api/v1/admin/users', params={'q': 'tEaM', 'sort': 'name', 'limit': 5}, headers=owners['admin'])
    assert result.status_code == 200
    data = result.json()
    assert data['total'] == 8
    assert [item['full_name'] for item in data['items']] == ['Alpha Team', 'Alpha Team', 'beta Team', 'charlie Team', 'delta Team']
    assert [item['email'] for item in data['items'][:2]] == ['person2@group.example.com', 'person3@group.example.com']
    assert not any(item['is_super_admin'] for item in data['items'])
    root = client.get('/api/v1/admin/users', params={'q': 'TEAM', 'sort': 'name', 'limit': 5}, headers=owners['root']).json()
    assert root['items'][0]['full_name'] == 'Aardvark Team'
    assert root['total'] == 9


def test_free_text_owner_filter_counts_all_matches_and_paginates_digests(client, owners):
    first = client.get('/api/v1/admin/digests', params={'owner_query': ' TEAM ', 'limit': 3}, headers=owners['admin']).json()
    second = client.get('/api/v1/admin/digests', params={'owner_query': 'TEAM', 'limit': 3, 'offset': 3}, headers=owners['admin']).json()
    assert first['total'] == second['total'] == 8
    assert len(first['items']) == len(second['items']) == 3
    assert not {item['id'] for item in first['items']} & {item['id'] for item in second['items']}
    email = client.get('/api/v1/admin/digests', params={'owner_query': 'BEDDED.TEAM@EXAMPLE'}, headers=owners['admin']).json()
    assert email['total'] == 1 and email['items'][0]['owner']['full_name'] == 'Email Match'
    exact = client.get('/api/v1/admin/digests', params={'owner_id': owners['ids'][0]}, headers=owners['admin']).json()
    assert exact['total'] == 1 and exact['items'][0]['owner_id'] == owners['ids'][0]
    all_owners = client.get('/api/v1/admin/digests', headers=owners['admin']).json()
    assert all_owners['total'] == 9


def test_wildcards_are_literal_and_protected_owners_do_not_leak(client, owners):
    for path, field in [('/api/v1/admin/users', 'q'), ('/api/v1/admin/digests', 'owner_query')]:
        literal = client.get(path, params={field: '%_'}, headers=owners['admin']).json()
        assert literal['total'] == 1
        hidden = client.get(path, params={field: 'Aardvark'}, headers=owners['admin']).json()
        assert hidden['total'] == 0 and hidden['items'] == []
        assert client.get(path, params={field: 'x' * 121}, headers=owners['admin']).status_code == 422
        assert client.get(path).status_code == 401
