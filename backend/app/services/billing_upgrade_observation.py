"""Verify pending upgrades and their paid evidence chain from canonical observations.

May update local bindings and enqueue notices; caller owns the transaction.
Never creates an upgrade, collects payment, or commits.
"""

from datetime import datetime, timezone
from typing import cast

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.models.billing_invoice import BillingInvoice
from app.models.stripe_sandbox import SandboxCheckout
from app.models.subscription_plan import SubscriptionPlanRevision as Plan
from app.models.subscription_upgrade import SubscriptionUpgrade as Upgrade
from app.services import billing_invoice_service as invoices
from app.services import billing_provider as billing
from app.services.billing_notification_service import enqueue
from app.services.billing_payment_rules import snapshot
from app.services.billing_types import ProviderObject


def now() -> datetime:
    return datetime.now(timezone.utc)


def notice(db: Session, *, upgrade: Upgrade, event: str, text: str) -> None:
    # Target revisions are retained by the intent foreign key.
    config = cast(Plan, db.get(Plan, upgrade.target_revision_id)).configuration
    enqueue(
        db,
        upgrade.user_id,
        f"upgrade:{upgrade.id}:{event}",
        "Subscription upgrade " + event,
        f"{text}\nTarget: {config['name']} ({upgrade.interval}).\nYour allowance reset date, used quota, and saved research are preserved.",
    )


def evidence(
    db: Session,
    *,
    client: billing.StripeSandboxClient,
    checkout: SandboxCheckout,
    invoice_id: str,
    seen: set[str] | None = None,
) -> None:
    """Refresh the entire bounded paid-coverage chain, oldest invoice first."""
    seen = set() if seen is None else seen
    if invoice_id in seen or len(seen) >= 16:
        raise billing.Error("Upgrade coverage chain needs operator review.", 409)
    seen.add(invoice_id)
    earlier = db.scalar(
        select(Upgrade).where(
            Upgrade.invoice_id == invoice_id, Upgrade.checkout_id == checkout.id
        )
    )
    if earlier:
        evidence(
            db,
            client=client,
            checkout=checkout,
            invoice_id=earlier.source_invoice_id,
            seen=seen,
        )
    invoices.observe(db, checkout, invoices.retrieve(client, invoice_id))


def observe(
    db: Session,
    *,
    client: billing.StripeSandboxClient,
    checkout: SandboxCheckout,
    value: ProviderObject,
) -> None:
    """Read canonical subscription and invoice evidence; no writes to Stripe or commits."""
    upgrade = db.scalar(
        select(Upgrade)
        .where(Upgrade.checkout_id == checkout.id, Upgrade.submitted_at.is_not(None))
        .order_by(Upgrade.created_at.desc(), Upgrade.id.desc())
        .limit(1)
    )
    if not upgrade:
        return
    if upgrade.invoice_id:
        # Even old upgrade credit/settlement evidence can change; verify before using it.
        evidence(db, client=client, checkout=checkout, invoice_id=upgrade.invoice_id)
    if upgrade.state in {"applied", "expired"}:
        return
    items = (value.get("items") or {}).get("data") or []
    if (
        len(items) != 1
        or items[0].get("id") != upgrade.item_id
        or items[0].get("quantity") != 1
    ):
        upgrade.state, upgrade.last_error = (
            "needs_review",
            "The subscription item changed unexpectedly.",
        )
        return
    price = invoices.ref(items[0].get("price"))
    latest_id = invoices.ref(value.get("latest_invoice"))
    if not upgrade.invoice_id and latest_id and latest_id != upgrade.source_invoice_id:
        raw = invoices.retrieve(client, latest_id)
        try:
            if snapshot(
                invoice=raw, checkout=checkout, upgrade=upgrade
            ) != upgrade.quote or invoices.stamp(
                raw.get("created"), optional=False
            ) < billing.utc(upgrade.proration_at):
                raise billing.Error(
                    "The invoice does not match the saved upgrade request.", 409
                )
        except billing.Error as exc:
            upgrade.state, upgrade.last_error = "needs_review", str(exc)
            return
        collision = db.scalar(select(Upgrade.id).where(Upgrade.invoice_id == latest_id))
        if collision and collision != upgrade.id:
            upgrade.state, upgrade.last_error = (
                "needs_review",
                "The invoice is already attached to another upgrade.",
            )
            return
        upgrade.invoice_id = latest_id
        db.flush()
        evidence(db, client=client, checkout=checkout, invoice_id=latest_id)
    if not upgrade.invoice_id:
        return  # An unresolved POST can only retry its original idempotency key.
    # evidence() above retrieves and persists the referenced invoice before use.
    invoice = cast(BillingInvoice, db.get(BillingInvoice, upgrade.invoice_id))
    pending = value.get("pending_update")
    if invoice.issue:
        upgrade.state, upgrade.last_error = "needs_review", invoice.issue
        return
    if (
        invoice.status == "paid"
        and not pending
        and price == upgrade.target_price_id
        and value.get("status") == "active"
    ):
        start = invoices.stamp(
            items[0].get("current_period_start", value.get("current_period_start"))
        )
        end = invoices.stamp(
            items[0].get("current_period_end", value.get("current_period_end"))
        )
        base = invoices.assessment(
            db,
            checkout,
            now(),
            client.settings.subscription_grace_days,
            invoice_id=upgrade.source_invoice_id,
        )
        if (
            start != billing.utc(upgrade.period_start)
            or end != billing.utc(upgrade.period_end)
            or not base["covered"]
            or base["issue"]
        ):
            upgrade.state, upgrade.last_error = (
                "needs_review",
                "The original paid coverage or unchanged billing period could not be verified.",
            )
            return
        checkout.plan_revision_id, checkout.price_id = (
            upgrade.target_revision_id,
            upgrade.target_price_id,
        )
        upgrade.state, upgrade.applied_at, upgrade.last_error = "applied", now(), None
        notice(
            db,
            upgrade=upgrade,
            event="completed",
            text="The prorated upgrade payment was verified. Your upgraded benefits are now active. Paused schedules still require explicit review and resumption.",
        )
    elif invoice.status == "void" and not pending and price == upgrade.source_price_id:
        upgrade.state, upgrade.last_error = "expired", None
        notice(
            db,
            upgrade=upgrade,
            event="expired",
            text="The pending upgrade expired or its invoice was voided. Your previous plan continues under its existing payment terms.",
        )
    elif invoice.status == "open" and pending and price == upgrade.source_price_id:
        pending_items = pending.get("subscription_items") or []
        if (
            len(pending_items) != 1
            or pending_items[0].get("id") != upgrade.item_id
            or invoices.ref(pending_items[0].get("price")) != upgrade.target_price_id
        ):
            upgrade.state, upgrade.last_error = (
                "needs_review",
                "Stripe has a different pending subscription update.",
            )
            return
        upgrade.pending_until = invoices.stamp(
            pending.get("expires_at"), optional=False
        )
        upgrade.state, upgrade.last_error = "pending_payment", None
        notice(
            db,
            upgrade=upgrade,
            event="payment pending",
            text="Complete payment or authentication on the secure invoice page. Until payment is verified, your previous paid plan remains in effect; no upgrade allowance is granted.",
        )
    else:
        upgrade.state, upgrade.last_error = (
            "needs_review",
            "The upgrade payment and subscription state do not agree. Refresh or ask an operator to review billing.",
        )
    db.flush()
