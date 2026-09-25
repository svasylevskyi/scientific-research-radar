"""Metadata contracts, external failure isolation, evidence history, and gates."""
import asyncio
from copy import deepcopy
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
from uuid import UUID, uuid4

import httpx
import pytest
from sqlalchemy import func, select

from app.core.config import Settings
from app.models.digest_run import DigestRun
from app.models.source_verification import SourceMetadataCache, SourceProviderState, SourceVerification
from app.models.user import User, UserRole
from app.radar.contracts import SearchPaper
from app.repositories.digest_run_repository import DigestRunRepository
from app.scheduler.dispatch import ScheduleDispatcher
from app.schemas.research_quality import QualitySnapshot
from app.schemas.source_verification import MetadataLookup, SourceMetadata
from app.services.source_metadata_service import lookup_metadata
from app.services.source_verification_service import verify_automatically
from app.sources import metadata
from app.sources.comparison import compare_paper, lookup_identity
from app.sources.metadata import fetch_metadata, parse_arxiv, parse_crossref
from test_digest_runs import RecordingRadarClient, _execute_next
from test_manual_quality import completed  # shared completed-run/admin fixture
from test_research_quality import BASELINE, publish
from test_scheduler_delivery import NOW, setup_schedule

FIXTURES = Path(__file__).parent / 'fixtures/source_metadata'
CROSSREF = (FIXTURES / 'crossref.json').read_bytes()
ARXIV = (FIXTURES / 'arxiv.xml').read_bytes()
GROUND = parse_crossref(CROSSREF)['10.1038/nature14539']


def paper(**changes):
    data = deepcopy(BASELINE['stages']['discovery_relevance']['search']['papers'][0])
    data.update(title=GROUND.title, authors=GROUND.authors, doi=GROUND.doi, url=GROUND.url,
                published_date=GROUND.dates[0], source_name='Crossref', external_id=GROUND.identifier)
    return SearchPaper.model_validate(data | changes)


def evidence(record=GROUND, provider='crossref', identifier=None):
    return MetadataLookup(provider=provider, identifier=identifier or record.identifier,
        request_url=metadata.request_url(provider, [identifier or record.identifier]),
        retrieved_at=datetime.now(timezone.utc), metadata=record)


@pytest.mark.parametrize('changes,status', [
    ({}, 'verified'),
    ({'title': 'DEEP LEARNING!'}, 'verified'),
    ({'authors': ['Y. LeCun', 'Bengio, Y.']}, 'verified'),
    ({'published_date': '2015-05-28'}, 'verified'),
    ({'title': 'Ocean tides and plankton circulation'}, 'conflict'),
    ({'authors': ['Robert Unknown']}, 'conflict'),
    ({'authors': ['R. Unknown']}, 'unverified'),
    ({'authors': []}, 'unverified'),
    ({'published_date': '2020-01-01'}, 'conflict'),
    ({'published_date': None}, 'unverified'),
    ({'title': 'Deep learning methods'}, 'unverified'),
])
def test_reviewed_metadata_comparisons(changes, status):
    assert compare_paper(paper(**changes), evidence()).status == status


def test_partial_dates_and_missing_metadata_are_never_verified():
    assert compare_paper(paper(), evidence(GROUND.model_copy(update={'dates': ['2015']}))).status == 'unverified'
    result = compare_paper(paper(), evidence().model_copy(update={'metadata': None, 'reason': 'Provider unavailable'}))
    assert result.status == 'unverified' and result.notes == ['Provider unavailable']
    wrong = evidence().model_copy(update={'identifier': '10.9999/wrong'})
    assert compare_paper(paper(), wrong).status == 'conflict'


def test_arxiv_version_and_initial_publication_date():
    records = parse_arxiv(ARXIV)
    record = records['1706.03762']
    value = paper(title=record.title, authors=record.authors, doi=None, url=record.url,
        source_name='arxiv', external_id='1706.03762v7', published_date='2017-06-12')
    assert lookup_identity(value) == ('arxiv', '1706.03762v7')
    assert compare_paper(value, evidence(record, 'arxiv', '1706.03762')).status == 'verified'
    assert compare_paper(value.model_copy(update={'published_date': datetime(2023, 8, 2).date()}), evidence(record, 'arxiv')).status == 'conflict'
    assert compare_paper(value, evidence(record, 'arxiv', '1706.03762v1')).status == 'conflict'
    assert lookup_identity(value.model_copy(update={'url': 'https://example.com/paper', 'source_name': 'Other', 'doi': '10.48550/arXiv.1706.03762'})) == ('arxiv', '1706.03762')


