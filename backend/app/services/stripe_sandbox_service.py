"""Isolated admin sandbox billing. No entitlements or radar mutations.

Account-row writes serialize checkout creation and provider observations on SQLite
and PostgreSQL. An attempt and its exact parameters are committed BEFORE Stripe
is called so that ambiguous failures can only resume the same idempotent request.
"""
from datetime import datetime, timezone
import hashlib
import hmac
import json
import re
import time
from urllib.parse import urlsplit
from uuid import UUID, uuid4

import httpx
from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from app.models.stripe_sandbox import SandboxBillingAccount, SandboxCheckout, SandboxStripeEvent
from app.models.subscription_plan import SubscriptionPlanRevision
from app.services.stripe_catalogue_service import StripeCatalogueError, check_mapping

Error = StripeCatalogueError
TERMINAL = {"canceled", "incomplete_expired"}
STATUSES = {"incomplete", "incomplete_expired", "trialing", "active", "past_due", "canceled", "unpaid", "paused"}
EVENTS = {"checkout.session.completed", "checkout.session.expired", "customer.subscription.created",
          "customer.subscription.updated", "customer.subscription.deleted"}


def utc(value):
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def identifier(value, prefix):
    if not isinstance(value, str) or not re.fullmatch(re.escape(prefix) + r"[A-Za-z0-9_]{1,240}", value):
        raise Error("Stripe returned an unexpected identifier.")
    return value


def redirect_url(value, host):
    if not isinstance(value, str):
        raise Error("Stripe did not provide a hosted page.")
    parsed = urlsplit(value)
    if parsed.scheme != "https" or parsed.netloc != host or parsed.username or parsed.password:
        raise Error("Stripe returned an unexpected hosted page.")
    return value


class StripeSandboxClient:
    def __init__(self, settings, *, transport=None):
        self.settings, self.transport = settings, transport
        self.key = settings.stripe_sandbox_api_key.get_secret_value() if settings.stripe_sandbox_api_key else ""
        if not self.key.startswith(("rk_test_", "sk_test_")):
            raise Error("Configure a Stripe sandbox API key on the API server. Live keys are not accepted.", 503)

    def request(self, method, path, *, data=None, idempotency_key=None):
        try:
            with httpx.Client(base_url="https://api.stripe.com/v1/", auth=(self.key, ""), timeout=8,
                              follow_redirects=False, transport=self.transport) as client:
                response = client.request(method, path, data=data,
                    headers={"Idempotency-Key": idempotency_key} if idempotency_key else {})
                if response.status_code in (401, 403):
                    raise Error("Stripe rejected access. Check the sandbox key permissions in the setup guide.", 503)
                if response.status_code != 200:
                    raise Error("Stripe could not complete this operation. Retry the same action; no new checkout will be created for an unresolved attempt.", 503)
                result = response.json()
                if not isinstance(result, dict):
                    raise ValueError()
                # Portal sessions do not expose livemode; their configuration is
                # checked independently and only test-key requests are permitted.
                if result.get("livemode") is True or (path != "billing_portal/sessions" and result.get("livemode") is not False):
                    raise Error("Stripe did not return a sandbox object.")
                return result
        except Error:
            raise
        except (httpx.HTTPError, ValueError, TypeError):
            raise Error("Stripe is unavailable or returned an unexpected response. Retry the same action to resume safely.", 503) from None

    def mapping(self, configuration):
        return check_mapping(configuration, self.settings, transport=self.transport)


def lock_account(db, user_id):
    insert = pg_insert if db.bind.dialect.name == "postgresql" else sqlite_insert
    db.execute(insert(SandboxBillingAccount).values(user_id=user_id, lock_version=0).on_conflict_do_nothing())
    db.execute(update(SandboxBillingAccount).where(SandboxBillingAccount.user_id == user_id)
               .values(lock_version=SandboxBillingAccount.lock_version + 1))


def latest(db, user_id):
    return db.scalar(select(SandboxCheckout).where(SandboxCheckout.user_id == user_id)
        .order_by(SandboxCheckout.created_at.desc(), SandboxCheckout.id.desc()).limit(1)
        .execution_options(populate_existing=True))


