from types import SimpleNamespace
import httpx
import pytest
from pydantic import SecretStr, ValidationError
from app.schemas.subscription_plan import SubscriptionPlanConfiguration
from app.services.stripe_catalogue_service import check_mapping, StripeCatalogueError
from test_digests import _authorization, _register, _super_admin_login
from test_subscription_catalogue import payload, URL


def configuration():
    return SubscriptionPlanConfiguration(**payload(annual_price='90.00', tax_display='inclusive',
        stripe_sandbox={'product_id': 'prod_example', 'monthly_price_id': 'price_month', 'annual_price_id': 'price_year'})['configuration']).model_dump(mode='json')


def transport(changes=None, *, status=200):
    calls = []
    def handler(request):
        assert request.method == 'GET'
        assert request.url.host == 'api.stripe.com'
        calls.append(request.url.path)
        if request.url.path.startswith('/v1/products/'):
            data = {'object': 'product', 'id': 'prod_example', 'active': True, 'livemode': False}
        else:
            yearly = request.url.path.endswith('price_year')
            data = {'id': 'price_year' if yearly else 'price_month', 'object': 'price',
                'product': 'prod_example', 'active': True, 'livemode': False,
                'currency': 'eur', 'unit_amount': 9000 if yearly else 900,
                'tax_behavior': 'inclusive', 'type': 'recurring', 'billing_scheme': 'per_unit',
                'recurring': {'interval': 'year' if yearly else 'month', 'interval_count': 1, 'usage_type': 'licensed'}}
            data.update(changes or {})
        return httpx.Response(status, json=data)
    return httpx.MockTransport(handler), calls


SETTINGS = SimpleNamespace(stripe_sandbox_api_key=SecretStr('rk_test_fake'))


def test_read_only_verification_matches_and_uses_no_automatic_requests():
    mock, calls = transport()
    report = check_mapping(configuration(), SETTINGS, transport=mock)
    assert report['matches'] and len(calls) == 3
    assert report['environment'] == 'sandbox'


@pytest.mark.parametrize('change', [dict(tax_behavior='unspecified'), dict(tax_behavior='exclusive'),
    dict(currency='usd'), dict(unit_amount=901), dict(product='prod_other'), dict(active=False),
    dict(recurring={'interval': 'month', 'interval_count': 2, 'usage_type': 'licensed'}),
    dict(billing_scheme='tiered'), dict(transform_quantity={'divide_by': 10})])
def test_price_mismatches_are_reported(change):
    mock, _ = transport(change)
    result = check_mapping(configuration(), SETTINGS, transport=mock)
    assert not result['matches'] and result['issues']


@pytest.mark.parametrize('key', [None, SecretStr('sk_live_do_not_use'), SecretStr('rk_live_do_not_use')])
def test_missing_or_live_keys_cannot_make_a_request(key):
    mock, calls = transport()
    with pytest.raises(StripeCatalogueError) as error:
        check_mapping(configuration(), SimpleNamespace(stripe_sandbox_api_key=key), transport=mock)
    assert error.value.status_code == 503 and not calls


@pytest.mark.parametrize('status', [401, 403, 404, 429, 500, 302])
def test_provider_errors_are_sanitized(status):
    mock, calls = transport(status=status)
    with pytest.raises(StripeCatalogueError):
        check_mapping(configuration(), SETTINGS, transport=mock)
    assert len(calls) == 1


def test_live_response_is_rejected_even_with_test_key():
    mock, _ = transport({'livemode': True})
    with pytest.raises(StripeCatalogueError, match='sandbox object'):
        check_mapping(configuration(), SETTINGS, transport=mock)


def test_mapping_validation_and_optional_backwards_compatibility():
    assert SubscriptionPlanConfiguration(**payload()['configuration']).stripe_sandbox is None
    config = configuration()
    config['stripe_sandbox']['product_id'] = 'prod_example/../../customers'
    with pytest.raises(ValidationError):
        SubscriptionPlanConfiguration.model_validate(config)
    config = configuration()
    config['annual_price'] = None
    with pytest.raises(ValidationError):
        SubscriptionPlanConfiguration.model_validate(config)


def test_saved_revision_check_is_admin_only_and_explicit(client, db_session_factory, monkeypatch):
    user = _authorization(_register(client, 'stripeviewer@example.com', 'Viewer'))
    admin = _authorization(_super_admin_login(client, db_session_factory))
    saved = client.post(URL, json={**payload(), 'configuration': configuration()}, headers=admin).json()
    assert saved['configuration']['stripe_sandbox']['product_id'] == 'prod_example'
    calls = []
    def fake(config, settings):
        calls.append(config)
        return {'matches': True, 'issues': [], 'prices': []}
    monkeypatch.setattr('app.services.stripe_catalogue_service.check_mapping', fake)
    path = URL + '/explorer/revisions/1/check-stripe'
    assert client.get(URL, headers=admin).status_code == 200
    assert client.post(path).status_code == 401
    assert client.post(path, headers=user).status_code == 403
    assert not calls
    response = client.post(path, headers=admin)
    assert response.status_code == 200 and response.json()['matches']
    assert response.headers['cache-control'] == 'no-store'
    assert len(calls) == 1
    assert client.post(URL + '/explorer/revisions/99/check-stripe', headers=admin).status_code == 404
