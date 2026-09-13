from types import SimpleNamespace
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
import httpx
import pytest
from pydantic import SecretStr
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.exc import IntegrityError
from app.models.subscription_plan import StripeProductClaim, SubscriptionPlanRevision
from app.services.stripe_catalogue_service import list_products, StripeCatalogueError
from test_subscription_catalogue import payload, URL
from test_digests import _authorization, _super_admin_login, _register

SETTINGS = SimpleNamespace(stripe_sandbox_api_key=SecretStr('rk_test_fake'))
PRICE = dict(id='price_month', object='price', livemode=False, active=True, product='prod_one',
    currency='eur', unit_amount=900, type='recurring', billing_scheme='per_unit', tax_behavior='inclusive',
    recurring={'interval': 'month', 'interval_count': 1, 'usage_type': 'licensed'})


def catalogue_mock(prices=None, status=200, more=False):
    calls = []
    def handler(request):
        assert request.method == 'GET'
        calls.append(request)
        if request.url.path.endswith('/products'):
            cursor = request.url.params.get('starting_after')
            data = [dict(id='prod_two' if cursor else 'prod_one', name='Two' if cursor else 'One', object='product', active=True, livemode=False)]
            has_more = more and not cursor
        else:
            data, has_more = prices if prices is not None else [PRICE], False
        return httpx.Response(status, json=dict(object='list', data=data, has_more=has_more))
    return httpx.MockTransport(handler), calls


def test_picker_paginates_and_includes_products_without_prices():
    mock, calls = catalogue_mock(more=True)
    rows = list_products(SETTINGS, transport=mock)
    assert len(calls) == 3 and calls[1].url.params['starting_after'] == 'prod_one'
    assert rows[0]['prices'][0]['amount'] == '9.00' and rows[1]['prices'] == []


@pytest.mark.parametrize('change', [dict(active=False), dict(unit_amount=None), dict(unit_amount=True),
    dict(currency='jpy'), dict(tax_behavior='unspecified'), dict(billing_scheme='tiered'),
    dict(recurring={'interval': 'week', 'interval_count': 1, 'usage_type': 'licensed'}),
    dict(transform_quantity={'divide_by': 10})])
def test_picker_excludes_incompatible_prices(change):
    mock, _ = catalogue_mock([{**PRICE, **change}])
    assert list_products(SETTINGS, transport=mock)[0]['prices'] == []


@pytest.mark.parametrize('status', [401, 403, 429, 500, 302])
def test_catalogue_errors_are_sanitized(status):
    mock, _ = catalogue_mock(status=status)
    with pytest.raises(StripeCatalogueError): list_products(SETTINGS, transport=mock)


def test_catalogue_live_and_malformed_pages_rejected():
    for data in [dict(object='list', data=[{**PRICE, 'livemode': True}], has_more=False),
                 dict(object='list', data=[], has_more=True), dict(error='secret provider text')]:
        with pytest.raises(StripeCatalogueError):
            list_products(SETTINGS, transport=httpx.MockTransport(lambda _: httpx.Response(200, json=data)))
    mock, calls = catalogue_mock()
    with pytest.raises(StripeCatalogueError):
        list_products(SimpleNamespace(stripe_sandbox_api_key=SecretStr('sk_live_fake')), transport=mock)
    assert not calls


def test_admin_picker_and_history_ownership(client, db_session_factory, monkeypatch):
    admin = _authorization(_super_admin_login(client, db_session_factory))
    member = _authorization(_register(client, 'picker@example.com', 'Picker'))
    monkeypatch.setattr('app.services.stripe_catalogue_service.list_products', lambda settings: [dict(id='prod_explorer', name='Explorer', prices=[])])
    assert client.get(URL + '/stripe-products').status_code == 401
    assert client.get(URL + '/stripe-products', headers=member).status_code == 403
    assert client.post(URL, headers=admin, json=payload()).status_code == 201
    edit = {**payload(state='archived', stripe_sandbox={'product_id': 'prod_new', 'monthly_price_id': 'price_new'}), 'expected_revision': 1}
    assert client.post(URL, headers=admin, json=edit).status_code == 201
    result = client.get(URL + '/stripe-products', headers=admin)
    assert result.headers['cache-control'] == 'no-store'
    assert result.json()['items'][0]['mapped_plan_codes'] == ['explorer']
    assert client.post(URL, headers=admin, json={**payload(), 'code': 'other'}).status_code == 409
    with db_session_factory() as db:
        assert not db.scalar(select(SubscriptionPlanRevision).where(SubscriptionPlanRevision.code == 'other'))
    assert client.post(URL, headers=admin, json={**payload(stripe_sandbox=None), 'code': 'unmapped'}).status_code == 422


def test_price_preview_includes_free_latest_revisions_and_all_pages(client, db_session_factory):
    admin = _authorization(_super_admin_login(client, db_session_factory))
    with db_session_factory() as db:
        for i in range(30):
            db.add(SubscriptionPlanRevision(code=f'plan{i}', revision=1,
                configuration={**payload()['configuration'], 'name': f'Plan {i}', 'currency': 'EUR', 'monthly_price': '50.00'}, change_note='old'))
        for code, config in [('zero', {'monthly_price': '0.00'}), ('near', {'monthly_price': '10.00', 'annual_price': '100.00'}),
                             ('foreign', {'currency': 'USD', 'monthly_price': '9.00'}), ('archived', {'state': 'archived', 'monthly_price': '9.00'})]:
            db.add(SubscriptionPlanRevision(code=code, revision=1, configuration={**payload()['configuration'], 'name': code, 'currency': 'EUR', **config}, change_note='test'))
        db.add(SubscriptionPlanRevision(code='plan29', revision=2, configuration={**payload()['configuration'], 'name': 'Latest', 'currency': 'EUR'}, change_note='new'))
        db.commit()
    body = dict(code='explorer', configuration=payload(annual_price='90.00', stripe_sandbox=None)['configuration'])
    result = client.post(URL + '/price-warnings', headers=admin, json=body).json()['warnings']
    assert len(result) == 3 and any('Latest' in text for text in result)
    assert all('foreign' not in text and 'archived' not in text for text in result)
    body['configuration'].update(billing_type='free', monthly_price='0.00', annual_price=None)
    result = client.post(URL + '/price-warnings', headers=admin, json=body).json()['warnings']
    assert len(result) == 1 and 'zero' in result[0]
    body['code'] = 'zero'
    assert client.post(URL + '/price-warnings', headers=admin, json=body).json()['warnings'] == []


def test_concurrent_product_claims_have_one_owner(tmp_path):
    engine = create_engine(f'sqlite:///{tmp_path}/claims.db', connect_args={'check_same_thread': False})
    StripeProductClaim.__table__.create(engine)
    factory = sessionmaker(engine)
    barrier = Barrier(2)
    def writer(code):
        with factory() as db:
            assert db.get(StripeProductClaim, 'prod_race') is None
            barrier.wait()
            db.add(StripeProductClaim(product_id='prod_race', plan_code=code))
            try:
                db.commit()
                return True
            except IntegrityError:
                db.rollback()
                return False
    with ThreadPoolExecutor(2) as pool:
        assert sorted(pool.map(writer, ['a', 'b'])) == [False, True]
    engine.dispose()