def explorer(db):
    return db.scalar(select(SubscriptionPlanRevision).where(SubscriptionPlanRevision.code == "explorer")
        .order_by(SubscriptionPlanRevision.revision.desc()).limit(1))


def serialized(row):
    return {key: utc(value) if isinstance(value := getattr(row, key), datetime) else value for key in (
        "id", "plan_revision_id", "interval", "checkout_status", "subscription_status",
        "cancel_at_period_end", "price_matches", "period_end", "observed_at", "created_at")}


def overview(db, settings, user_id):
    plan = explorer(db)
    rows = list(db.scalars(select(SandboxCheckout).where(SandboxCheckout.user_id == user_id)
        .order_by(SandboxCheckout.created_at.desc(), SandboxCheckout.id.desc()).limit(20)))
    return {"enabled": settings.stripe_sandbox_checkout_enabled,
        "plan": {"revision": plan.revision, "configuration": plan.configuration} if plan else None,
        "attempts": [{**serialized(row), "revision": db.get(SubscriptionPlanRevision, row.plan_revision_id).revision} for row in rows],
        "portal_available": bool(rows and rows[0].customer_id and settings.stripe_sandbox_portal_configuration_id)}


def tagged(obj, row):
    metadata = obj.get("metadata") or {}
    if metadata.get("radar_attempt_id") != str(row.id) or metadata.get("radar_sandbox") != "1":
        raise Error("Stripe object does not match this sandbox checkout.")


def observe_subscription(db, client, row, subscription_id):
    subscription_id = identifier(subscription_id, "sub_")
    value = client.request("GET", f"subscriptions/{subscription_id}")
    tagged(value, row)
    if value.get("id") != subscription_id or value.get("object") != "subscription":
        raise Error("Stripe returned an unexpected subscription.")
    customer = identifier(value.get("customer"), "cus_")
    if (row.subscription_id and row.subscription_id != subscription_id) or (row.customer_id and row.customer_id != customer):
        raise Error("Stripe subscription ownership changed unexpectedly.")
    status = value.get("status")
    if status not in STATUSES:
        raise Error("Stripe returned an unknown subscription status.")
    items = (value.get("items") or {}).get("data") or []
    row.price_matches = (len(items) == 1 and (items[0].get("price") or {}).get("id") == row.price_id
                         and items[0].get("quantity") == 1)
    end = items[0].get("current_period_end", value.get("current_period_end")) if items else value.get("current_period_end")
    try:
        row.period_end = datetime.fromtimestamp(end, timezone.utc) if end is not None else None
    except (ValueError, TypeError, OverflowError, OSError):
        raise Error("Stripe returned an unexpected subscription period.") from None
    row.subscription_id, row.customer_id, row.subscription_status = subscription_id, customer, status
    row.cancel_at_period_end = value.get("cancel_at_period_end") is True
    row.observed_at = datetime.now(timezone.utc)


def observe_checkout(db, client, row, value):
    tagged(value, row)
    session_id = identifier(value.get("id"), "cs_test_")
    if (row.checkout_id and row.checkout_id != session_id) or value.get("mode") != "subscription" or value.get("client_reference_id") != str(row.id):
        raise Error("Stripe returned an unexpected checkout.")
    if value.get("status") not in {"open", "complete", "expired"}:
        raise Error("Stripe returned an unknown checkout status.")
    row.checkout_id, row.checkout_status = session_id, value["status"]
    if value.get("subscription"):
        observe_subscription(db, client, row, value["subscription"])
        if value.get("customer") != row.customer_id:
            raise Error("Stripe checkout customer does not match its subscription.")
    elif value["status"] == "complete":
        raise Error("The completed checkout has no subscription yet. Refresh shortly.", 503)
    row.observed_at = datetime.now(timezone.utc)


def sync_attempt(db, client, row):
    if row.checkout_id:
        value = client.request("GET", f"checkout/sessions/{identifier(row.checkout_id, 'cs_test_')}")
        observe_checkout(db, client, row, value)
        # A subscription event can arrive before checkout completion.
        if row.subscription_id and not value.get("subscription"):
            observe_subscription(db, client, row, row.subscription_id)
        return value
    if row.subscription_id:
        observe_subscription(db, client, row, row.subscription_id)
    return None