@pytest.mark.parametrize('url,doi', [('http://127.0.0.1/private', None), ('https://arxiv.org.evil.test/abs/1706.03762', None), ('https://example.com/paper', '10.1234/x,from-pub-date:2020')])
def test_unsupported_identifiers_never_turn_into_arbitrary_requests(url, doi):
    value = paper(url=url, doi=doi, source_name='Other', external_id='unknown')
    assert lookup_identity(value) is None
    assert compare_paper(value, None).status == 'unverified'


@pytest.mark.parametrize('provider,body,identifier', [('crossref', CROSSREF, GROUND.identifier), ('arxiv', ARXIV, '1706.03762')])
def test_provider_parsing_and_fixed_batched_urls(monkeypatch, provider, body, identifier):
    requested = []
    async def download(url):
        requested.append(url)
        return body, 0
    monkeypatch.setattr(metadata, '_download', download)
    result, backoff = fetch_metadata(provider, [identifier, '10.9999/missing' if provider == 'crossref' else '9999.99999'])
    assert result[identifier].metadata is not None and backoff == 0
    assert len(requested) == 1 and requested[0].startswith(metadata.ENDPOINTS[provider])
    missing = next(item for key, item in result.items() if key != identifier)
    assert missing.metadata is None and 'not proven invalid' in missing.reason


@pytest.mark.parametrize('failure', ['timeout', 'malformed', 'entity', 'encoded_entity', 'rate_limit'])
def test_provider_failures_do_not_become_conflicts(monkeypatch, failure):
    async def download(url):
        if failure == 'timeout':
            raise TimeoutError()
        if failure == 'rate_limit':
            return b'', 120
        if failure == 'encoded_entity':
            return '<!DOCTYPE x [<!ENTITY x "expanded">]><feed>&x;</feed>'.encode('utf-16'), 0
        return (b'<!DOCTYPE x [<!ENTITY x "expanded">]><feed>&x;</feed>' if failure == 'entity' else b'bad'), 0
    monkeypatch.setattr(metadata, '_download', download)
    result, backoff = fetch_metadata('arxiv', ['1706.03762'])
    assert result['1706.03762'].metadata is None and backoff >= 60
    assert compare_paper(paper(), result['1706.03762']).status == 'unverified'


def test_transport_does_not_follow_redirects_and_limits_body(monkeypatch):
    real_client = httpx.AsyncClient
    seen = []
    def handler(request):
        seen.append(str(request.url))
        return httpx.Response(302, headers={'Location': 'http://127.0.0.1/secret'})
    monkeypatch.setattr(httpx, 'AsyncClient', lambda **kwargs: real_client(transport=httpx.MockTransport(handler), **kwargs))
    result, _ = fetch_metadata('crossref', [GROUND.identifier])
    assert len(seen) == 1 and result[GROUND.identifier].metadata is None
    def large(request):
        return httpx.Response(200, content=b'x' * (metadata.MAX_BODY_BYTES + 1))
    monkeypatch.setattr(httpx, 'AsyncClient', lambda **kwargs: real_client(transport=httpx.MockTransport(large), **kwargs))
    assert fetch_metadata('crossref', [GROUND.identifier])[0][GROUND.identifier].metadata is None


def test_transport_rejects_compression_before_reading_body(monkeypatch):
    real_client = httpx.AsyncClient
    class UnreadBody(httpx.AsyncByteStream):
        async def __aiter__(self):
            pytest.fail('Compressed body must not be read or decompressed')
            yield b''
    def compressed(request):
        assert request.headers['Accept-Encoding'] == 'identity'
        return httpx.Response(200, headers={'Content-Encoding': 'gzip'}, stream=UnreadBody())
    monkeypatch.setattr(httpx, 'AsyncClient', lambda **kwargs: real_client(transport=httpx.MockTransport(compressed), **kwargs))
    records, backoff = fetch_metadata('crossref', [GROUND.identifier])
    assert records[GROUND.identifier].metadata is None and backoff == 60


