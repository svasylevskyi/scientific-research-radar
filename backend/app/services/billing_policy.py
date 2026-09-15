"""Shared eligibility and pending-intent queries, independent of billing commands."""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.stripe_sandbox import SandboxCheckout
from app.models.subscription_access import SubscriptionAccessPolicy as Policy
from app.models.subscription_change import SubscriptionChange as Change
from app.models.subscription_plan import SubscriptionPlanRevision
from app.models.subscription_upgrade import SubscriptionUpgrade as Upgrade
from app.services import billing_provider as billing
from app.services.billing_payment_rules import ref
from app.services.billing_types import ProviderObject

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


def available(plan: SubscriptionPlanRevision) -> bool:
    configuration = plan.configuration
    return (
        configuration.get("subscriber_visible") is True
        and configuration["state"] == "reviewed"
        and configuration["tax_display"] == "inclusive"
        and (
            configuration.get("billing_type") == "free"
            or bool(configuration.get("stripe_sandbox"))
        )
        and not configuration.get("trial_days", 0)
    )


def opted_in(db: Session, *, user_id: UUID) -> bool:
    return (
        db.scalar(
            select(Policy.mode)
            .where(Policy.user_id == user_id)
            .order_by(Policy.version.desc())
            .limit(1)
        )
        == "sandbox"
    )


def require_opt_in(db: Session, *, user_id: UUID) -> None:
    if not opted_in(db, user_id=user_id):
        raise billing.Error(
            "Subscriber checkout is available to accounts enrolled in subscription limits. Contact the administrator to join.",
            403,
        )


def blocking_change(db: Session, *, user_id: UUID) -> Change | None:
    return db.scalar(
        select(Change)
        .where(Change.user_id == user_id, Change.state.not_in(TERMINAL))
        .limit(1)
    )


def subscription(
    *, client: billing.StripeSandboxClient, checkout: SandboxCheckout
) -> ProviderObject:
    value = client.request(
        "GET", "subscriptions/" + billing.identifier(checkout.subscription_id, "sub_")
    )
    billing.tagged(value, checkout)
    if (
        value.get("id") != checkout.subscription_id
        or value.get("object") != "subscription"
        or ref(value.get("customer")) != checkout.customer_id
        or value.get("livemode") is not checkout.livemode
    ):
        raise billing.Error("Subscription ownership could not be verified.", 409)
    return value


def simple_subscription(*, value: ProviderObject) -> None:
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


def blocking_upgrade(db: Session, *, user_id: UUID) -> Upgrade | None:
    return db.scalar(
        select(Upgrade)
        .where(Upgrade.user_id == user_id, Upgrade.state.in_(OPEN))
        .limit(1)
    )


class AccessDenied(ValueError):
    def __init__(self, message: str, status: int = 403) -> None:
        super().__init__(message)
        self.status = status
