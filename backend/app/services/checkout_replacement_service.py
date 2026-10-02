"""Replace an owner-selected initial Checkout, never a subscription or invoice.

The old attempt carries a durable, reviewed replacement intent. Its provider
parameters are immutable. The successor and its predecessor linkage are committed
atomically by start_checkout; until then all ordinary creation is fenced off.
"""
from datetime import datetime, timezone
from uuid import uuid4

from app.models.stripe_sandbox import SandboxCheckout
from app.models.subscription_plan import SubscriptionPlanRevision as Plan
from app.services import stripe_sandbox_service as billing
from app.services.billing_policy import blocking_change, blocking_upgrade, require_opt_in
from app.services.stripe_environment import ensure_database_mode


def pending_summary(db, row):
    if not billing.replacement_pending(row):
        return None
    intent = row.replacement_intent
    plan = db.get(Plan, intent['plan_id'])
    c = plan.configuration
    return dict(id=intent['id'], source_attempt_id=row.id, code=plan.code, revision=plan.revision,
        plan_name=c['name'], interval=intent['interval'],
        price=c['monthly_price' if intent['interval'] == 'monthly' else 'annual_price'],
        currency=c['currency'])


def _stop(db, row, message):
    row.replacement_intent = {**row.replacement_intent, 'state': 'blocked'}
    db.commit()  # Retain canonical observations, including a purchase that won the race.
    raise billing.Error(message, 409)


def _canonical(db, client, row):
    value = billing.sync_attempt(db, client, row)
    if value is None and not row.subscription_id:
        # Recover the exact original response, not a new original purchase.
        if (datetime.now(timezone.utc) - billing.utc(row.created_at)).total_seconds() > 23 * 3600:
            raise billing.Error('The original checkout result is too old to recover safely. Ask support to reconcile it.', 409)
        value = client.request('POST', 'checkout/sessions', data=row.parameters,
            idempotency_key=f'radar-sandbox-checkout-{row.id}')
        billing.observe_checkout(db, client, row, value)
        # An idempotent create response may be an older snapshot: always retrieve.
        value = billing.sync_attempt(db, client, row)
    if row.subscription_id or not value or value.get('status') == 'complete':
        _stop(db, row, 'The original checkout has progressed to a subscription or payment. Refresh billing; it was not replaced.')
    if (value.get('object') != 'checkout.session' or value.get('status') not in {'open', 'expired'}
        or value.get('payment_status') != 'unpaid'):
        _stop(db, row, 'This checkout is not verified as an unpaid open or expired session. Refresh billing before choosing again.')
    if ((value.get('after_expiration') or {}).get('recovery') or {}).get('enabled'):
        _stop(db, row, 'This checkout has recovery enabled and cannot be replaced safely. Ask support to review it.')
    db.flush()  # The handoff re-reads the row under the account lock.
    return value