def enabled(settings):
    if not settings.stripe_sandbox_checkout_enabled:
        raise Error("Sandbox checkout is disabled on this server.", 503)
    if not settings.stripe_sandbox_webhook_secret or not settings.stripe_sandbox_webhook_secret.get_secret_value().startswith("whsec_"):
        raise Error("Configure the sandbox webhook signing secret before enabling checkout.", 503)


def start_checkout(db, settings, user_id, revision, interval, *, client=None):
    enabled(settings)
    client = client or StripeSandboxClient(settings)
    lock_account(db, user_id)
    row = latest(db, user_id)
    if row:
        value = sync_attempt(db, client, row)
        if row.subscription_id and row.subscription_status not in TERMINAL:
            db.commit()  # Preserve this verified observation even when creation is blocked.
            raise Error("You already have a sandbox subscription. Manage it in the billing portal before starting another.", 409)
        if row.checkout_status in {"creating", "open"}:
            saved_plan = db.get(SubscriptionPlanRevision, row.plan_revision_id)
            if saved_plan.revision != revision or row.interval != interval:
                db.commit()
                raise Error("An earlier checkout is pending. Resume its original plan revision and interval, or wait for its expiry and refresh.", 409)
            if value and row.checkout_status == "open":
                url = redirect_url(value.get("url"), "checkout.stripe.com")
                db.commit()
                return {"url": url}
            # The provider may prune idempotency keys after 24 hours. Never create
            # a second session when an old attempt's original result is unknown.
            if (datetime.now(timezone.utc) - utc(row.created_at)).total_seconds() > 23 * 3600:
                db.commit()
                raise Error("This unresolved checkout is too old to retry safely. An operator must reconcile it in Stripe before another checkout can start.", 409)
        else:
            row = None
    if row is None:
        plan = explorer(db)
        if not plan or plan.revision != revision:
            raise Error("The Explorer plan changed. Reload and review its latest revision.", 409)
        if plan.configuration["state"] == "archived":
            raise Error("Archived plans cannot be tested.", 422)
        # Trial/quota settings remain catalogue-only in this initial paid test.
        if plan.configuration.get("trial_days", 0):
            raise Error("This first checkout test requires an Explorer revision with no trial.", 422)
        report = client.mapping(plan.configuration)
        if not report["matches"]:
            raise Error("The saved Explorer revision no longer matches Stripe: " + "; ".join(report["issues"]), 422)
        price = plan.configuration["stripe_sandbox"].get("monthly_price_id" if interval == "monthly" else "annual_price_id")
        if not price:
            raise Error("This interval has no mapped price.", 422)
        attempt_id = uuid4()
        base = settings.frontend_base_url + "/admin/subscription-testing"
        params = {"mode": "subscription", "payment_method_types[0]": "card",
            "line_items[0][price]": price, "line_items[0][quantity]": "1",
            "client_reference_id": str(attempt_id), "metadata[radar_attempt_id]": str(attempt_id),
            "metadata[radar_sandbox]": "1", "subscription_data[metadata][radar_attempt_id]": str(attempt_id),
            "subscription_data[metadata][radar_sandbox]": "1", "automatic_tax[enabled]": "false",
            "success_url": base + "?stripe_return=checkout", "cancel_url": base + "?stripe_return=cancel",
            "expires_at": str(int(time.time()) + 3600)}
        row = SandboxCheckout(id=attempt_id, user_id=user_id, plan_revision_id=plan.id,
                              interval=interval, price_id=price, parameters=params)
        db.add(row)
        db.commit()  # Durable intent before external side effect.
        lock_account(db, user_id)
        db.refresh(row)
        if row.checkout_id:  # A concurrent retry/webhook already received it.
            value = sync_attempt(db, client, row)
            db.commit()
            if row.checkout_status != "open":
                raise Error("Checkout has finished. Refresh its saved status.", 409)
            return {"url": redirect_url(value.get("url"), "checkout.stripe.com")}
    value = client.request("POST", "checkout/sessions", data=row.parameters,
                           idempotency_key=f"radar-sandbox-checkout-{row.id}")
    observe_checkout(db, client, row, value)
    db.commit()
    if row.checkout_status != "open":
        raise Error("Checkout has finished. Refresh its saved status.", 409)
    return {"url": redirect_url(value.get("url"), "checkout.stripe.com")}


