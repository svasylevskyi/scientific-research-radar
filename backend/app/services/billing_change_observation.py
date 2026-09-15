"""Interpret saved renewal changes from canonical provider observations.

May update local bindings and enqueue notices; caller owns the transaction.
Never submits, retries, or undoes a Stripe change.
"""

from datetime import datetime, timezone

from sqlalchemy import select

from app.models.subscription_access import SubscriptionAccountState
from app.models.subscription_change import SubscriptionChange as Change
from app.models.subscription_plan import SubscriptionPlanRevision as Plan
from app.services import billing_provider as billing
from app.services.billing_invoice_service import assessment, ref, stamp
from app.services.billing_notification_service import enqueue
from app.services.billing_policy import CHANGE_TERMINAL as TERMINAL


def now():
    return datetime.now(timezone.utc)


def notice(db, change, event, message):
    target = db.get(Plan, change.target_revision_id).configuration
    enqueue(
        db,
        change.user_id,
        f"change:{change.id}:{event}",
        "Subscription change " + event,
        f"{message}\nPlan: {target['name']} ({change.target_interval}).\nScheduled renewal: {billing.utc(change.effective_at).isoformat()}.\nYour saved research and monthly allowance clock are preserved.",
    )


def verified_schedule(client, checkout, change):
    value = client.request(
        "GET",
        "subscription_schedules/"
        + billing.identifier(change.schedule_id, "sub_sched_"),
    )
    if (
        value.get("id") != change.schedule_id
        or value.get("object") != "subscription_schedule"
        or value.get("livemode") is not False
        or ref(value.get("customer")) != checkout.customer_id
        or ref(value.get("subscription") or value.get("released_subscription"))
        != checkout.subscription_id
    ):
        raise billing.Error("Scheduled change ownership could not be verified.", 409)
    return value


def has_target(value, change):
    phases = value.get("phases") or []
    if (
        value.get("end_behavior") != "release"
        or (value.get("metadata") or {}).get("radar_change_id") != str(change.id)
        or len(phases) != 2
    ):
        return False
    first, target = phases
    boundary = int(billing.utc(change.effective_at).timestamp())
    return (
        first.get("end_date") == boundary
        and len(first.get("items") or []) == 1
        and ref(first["items"][0].get("price")) == change.source_price_id
        and first["items"][0].get("quantity") == 1
        and target.get("start_date") == boundary
        and len(target.get("items") or []) == 1
        and ref(target["items"][0].get("price")) == change.target_price_id
        and target["items"][0].get("quantity") == 1
        and target.get("proration_behavior") == "none"
        and target.get("billing_cycle_anchor") == "phase_start"
    )


def observe(db, client, checkout, value):
    """Called before matching price and reconciling invoices; never commits."""
    change = db.scalar(
        select(Change)
        .where(Change.checkout_id == checkout.id, Change.state.not_in(TERMINAL))
        .order_by(Change.created_at.desc())
        .limit(1)
    )
    if not change or not change.schedule_id:
        return
    if value.get("status") in billing.TERMINAL:
        change.state = "stopped"
        notice(
            db,
            change,
            "stopped",
            "The subscription ended before this change completed. Review your Free access and billing status.",
        )
        return
    items = (value.get("items") or {}).get("data") or []
    if len(items) != 1 or items[0].get("quantity") != 1:
        return
    price = ref(items[0].get("price"))
    start = stamp(
        items[0].get("current_period_start", value.get("current_period_start"))
    )
    if (
        price == change.target_price_id
        and start
        and start >= billing.utc(change.effective_at)
    ):
        schedule = verified_schedule(client, checkout, change)
        if not has_target(schedule, change):
            return
        if schedule.get("status") == "released" and (
            schedule.get("released_at") or 0
        ) < int(billing.utc(change.effective_at).timestamp()):
            return  # An undone schedule cannot authorize a later unrelated price edit.
        checkout.plan_revision_id, checkout.price_id, checkout.interval = (
            change.target_revision_id,
            change.target_price_id,
            change.target_interval,
        )
        if change.applied_at is None:
            change.applied_at = billing.utc(change.effective_at)
            change.state = "awaiting_payment"
            state = db.get(SubscriptionAccountState, checkout.user_id)
            if state:
                state.paid_digest_ids = change.digest_ids
        db.flush()
    elif value.get("status") in billing.TERMINAL:
        change.state = "stopped"
        notice(
            db,
            change,
            "stopped",
            "The subscription ended before this change completed. Review your Free access and billing status.",
        )
    elif (
        change.state in {"scheduled", "preparing", "needs_review"}
        and price == change.source_price_id
    ):
        schedule = verified_schedule(client, checkout, change)
        if schedule.get("status") in {"released", "canceled"}:
            change.state = "stopped"
            notice(
                db,
                change,
                "stopped",
                "The schedule was removed in Stripe. Review the current subscription before choosing another change.",
            )


def paid(db, checkout, settings):
    change = db.scalar(
        select(Change).where(
            Change.checkout_id == checkout.id, Change.state == "awaiting_payment"
        )
    )
    if (
        change
        and checkout.price_matches
        and checkout.subscription_status == "active"
        and assessment(db, checkout, now(), settings.subscription_grace_days)["covered"]
    ):
        change.state, change.next_attempt_at = "finalizing", now()
        notice(
            db,
            change,
            "completed",
            "Payment was verified and your subscription change is now in effect.",
        )