def replace(db, settings, uid, expected_attempt_id, code, revision, interval, *, client=None):
    ensure_database_mode(db, settings)
    billing.enabled(settings)
    client = client or billing.StripeSandboxClient(settings)
    billing.lock_account(db, uid)
    require_opt_in(db, user_id=uid)
    if blocking_change(db, user_id=uid) or blocking_upgrade(db, user_id=uid):
        raise billing.Error('Resolve the pending subscription change before replacing a checkout.', 409)
    source = db.get(SandboxCheckout, expected_attempt_id, populate_existing=True)
    if not source or source.user_id != uid:
        raise billing.Error('The selected checkout was not found for this account.', 404)
    if source.livemode != settings.stripe_livemode:
        raise billing.Error('Saved checkout belongs to a different Stripe mode.', 409)
    current = billing.latest(db, uid)
    saved = source.replacement_intent or {}
    target = (code, revision, interval)
    saved_target = (saved.get('code'), saved.get('revision'), saved.get('interval'))
    if current is None or current.id != source.id:
        # Exact retry resumes this request's successor only, never a newer unrelated one.
        if (saved.get('state') == 'replaced' and saved_target == target
            and str(current.id if current else '') == saved.get('successor_id')):
            return billing.start_checkout(db, settings, uid, revision, interval, code=code,
                subscriber=True, client=client, expected_attempt_id=current.id)
        raise billing.Error('Checkout changed in another window. Refresh and review the latest selection.', 409)
    if billing.replacement_pending(source):
        if saved_target != target:
            raise billing.Error('Another checkout replacement is being verified. Resume it before choosing again.', 409)
    else:
        # Validate all target terms before replaying or expiring any provider session.
        plan, _ = billing.checkout_plan(db, client, code, revision, interval, subscriber=True)
        original = db.get(Plan, source.plan_revision_id)
        if (original.code, original.revision, source.interval) == target:
            return billing.start_checkout(db, settings, uid, revision, interval, code=code,
                subscriber=True, client=client, expected_attempt_id=source.id)
        if source.subscription_id or source.checkout_status not in {'creating', 'open', 'expired'}:
            raise billing.Error('Only unfinished initial checkouts can be replaced. Review billing.', 409)
        source.replacement_intent = dict(id=str(uuid4()), state='pending', code=code, revision=revision,
            interval=interval, plan_id=plan.id, requested_at=datetime.now(timezone.utc).isoformat())
        db.commit()  # User consent and exact target survive an ambiguous expiration.
        billing.lock_account(db, uid)
        db.refresh(source)
        current = billing.latest(db, uid)
        if not current or current.id != source.id:
            # A concurrent exact retry can have completed the same handoff.
            return replace(db, settings, uid, expected_attempt_id, code, revision, interval, client=client)
        if not billing.replacement_pending(source):
            raise billing.Error('The replacement status changed. Refresh billing before retrying.', 409)
    intent_id = source.replacement_intent['id']
    try:
        value = _canonical(db, client, source)
        if value['status'] == 'open':
            try:
                client.request('POST', f"checkout/sessions/{billing.identifier(source.checkout_id, 'cs_live_' if source.livemode else 'cs_test_')}/expire",
                    data={}, idempotency_key=f'radar-checkout-expire-{source.id}')
            except billing.Error:
                # Timeout, already expired, or completion race: reconcile, never assume.
                value = _canonical(db, client, source)
                if value['status'] != 'expired':
                    raise billing.Error('Checkout expiration is not confirmed. Resume the saved replacement to retry safely.', 503) from None
            else:
                value = _canonical(db, client, source)
        if value['status'] != 'expired':
            raise billing.Error('Checkout expiration is not confirmed. Resume the saved replacement to retry safely.', 503)
        # The handoff revalidates the target and rechecks the canonical old session.
        return billing.start_checkout(db, settings, uid, revision, interval, code=code,
            subscriber=True, client=client, replacement_source_id=source.id)
    except billing.Error:
        # _stop may have committed. Never let this request's error overwrite a
        # different intent accepted while that account lock was released.
        billing.lock_account(db, uid)
        current = billing.latest(db, uid)
        intent = (current.replacement_intent or {}) if current else {}
        if (current and current.id == source.id and source.checkout_status == 'expired'
            and intent.get('id') == intent_id and intent.get('state') == 'pending'):
            # Expiration is final, but a withdrawn target must not trap the account.
            source.replacement_intent = {**source.replacement_intent, 'state': 'blocked'}
            db.commit()
        raise


def resume(db, settings, uid, expected_attempt_id=None, expected_replacement_id=None):
    billing.lock_account(db, uid)
    row = billing.latest(db, uid)
    if not row or (expected_attempt_id is not None and row.id != expected_attempt_id):
        raise billing.Error('Checkout changed. Refresh and review it before resuming.', 409)
    if billing.replacement_pending(row):
        intent = row.replacement_intent
        if expected_attempt_id is not None and str(expected_replacement_id or '') != intent.get('id'):
            raise billing.Error('The saved checkout selection changed. Refresh before resuming.', 409)
        return replace(db, settings, uid, row.id, intent['code'], intent['revision'], intent['interval'])
    if expected_replacement_id is not None:
        raise billing.Error('The checkout replacement changed. Refresh before resuming.', 409)
    if row.checkout_status not in {'creating', 'open'}:
        raise billing.Error('There is no pending checkout. Refresh billing status.', 409)
    plan = db.get(Plan, row.plan_revision_id)
    return billing.start_checkout(db, settings, uid, plan.revision, row.interval,
        code=plan.code, subscriber=True, expected_attempt_id=row.id)
