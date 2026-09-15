"""Read-only Stripe catalogue checks. Never creates products, prices, sessions or charges."""
from datetime import datetime, timezone
from decimal import Decimal
import httpx
from app.schemas.subscription_plan import SubscriptionPlanConfiguration


class StripeCatalogueError(Exception):
    def __init__(self, message, status_code=502):
        super().__init__(message)
        self.status_code = status_code


def check_mapping(configuration, settings, *, transport=None):
    config = SubscriptionPlanConfiguration.model_validate(configuration)
    mapping = config.stripe_sandbox
    if not mapping:
        raise StripeCatalogueError("Save a Stripe mapping for this plan first.", 422)
    secret = settings.effective_stripe_api_key.get_secret_value() if settings.effective_stripe_api_key else ""
    if not secret.startswith(("rk_live_", "sk_live_") if settings.stripe_livemode else ("rk_test_", "sk_test_")):
        raise StripeCatalogueError("Configure STRIPE_API_KEY with a key matching STRIPE_MODE on the API server.", 503)
    issues = []
    if config.tax_display != "inclusive":
        issues.append("The Radar plan tax-display policy must be Inclusive for this integration.")
    observations = []
    try:
        with httpx.Client(base_url="https://api.stripe.com/v1/", auth=(secret, ""),
                          timeout=10, follow_redirects=False, transport=transport) as client:
            def fetch(path):
                response = client.get(path)
                if response.status_code in (401, 403):
                    raise StripeCatalogueError("Stripe rejected access. Check the Stripe key and read permissions for Products and Prices.", 503)
                if response.status_code == 404:
                    raise StripeCatalogueError("A mapped product or price was not found in the configured Stripe environment. Check the IDs and Stripe key.", 422)
                if response.status_code != 200:
                    raise StripeCatalogueError("Stripe could not complete the check. Please try again later.")
                value = response.json()
                if not isinstance(value, dict) or value.get("livemode") is not settings.stripe_livemode:
                    raise StripeCatalogueError("Stripe did not return a expected-mode object. Verification stopped.")
                return value
            product = fetch(f"products/{mapping.product_id}")
            if product.get("id") != mapping.product_id or product.get("object") != "product" or product.get("active") is not True:
                issues.append("The mapped product is not an active Stripe product.")
            prices = [("monthly", mapping.monthly_price_id, config.monthly_price, "month")]
            if mapping.annual_price_id:
                prices.append(("annual", mapping.annual_price_id, config.annual_price, "year"))
            for label, price_id, amount, interval in prices:
                price = fetch(f"prices/{price_id}")
                if price.get("id") != price_id or price.get("object") != "price" or price.get("active") is not True:
                    issues.append(f"The {label} price is not an active Stripe price.")
                if price.get("product") != mapping.product_id:
                    issues.append(f"The {label} price belongs to a different product.")
                if price.get("currency") != config.currency.lower() or price.get("unit_amount") != int(Decimal(amount) * 100):
                    issues.append(f"The {label} price amount or currency differs from this Radar revision.")
                recurring = price.get("recurring") or {}
                if (price.get("type") != "recurring" or recurring.get("interval") != interval
                        or recurring.get("interval_count") != 1 or recurring.get("usage_type") != "licensed"
                        or price.get("billing_scheme") != "per_unit" or price.get("transform_quantity") is not None
                        or recurring.get("trial_period_days") is not None):
                    issues.append(f"The {label} price must be a flat, non-metered {interval}ly price with no price-level trial or quantity transformation.")
                tax = price.get("tax_behavior")
                if tax != "inclusive":
                    issues.append(f"The {label} price tax_behavior is {tax or 'missing'}. Explicit inclusive behavior is required for this check; unspecified may inherit Stripe Tax defaults.")
                observations.append({"interval": label, "price_id": price_id, "tax_behavior": tax,
                                     "currency": price.get("currency"), "unit_amount": price.get("unit_amount")})
    except StripeCatalogueError:
        raise
    except (httpx.HTTPError, ValueError, TypeError, AttributeError):
        raise StripeCatalogueError("Stripe verification failed or returned an unexpected response. Please try again.") from None
    return {"matches": not issues, "issues": issues, "prices": observations,
            "checked_at": datetime.now(timezone.utc), "environment": settings.stripe_mode}