def test_shared_cache_and_provider_cooldown(db_session_factory, monkeypatch):
    calls = []
    with db_session_factory() as db:
        def fetch(provider, ids):
            assert not db.in_transaction()
            calls.append(ids)
            return {key: evidence() for key in ids}, 0
        monkeypatch.setattr(metadata, 'fetch_metadata', fetch)
        first = lookup_metadata(db, 'crossref', [GROUND.identifier, GROUND.identifier])
        second = lookup_metadata(db, 'crossref', [GROUND.identifier])
        assert len(calls) == 1 and not first[GROUND.identifier].cached and second[GROUND.identifier].cached
        assert second[GROUND.identifier].retrieved_at == first[GROUND.identifier].retrieved_at
        busy = lookup_metadata(db, 'crossref', ['10.9999/new'])
        assert 'cooling down' in busy['10.9999/new'].reason and len(calls) == 1
        cache = db.get(SourceMetadataCache, 'crossref:' + GROUND.identifier)
        cache.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        db.get(SourceProviderState, 'crossref').available_at = cache.expires_at
        db.commit()
        assert not lookup_metadata(db, 'crossref', [GROUND.identifier])[GROUND.identifier].cached
        assert len(calls) == 2


def test_manual_sources_permissions_history_and_unchanged_delivery(client, db_session_factory, completed):
    url = completed['url'].replace('quality-evaluations', 'source-verifications')
    auth = completed['auth']
    payload = {'expected_settings_version': 0}
    assert client.post(url, json=payload).status_code == 401
    assert client.post(url, headers=completed['owner_auth'], json=payload).status_code == 403
    assert client.get(url, headers=completed['owner_auth']).status_code == 403
    assert client.post(url.replace(str(completed['run_id']), str(uuid4())), headers=auth, json=payload).status_code == 404
    with db_session_factory() as db:
        run = DigestRunRepository(db).get(completed['run_id'])
        before = {c.name: deepcopy(getattr(run, c.name)) for c in DigestRun.__table__.columns}
        delivery = run.email_delivery.status
    a = client.post(url, headers=auth, json=payload)
    b = client.post(url, headers=auth, json=payload)
    assert a.status_code == b.status_code == 201
    assert a.json()['id'] != b.json()['id']
    assert b.json()['created_by'] == str(completed['admin_id'])
    history = client.get(url + '?limit=1', headers=auth).json()
    assert history['items'] == [b.json()] and history['total'] == 3
    with db_session_factory() as db:
        run = DigestRunRepository(db).get(completed['run_id'])
        assert {c.name: getattr(run, c.name) for c in DigestRun.__table__.columns} == before
        assert run.email_delivery.status == delivery
    publish(db_session_factory, 'observe', source_verification_mode='off')
    assert client.post(url, headers=auth, json=payload).status_code == 409
    assert client.post(url, headers=auth, json={'expected_settings_version': 1}).status_code == 409
    assert len(completed['fake'].calls) == 4


@pytest.mark.parametrize('mode,source_mode,conflict,blocked', [('enforce', 'enforce', True, True), ('enforce', 'observe', True, False), ('observe', 'enforce', True, False), ('enforce', 'enforce', False, False)])
def test_automatic_source_policy_and_recovery(client, db_session_factory, monkeypatch, mode, source_mode, conflict, blocked):
    publish(db_session_factory, mode, source_verification_mode=source_mode, check_reporting_dates=False, check_source_access=False, sparse_paper_threshold=0)
    setup_schedule(client)
    fake = RecordingRadarClient()
    def fetch(provider, ids):
        return {key: MetadataLookup(provider=provider, identifier=key,
            request_url=metadata.request_url(provider, ids), retrieved_at=datetime.now(timezone.utc),
            metadata=SourceMetadata(identifier=key, title='Ocean currents and coastal erosion', authors=[], dates=[]) if conflict else None,
            reason=None if conflict else 'Provider offline') for key in ids}, 0
    monkeypatch.setattr(metadata, 'fetch_metadata', fetch)
    ScheduleDispatcher(Settings(), db_session_factory, fake).tick(NOW)
    _execute_next(db_session_factory, fake)
    with db_session_factory() as db:
        run = DigestRunRepository(db).get(db.scalar(select(DigestRun.id)))
        assert run.status == 'completed'
        assert run.quality_delivery_blocked == blocked
        if blocked:
            assert run.email_delivery.status == 'held'
        else:
            assert run.quality_status in {'warning', 'hold'}
        assert db.scalar(select(func.count()).select_from(SourceVerification)) == 1
        assert verify_automatically(db, run).id == db.scalar(select(SourceVerification.id))
        assert db.scalar(select(func.count()).select_from(SourceVerification)) == 1
    assert len(fake.calls) == 4


