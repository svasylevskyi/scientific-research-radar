"""Read-only sandbox checks. Never creates products, prices, sessions or charges."""
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
        raise StripeCatalogueError("Save a sandbox mapping for this plan first.", 422)
    secret = settings.stripe_sandbox_api_key.get_secret_value() if settings.stripe_sandbox_api_key else ""
    if not secret.startswith(("rk_test_", "sk_test_")):
        raise StripeCatalogueError("Configure STRIPE_SANDBOX_API_KEY with a restricted sandbox key on the API server. Live keys are not accepted.", 503)
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
                    raise StripeCatalogueError("Stripe rejected access. Check the sandbox key and read permissions for Products and Prices.", 503)
                if response.status_code == 404:
                    raise StripeCatalogueError("A mapped product or price was not found in this sandbox. Check the IDs and sandbox key.", 422)
                if response.status_code != 200:
                    raise StripeCatalogueError("Stripe could not complete the check. Please try again later.")
                value = response.json()
                if not isinstance(value, dict) or value.get("livemode") is not False:
                    raise StripeCatalogueError("Stripe did not return a sandbox object. Verification stopped.")
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
            "checked_at": datetime.now(timezone.utc), "environment": "sandbox"}