def refresh(db, settings, user_id, *, client=None):
    client = client or StripeSandboxClient(settings)
    lock_account(db, user_id)
    row = latest(db, user_id)
    if row:
        sync_attempt(db, client, row)
    db.commit()
    return overview(db, settings, user_id)


def portal(db, settings, user_id, *, client=None):
    enabled(settings)
    client = client or StripeSandboxClient(settings)
    config_id = settings.stripe_sandbox_portal_configuration_id
    if not config_id:
        raise Error("Configure a sandbox customer portal first. See the setup guide.", 503)
    config_id = identifier(config_id, "bpc_")
    lock_account(db, user_id)
    row = latest(db, user_id)
    if not row or not row.customer_id:
        raise Error("Complete a sandbox checkout before opening the portal.", 409)
    config = client.request("GET", f"billing_portal/configurations/{config_id}")
    features = config.get("features") or {}
    if (config.get("id") != config_id or config.get("active") is not True
        or (features.get("subscription_update") or {}).get("enabled") is not False
        or (features.get("subscription_cancel") or {}).get("enabled") is not True):
        raise Error("The sandbox portal must be active, allow cancellation, and disable subscription plan updates.", 422)
    value = client.request("POST", "billing_portal/sessions", data={"customer": row.customer_id,
        "configuration": config_id, "return_url": settings.frontend_base_url + "/admin/subscription-testing?stripe_return=portal"})
    if value.get("object") != "billing_portal.session" or value.get("customer") != row.customer_id:
        raise Error("Stripe returned an unexpected portal customer.")
    url = redirect_url(value.get("url"), "billing.stripe.com")
    db.commit()
    return {"url": url}


def verify_event(body, signature, settings, *, now=None):
    secret = settings.stripe_sandbox_webhook_secret
    if not secret or not secret.get_secret_value().startswith("whsec_"):
        raise Error("Sandbox webhook is not configured.", 503)
    try:
        parts = [item.split("=", 1) for item in signature.split(",")]
        timestamps = [value for key, value in parts if key == "t"]
        if len(timestamps) != 1 or abs((time.time() if now is None else now) - int(timestamps[0])) > 300:
            raise ValueError()
        digest = hmac.new(secret.get_secret_value().encode(), timestamps[0].encode() + b"." + body, hashlib.sha256).hexdigest()
        if not any(hmac.compare_digest(digest, value) for key, value in parts if key == "v1"):
            raise ValueError()
        event = json.loads(body)
        if (not isinstance(event, dict) or event.get("livemode") is not False
            or event.get("object") != "event" or not isinstance(event.get("type"), str)):
            raise ValueError()
        identifier(event.get("id"), "evt_")
        return event
    except (ValueError, TypeError, Error):
        raise Error("Invalid sandbox webhook signature or payload.", 400) from None


def handle_event(db, settings, event, *, client=None, commit=True):
    if event["type"] not in EVENTS:
        return {"received": True}
    obj = (event.get("data") or {}).get("object")
    if not isinstance(obj, dict):
        raise Error("Invalid sandbox event object.", 400)
    metadata = obj.get("metadata") or {}
    if metadata.get("radar_sandbox") != "1":
        return {"received": True}
    try:
        attempt_id = UUID(metadata.get("radar_attempt_id", ""))
    except (ValueError, TypeError, AttributeError):
        raise Error("Invalid sandbox attempt identifier.", 400) from None
    row = db.get(SandboxCheckout, attempt_id)
    if not row:
        return {"received": True}
    lock_account(db, row.user_id)
    db.refresh(row)
    if db.get(SandboxStripeEvent, event["id"]):
        if commit:
            db.commit()
        return {"received": True}
    client = client or StripeSandboxClient(settings)
    # Fetch canonical state while holding the account lock. Out-of-order event
    # snapshots can never regress status or the current billing period.
    if event["type"].startswith("customer.subscription."):
        observe_subscription(db, client, row, obj.get("id"))
    else:
        session_id = identifier(obj.get("id"), "cs_test_")
        value = client.request("GET", f"checkout/sessions/{session_id}")
        observe_checkout(db, client, row, value)
    db.add(SandboxStripeEvent(id=event["id"], checkout_id=row.id, event_type=event["type"]))
    if commit:
        db.commit()
    return {"received": True}
