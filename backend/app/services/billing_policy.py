"""Shared eligibility and pending-intent queries, independent of billing commands."""

from sqlalchemy import select

from app.models.subscription_access import SubscriptionAccessPolicy as Policy
from app.models.subscription_change import SubscriptionChange as Change
from app.models.subscription_upgrade import SubscriptionUpgrade as Upgrade
from app.services import billing_provider as billing
from app.services.billing_payment_rules import ref

CHANGE_TERMINAL = {"applied", "undone", "stopped"}
UPGRADE_OPEN = {"submitting", "pending_payment", "needs_review"}
TERMINAL = CHANGE_TERMINAL
OPEN = UPGRADE_OPEN
LIMITS = (
    "max_digests",
    "max_papers_per_run",
    "papers_per_month",
    "runs_per_month",
    "manual_runs_per_month",
)


def available(plan):
    c = plan.configuration
    return (
        c.get("subscriber_visible") is True
        and c["state"] == "reviewed"
        and c["tax_display"] == "inclusive"
        and (c.get("billing_type") == "free" or bool(c.get("stripe_sandbox")))
        and not c.get("trial_days", 0)
    )


def opted_in(db, uid):
    return (
        db.scalar(
            select(Policy.mode)
            .where(Policy.user_id == uid)
            .order_by(Policy.version.desc())
            .limit(1)
        )
        == "sandbox"
    )


def require_opt_in(db, uid):
    if not opted_in(db, uid):
        raise billing.Error(
            "Subscriber checkout is available to accounts enrolled in sandbox testing. Contact the administrator to join.",
            403,
        )


def blocking_change(db, uid):
    return db.scalar(
        select(Change)
        .where(Change.user_id == uid, Change.state.not_in(TERMINAL))
        .limit(1)
    )


def subscription(client, checkout):
    value = client.request(
        "GET", "subscriptions/" + billing.identifier(checkout.subscription_id, "sub_")
    )
    billing.tagged(value, checkout)
    if (
        value.get("id") != checkout.subscription_id
        or value.get("object") != "subscription"
        or ref(value.get("customer")) != checkout.customer_id
        or value.get("livemode") is not False
    ):
        raise billing.Error("Subscription ownership could not be verified.", 409)
    return value


def simple_subscription(value):
    items = (value.get("items") or {}).get("data") or []
    if (
        len(items) != 1
        or (value.get("items") or {}).get("has_more") is True
        or items[0].get("quantity") != 1
        or value.get("collection_method") != "charge_automatically"
        or value.get("pending_update")
        or value.get("pause_collection")
        or value.get("discounts")
        or value.get("discount")
        or value.get("default_tax_rates")
        or (value.get("automatic_tax") or {}).get("enabled")
        or items[0].get("discounts")
        or items[0].get("tax_rates")
        or value.get("trial_end")
        or value.get("cancel_at")
        or value.get("pending_invoice_item_interval")
    ):
        raise billing.Error(
            "This subscription has billing customizations that require operator review before a scheduled change.",
            409,
        )


def blocking_upgrade(db, uid):
    return db.scalar(
        select(Upgrade).where(Upgrade.user_id == uid, Upgrade.state.in_(OPEN)).limit(1)
    )


class AccessDenied(ValueError):
    def __init__(self, message, status=403):
        super().__init__(message)
        self.status = status