def test_legacy_snapshot_skips_new_network_checks(db_session_factory):
    from types import SimpleNamespace
    raw = {'version': 0, 'engine_version': '1', 'config': {'mode': 'enforce'}}
    assert QualitySnapshot.model_validate(raw).config.source_verification_mode == 'off'
    with db_session_factory() as db:
        assert verify_automatically(db, SimpleNamespace(quality_config=raw)) is None


def test_real_total_deadline_cancels_slow_transport(monkeypatch):
    cancelled = []
    async def slow(url):
        try:
            await asyncio.sleep(10)
        finally:
            cancelled.append(True)
    monkeypatch.setattr(metadata, '_download', slow)
    monkeypatch.setattr(metadata, 'REQUEST_DEADLINE', 0.01)
    assert fetch_metadata('arxiv', ['1706.03762'])[0]['1706.03762'].metadata is None
    assert cancelled == [True]


def test_duplicate_source_identity_uses_one_lookup_and_retains_paper_evidence(client, db_session_factory, completed, monkeypatch):
    with db_session_factory() as db:
        run = DigestRunRepository(db).get(completed['run_id'])
        discovery = deepcopy(run.stages[0].result_data)
        first = discovery['search']['papers'][0]
        duplicate = deepcopy(first) | {'external_id': 'another-provider-id'}
        discovery['search']['papers'].append(duplicate)
        discovery['relevance']['assessments'].append(deepcopy(discovery['relevance']['assessments'][0]) | {'external_id': duplicate['external_id']})
        run.stages[0].result_data = discovery
        db.commit()
    response = client.post(completed['url'].replace('quality-evaluations', 'source-verifications'),
        headers=completed['auth'], json={'expected_settings_version': 0})
    assert response.status_code == 201
    papers = response.json()['papers']
    assert len(papers) == 2 and all(any('Same source identifier' in note for note in paper['notes']) for paper in papers)
    assert papers[0]['evidence']['identifier'] == papers[1]['evidence']['identifier']


def test_super_admin_digest_is_protected_for_source_checks(client, db_session_factory, completed):
    url = completed['url'].replace('quality-evaluations', 'source-verifications')
    with db_session_factory() as db:
        owner = db.get(User, completed['owner_id'])
        owner.role = UserRole.ADMIN
        owner.is_super_admin = True
        db.commit()
    assert client.get(url, headers=completed['auth']).status_code == 404
    assert client.post(url, headers=completed['auth'], json={'expected_settings_version': 0}).status_code == 404


def test_automatic_modes_off_and_malformed_saved_input(client, db_session_factory, completed):
    with db_session_factory() as db:
        run = DigestRunRepository(db).get(completed['run_id'])
        original = deepcopy(run.quality_config)
        for mode, source_mode in [('off', 'observe'), ('enforce', 'off')]:
            run.quality_config = {**original, 'config': {**original['config'], 'mode': mode, 'source_verification_mode': source_mode}}
            assert verify_automatically(db, run) is None
        run.quality_config = original
        # Remove the prior checkpoint to simulate completion before source evidence
        # was saved, with corrupt saved data. Core quality assessment handles Hold.
        from sqlalchemy import delete
        db.execute(delete(SourceVerification).where(SourceVerification.run_id == run.id))
        run.stages[0].result_data = {}
        db.commit()
        result = verify_automatically(db, run)
        assert not result.papers and result.findings[0].code == 'source_verification_unavailable'


def test_completion_is_fenced_if_worker_loses_lease_during_lookup(db_session_factory, completed, monkeypatch):
    from app.models.digest_run import DigestRunStatus
    from app.radar.client import RadarClientError
    from app.radar import lifecycle

    with db_session_factory() as db:
        run = db.get(DigestRun, completed['run_id'])
        run.status = DigestRunStatus.RUNNING
        run.worker_id = 'original-worker'
        db.commit()
        original_quality = deepcopy(run.quality_findings)

        def lose_ownership(session, current_run):
            current_run.worker_id = 'replacement-worker'
            session.commit()
            return None

        monkeypatch.setattr(lifecycle, 'verify_automatically', lose_ownership)
        monkeypatch.setattr(lifecycle.access, 'settle', lambda *args, **kwargs: pytest.fail('Lost worker must not settle allowances'))
        with pytest.raises(RadarClientError, match='lost its radar run lease'):
            lifecycle.RunLifecycle(db, worker_id='original-worker').complete_run(run.id)
        db.refresh(run)
        assert run.worker_id == 'replacement-worker'
        assert run.status == DigestRunStatus.RUNNING
        assert run.quality_findings == original_quality
