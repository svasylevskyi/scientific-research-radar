"""Verify pending upgrades and their paid evidence chain from canonical observations.

May update local bindings and enqueue notices; caller owns the transaction.
Never creates an upgrade, collects payment, or commits.
"""

from datetime import datetime, timezone

from sqlalchemy import select

from app.models.billing_invoice import BillingInvoice
from app.models.subscription_plan import SubscriptionPlanRevision as Plan
from app.models.subscription_upgrade import SubscriptionUpgrade as Upgrade
from app.services import billing_invoice_service as invoices
from app.services import billing_provider as billing
from app.services.billing_notification_service import enqueue
from app.services.billing_payment_rules import snapshot


def now():
    return datetime.now(timezone.utc)


def notice(db, row, event, text):
    config = db.get(Plan, row.target_revision_id).configuration
    enqueue(
        db,
        row.user_id,
        f"upgrade:{row.id}:{event}",
        "Subscription upgrade " + event,
        f"{text}\nTarget: {config['name']} ({row.interval}).\nYour allowance reset date, used quota, and saved research are preserved.",
    )


def evidence(db, client, checkout, invoice_id, seen=None):
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
        evidence(db, client, checkout, earlier.source_invoice_id, seen)
    invoices.observe(db, checkout, invoices.retrieve(client, invoice_id))


def observe(db, client, checkout, value):
    """Read canonical subscription and invoice evidence; no writes to Stripe or commits."""
    row = db.scalar(
        select(Upgrade)
        .where(Upgrade.checkout_id == checkout.id, Upgrade.submitted_at.is_not(None))
        .order_by(Upgrade.created_at.desc(), Upgrade.id.desc())
        .limit(1)
    )
    if not row:
        return
    if row.invoice_id:
        # Even old upgrade credit/settlement evidence can change; verify before using it.
        evidence(db, client, checkout, row.invoice_id)
    if row.state in {"applied", "expired"}:
        return
    items = (value.get("items") or {}).get("data") or []
    if (
        len(items) != 1
        or items[0].get("id") != row.item_id
        or items[0].get("quantity") != 1
    ):
        row.state, row.last_error = (
            "needs_review",
            "The subscription item changed unexpectedly.",
        )
        return
    price = invoices.ref(items[0].get("price"))
    latest_id = invoices.ref(value.get("latest_invoice"))
    if not row.invoice_id and latest_id and latest_id != row.source_invoice_id:
        raw = invoices.retrieve(client, latest_id)
        try:
            if snapshot(raw, checkout, row) != row.quote or invoices.stamp(
                raw.get("created"), optional=False
            ) < billing.utc(row.proration_at):
                raise billing.Error(
                    "The invoice does not match the saved upgrade request.", 409
                )
        except billing.Error as exc:
            row.state, row.last_error = "needs_review", str(exc)
            return
        collision = db.scalar(select(Upgrade.id).where(Upgrade.invoice_id == latest_id))
        if collision and collision != row.id:
            row.state, row.last_error = (
                "needs_review",
                "The invoice is already attached to another upgrade.",
            )
            return
        row.invoice_id = latest_id
        db.flush()
        evidence(db, client, checkout, latest_id)
    if not row.invoice_id:
        return  # An unresolved POST can only retry its original idempotency key.
    invoice = db.get(BillingInvoice, row.invoice_id)
    pending = value.get("pending_update")
    if invoice.issue:
        row.state, row.last_error = "needs_review", invoice.issue
        return
    if (
        invoice.status == "paid"
        and not pending
        and price == row.target_price_id
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
            invoice_id=row.source_invoice_id,
        )
        if (
            start != billing.utc(row.period_start)
            or end != billing.utc(row.period_end)
            or not base["covered"]
            or base["issue"]
        ):
            row.state, row.last_error = (
                "needs_review",
                "The original paid coverage or unchanged billing period could not be verified.",
            )
            return
        checkout.plan_revision_id, checkout.price_id = (
            row.target_revision_id,
            row.target_price_id,
        )
        row.state, row.applied_at, row.last_error = "applied", now(), None
        notice(
            db,
            row,
            "completed",
            "The prorated upgrade payment was verified. Your upgraded benefits are now active. Paused schedules still require explicit review and resumption.",
        )
    elif invoice.status == "void" and not pending and price == row.source_price_id:
        row.state, row.last_error = "expired", None
        notice(
            db,
            row,
            "expired",
            "The pending upgrade expired or its invoice was voided. Your previous plan continues under its existing payment terms.",
        )
    elif invoice.status == "open" and pending and price == row.source_price_id:
        pending_items = pending.get("subscription_items") or []
        if (
            len(pending_items) != 1
            or pending_items[0].get("id") != row.item_id
            or invoices.ref(pending_items[0].get("price")) != row.target_price_id
        ):
            row.state, row.last_error = (
                "needs_review",
                "Stripe has a different pending subscription update.",
            )
            return
        row.pending_until = invoices.stamp(pending.get("expires_at"), optional=False)
        row.state, row.last_error = "pending_payment", None
        notice(
            db,
            row,
            "payment pending",
            "Complete payment or authentication on the secure invoice page. Until payment is verified, your previous paid plan remains in effect; no upgrade allowance is granted.",
        )
    else:
        row.state, row.last_error = (
            "needs_review",
            "The upgrade payment and subscription state do not agree. Refresh or ask an operator to review billing.",
        )
    db.flush()