def list_products(settings, *, transport=None):
    """Read the complete bounded catalogue. Never return a silently partial picker."""
    secret = settings.effective_stripe_api_key.get_secret_value() if settings.effective_stripe_api_key else ''
    if not secret.startswith(('rk_live_', 'sk_live_') if settings.stripe_livemode else ('rk_test_', 'sk_test_')):
        raise StripeCatalogueError('Configure STRIPE_API_KEY with a key matching STRIPE_MODE.', 503)
    try:
        with httpx.Client(base_url='https://api.stripe.com/v1/', auth=(secret, ''), timeout=10,
                          follow_redirects=False, transport=transport) as client:
            def collect(path, object_type):
                result, seen = [], set()
                params = {'limit': 100, 'active': 'true'}
                if path == 'prices':
                    params['type'] = 'recurring'
                for _ in range(20):
                    response = client.get(path, params=params)
                    if response.status_code in (401, 403):
                        raise StripeCatalogueError('Stripe rejected access. Check the Stripe key and read permissions for Products and Prices.', 503)
                    if response.status_code != 200:
                        raise StripeCatalogueError('Stripe catalogue is unavailable. Please retry later.')
                    page = response.json()
                    if not isinstance(page, dict) or page.get('object') != 'list' or not isinstance(page.get('data'), list) or type(page.get('has_more')) is not bool:
                        raise StripeCatalogueError('Stripe returned an unexpected catalogue response.')
                    for item in page['data']:
                        if not isinstance(item, dict) or item.get('object') != object_type or item.get('livemode') is not settings.stripe_livemode or not isinstance(item.get('id'), str) or item['id'] in seen:
                            raise StripeCatalogueError('Stripe returned an unexpected or wrong-mode catalogue object.')
                        seen.add(item['id'])
                        result.append(item)
                    if not page['has_more']:
                        return result
                    if not page['data']:
                        raise StripeCatalogueError('Stripe returned invalid catalogue pagination.')
                    params['starting_after'] = page['data'][-1]['id']
                raise StripeCatalogueError('Stripe catalogue exceeds the supported size (2,000 products or prices). No partial list was returned.')
            products = collect('products', 'product')
            prices = collect('prices', 'price')
        grouped = {}
        for price in prices:
            recurring = price.get('recurring') or {}
            amount = price.get('unit_amount')
            if (price.get('active') is not True or price.get('type') != 'recurring'
                    or recurring.get('interval') not in ('month', 'year') or recurring.get('interval_count') != 1
                    or recurring.get('usage_type') != 'licensed' or recurring.get('trial_period_days') is not None
                    or price.get('billing_scheme') != 'per_unit' or price.get('transform_quantity') is not None
                    or price.get('tax_behavior') != 'inclusive' or price.get('currency') not in ('eur', 'usd', 'gbp', 'pln')
                    or type(amount) is not int or not 0 <= amount <= 100000000):
                continue
            grouped.setdefault(price['product'], []).append({'id': price['id'], 'currency': price['currency'].upper(),
                'amount': f'{Decimal(amount) / 100:.2f}', 'interval': recurring['interval']})
        return [{'id': product['id'], 'name': product['name'],
                 'prices': sorted(grouped.get(product['id'], []), key=lambda p: (p['interval'], p['currency'], Decimal(p['amount']), p['id']))}
                for product in products if product.get('active') is True]
    except StripeCatalogueError:
        raise
    except (httpx.HTTPError, ValueError, TypeError, AttributeError, KeyError):
        raise StripeCatalogueError('Stripe catalogue could not be read. Please retry.') from None
