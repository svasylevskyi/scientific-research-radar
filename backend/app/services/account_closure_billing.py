"""Verify and stop known Radar billing without creating charges or refunds.

Never replay checkout/upgrade creation during closure. Unknown submissions and
unsettled invoices need operator resolution. Each retry reads Stripe again.
"""
from urllib.parse import urlencode
from datetime import datetime, timezone

from app.models.stripe_sandbox import SandboxCheckout
from app.services.billing_provider import TERMINAL, StripeSandboxClient, identifier, tagged
from app.services.stripe_catalogue_service import StripeCatalogueError


def object_ref(value):
    return value.get("id") if isinstance(value, dict) else value


def listed(client: StripeSandboxClient, path: str, **parameters):
    """Bound each tick; never interpret a truncated list as a complete inventory."""
    cursor = None
    for _ in range(20):
        query = {**parameters, "limit": 100}
        if cursor:
            query["starting_after"] = cursor
        result = client.request("GET", path + "?" + urlencode(query))
        items = result.get("data")
        if result.get("object") != "list" or not isinstance(items, list):
            raise StripeCatalogueError("Stripe returned an invalid billing inventory.")
        for item in items:
            if not isinstance(item, dict) or item.get("livemode") is not client.settings.stripe_livemode:
                raise StripeCatalogueError("Stripe billing inventory has an unexpected mode.")
            yield item
        if result.get("has_more") is False:
            return
        if not items or not isinstance(items[-1].get("id"), str) or items[-1]["id"] == cursor:
            raise StripeCatalogueError("Stripe billing inventory pagination is incomplete.")
        cursor = items[-1]["id"]
    raise StripeCatalogueError("Billing history exceeds automatic closure limits. Contact support.")


def verify_checkout(value: dict, row: SandboxCheckout) -> None:
    tagged(value, row)
    if (value.get("object") != "checkout.session" or value.get("mode") != "subscription"
            or value.get("client_reference_id") != str(row.id)
            or (row.checkout_id and value.get("id") != row.checkout_id)):
        raise StripeCatalogueError("Stripe checkout does not match this account.")


def close_attempt(client: StripeSandboxClient, row: SandboxCheckout) -> list[dict]:
    if row.livemode != client.settings.stripe_livemode:
        raise StripeCatalogueError("Saved checkout belongs to a different Stripe mode.")
    issues = []
    if row.checkout_id:
        path = "checkout/sessions/" + identifier(row.checkout_id, "cs_live_" if row.livemode else "cs_test_")
        value = client.request("GET", path)
        verify_checkout(value, row)
        if value.get("status") == "open":
            client.request("POST", path + "/expire", idempotency_key=f"radar-close-{row.id}-expire")
            value = client.request("GET", path)
            verify_checkout(value, row)
        if value.get("status") not in {"expired", "complete"}:
            raise StripeCatalogueError("Stripe has not confirmed checkout expiry.")
        row.checkout_status = value["status"]
        linked = object_ref(value.get("subscription"))
        if linked:
            if row.subscription_id and row.subscription_id != linked:
                raise StripeCatalogueError("Checkout subscription changed unexpectedly.")
            row.subscription_id = identifier(linked, "sub_")
        if value["status"] == "complete" and not linked:
            raise StripeCatalogueError("A completed checkout is still awaiting its subscription.")
    elif not row.subscription_id:
        # The original request may have reached Stripe. Do not replay it, even
        # within the idempotency window: closure must not create a hosted checkout.
        expires_at = row.parameters.get("expires_at")
        if expires_at and int(expires_at) < int(datetime.now(timezone.utc).timestamp()) - 60:
            matches = [value for value in listed(client, "checkout/sessions",
                **{"created[gte]": int(row.created_at.timestamp()) - 60, "created[lte]": int(expires_at)})
                if (value.get("metadata") or {}).get("radar_attempt_id") == str(row.id)]
            if len(matches) == 1:
                verify_checkout(matches[0], row)
                row.checkout_id = identifier(matches[0].get("id"), "cs_live_" if row.livemode else "cs_test_")
                return close_attempt(client, row)
            if not matches:
                row.checkout_status = "expired"
                return []
        return [{"kind": "unknown_checkout", "reference": str(row.id), "attempt_id": str(row.id)}]

    if not row.subscription_id:
        return issues
    path = "subscriptions/" + identifier(row.subscription_id, "sub_")
    subscription = client.request("GET", path)
    tagged(subscription, row)
    if subscription.get("id") != row.subscription_id or subscription.get("object") != "subscription":
        raise StripeCatalogueError("Stripe subscription does not match this account.")
    customer = identifier(object_ref(subscription.get("customer")), "cus_")
    if row.customer_id and row.customer_id != customer:
        raise StripeCatalogueError("Stripe customer changed unexpectedly.")
    row.customer_id = customer
    schedule_id = object_ref(subscription.get("schedule"))
    if schedule_id:
        schedule_path = "subscription_schedules/" + identifier(schedule_id, "sub_sched_")
        schedule = client.request("GET", schedule_path)
        if (schedule.get("id") != schedule_id or object_ref(schedule.get("customer")) != customer
                or (schedule.get("status") in {"active", "not_started"} and object_ref(schedule.get("subscription")) != row.subscription_id)):
            raise StripeCatalogueError("Stripe schedule ownership could not be verified.")
        if schedule.get("status") in {"active", "not_started"}:
            client.request("POST", schedule_path + "/cancel", data={"invoice_now": "false", "prorate": "false"},
                           idempotency_key=f"radar-close-{row.id}-{schedule_id}")
        subscription = client.request("GET", path)
        tagged(subscription, row)
    if subscription.get("status") not in TERMINAL:
        # DELETE cancellation is read-before-write and verified after writing;
        # it does not depend on POST idempotency-key retention.
        client.request("DELETE", path, data={"invoice_now": "false", "prorate": "false"})
        subscription = client.request("GET", path)
        tagged(subscription, row)
    if subscription.get("status") not in TERMINAL:
        raise StripeCatalogueError("Stripe has not confirmed final subscription cancellation.")
    if subscription.get("schedule"):
        schedule = client.request("GET", "subscription_schedules/" + identifier(object_ref(subscription["schedule"]), "sub_sched_"))
        if schedule.get("status") not in {"canceled", "completed", "released"}:
            raise StripeCatalogueError("Stripe has not confirmed schedule cancellation.")
    row.subscription_status = subscription["status"]
    row.cancel_at_period_end = False

    for invoice in listed(client, "invoices", subscription=row.subscription_id):
        if object_ref(invoice.get("customer")) != customer:
            raise StripeCatalogueError("Stripe returned an invoice for a different customer.")
        if invoice.get("status") in {"open", "draft"}:
            invoice_id = identifier(invoice.get("id"), "in_")
            if invoice.get("auto_advance") is not False:
                client.request("POST", "invoices/" + invoice_id, data={"auto_advance": "false"},
                               idempotency_key=f"radar-close-{row.id}-{invoice_id}-pause")
            # Do not void debts, refund payments, or claim an in-flight payment
            # was stopped merely because automatic invoice collection is paused.
            issues.append({"kind": "invoice", "reference": invoice_id})
    for item in listed(client, "invoiceitems", customer=customer, pending="true"):
        issues.append({"kind": "pending_invoice_item", "reference": identifier(item.get("id"), "ii_")})
    return issues
