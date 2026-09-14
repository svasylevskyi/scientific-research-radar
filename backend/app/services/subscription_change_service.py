"""Renewal-only changes. Durable intent precedes every idempotent Stripe write.

Only the canonical subscription plus our verified schedule can change the saved
plan binding. Browser returns and webhook payloads never grant entitlements.
"""

from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import func, select

from app.models.digest import Digest
from app.models.stripe_sandbox import SandboxCheckout
from app.models.subscription_access import SubscriptionAccountState
from app.models.subscription_change import SubscriptionChange as Change
from app.models.subscription_plan import SubscriptionPlanRevision as Plan
from app.services import billing_policy as subscribers
from app.services import stripe_sandbox_service as billing
from app.services.billing_change_observation import (
    has_target,
    notice,
    observe,
    verified_schedule,
)
from app.services.billing_change_observation import paid as paid
from app.services.billing_invoice_service import assessment, ref
from app.services.billing_payment_rules import (
    expected_invoice_price as expected_invoice_price,
)
from app.services.billing_policy import CHANGE_TERMINAL as TERMINAL
from app.services.billing_policy import LIMITS as LIMITS
from app.services.billing_policy import blocking_change as blocking
from app.services.billing_policy import blocking_upgrade as upgrade_pending
from app.services.billing_policy import simple_subscription, subscription
from app.services.subscription_access_service import AccessDenied, resolve

WORK = {'preparing', 'undoing', 'finalizing'}


def now():
    return datetime.now(timezone.utc)


def latest(db, uid):
    return db.scalar(select(Change).where(Change.user_id == uid).order_by(Change.created_at.desc(), Change.id.desc()).limit(1))


def serialized(db, row):
    if not row:
        return None
    config = db.get(Plan, row.target_revision_id).configuration
    return {'id': str(row.id), 'state': row.state, 'plan_name': config['name'], 'interval': row.target_interval,
        'price': config['monthly_price' if row.target_interval == 'monthly' else 'annual_price'], 'currency': config['currency'],
        'effective_at': billing.utc(row.effective_at), 'error': row.last_error,
        'undo_allowed': row.state == 'scheduled' and billing.utc(row.effective_at) > now() + timedelta(seconds=30),
        'retry_allowed': row.state in WORK or row.state == 'needs_review'}


def is_downgrade(source, target):
    a, b = source.configuration, target.configuration
    return (source.code != target.code and b.get('billing_type', 'stripe') == 'stripe'
        and b['currency'] == a['currency'] and Decimal(str(b['monthly_price'])) < Decimal(str(a['monthly_price']))
        and all(b[k] <= a[k] for k in LIMITS)
        and set(b['schedule_frequencies']) <= set(a['schedule_frequencies'])
        and (not b['email_delivery'] or a['email_delivery']))


def options(db, settings, uid):
    checkout = billing.latest(db, uid)
    change = latest(db, uid)
    result = {'items': [], 'change': serialized(db, change), 'digests': [], 'reason': ''}
    if not checkout or not checkout.subscription_id or checkout.subscription_status != 'active' or checkout.cancel_at_period_end:
        result['reason'] = 'An active paid subscription with no pending cancellation is required.'
        return result
    if not settings.stripe_sandbox_checkout_enabled or not subscribers.opted_in(db, uid):
        result['reason'] = 'Subscription changes are unavailable for this account.'
        return result
    if blocking(db, uid) or upgrade_pending(db, uid):
        result['reason'] = 'Complete or undo the existing change before choosing another.'
        return result
    source = db.get(Plan, checkout.plan_revision_id)
    versions = select(Plan.code, func.max(Plan.revision).label('revision')).group_by(Plan.code).subquery()
    plans = list(db.scalars(select(Plan).join(versions, (Plan.code == versions.c.code) & (Plan.revision == versions.c.revision))))
    # Interval-only changes retain the subscriber's immutable purchased revision.
    plans = [source] + [p for p in plans if subscribers.available(p) and is_downgrade(source, p)]
    for p in plans:
        c = p.configuration
        for interval in ('monthly', 'annual'):
            price = c.get('monthly_price' if interval == 'monthly' else 'annual_price')
            mapping = (c.get('stripe_sandbox') or {}).get('monthly_price_id' if interval == 'monthly' else 'annual_price_id')
            if price is None or not mapping or (p.id == source.id and interval == checkout.interval):
                continue
            # A tier downgrade must also reduce the normalized selected price.
            old_price = Decimal(str(source.configuration['monthly_price' if checkout.interval == 'monthly' else 'annual_price'])) / (12 if checkout.interval == 'annual' else 1)
            if p.id != source.id and Decimal(str(price)) / (12 if interval == 'annual' else 1) > old_price:
                continue
            result['items'].append({'code': p.code, 'revision': p.revision, 'interval': interval,
                'name': c['name'], 'price': price, 'currency': c['currency'], **{k: c[k] for k in (*LIMITS, 'schedule_frequencies', 'email_delivery')}})
    result['digests'] = [{'id': str(d.id), 'topic': d.topic} for d in db.scalars(select(Digest).where(Digest.owner_id == uid).order_by(Digest.created_at, Digest.id))]
    result['effective_at'] = billing.utc(checkout.period_end) if checkout.period_end else None
    return result


def choose_ids(db, uid, ids, maximum):
    available = {str(i) for i in db.scalars(select(Digest.id).where(Digest.owner_id == uid))}
    chosen = [str(i) for i in ids]
    if not set(chosen) <= available:
        raise billing.Error('A selected digest does not belong to your account.', 404)
    if len(chosen) != len(set(chosen)) or len(chosen) != min(maximum, len(available)):
        raise billing.Error(f'Choose {min(maximum, len(available))} distinct active digests for the target plan.', 422)
    return chosen


def schedule(db, settings, uid, code, revision, interval, expected_end, digest_ids):
    billing.enabled(settings)
    client = billing.StripeSandboxClient(settings)
    billing.lock_account(db, uid)
    subscribers.require_opt_in(db, uid)
    if upgrade_pending(db, uid):
        raise billing.Error('Resolve the pending upgrade before scheduling another change.', 409)
    existing = blocking(db, uid)
    if existing:
        target = db.get(Plan, existing.target_revision_id)
        if (target.code, target.revision, existing.target_interval) == (code, revision, interval):
            # A duplicate request resumes the same durable intent, never replaces it.
            db.commit()
            return retry(db, settings, uid, existing.id)
        raise billing.Error('Another subscription change is pending. Undo it first.', 409)
    checkout = billing.latest(db, uid)
    if not checkout or not checkout.subscription_id:
        raise billing.Error('No subscription is available to change.', 409)
    billing.observe_subscription(db, client, checkout, checkout.subscription_id)
    choices = options(db, settings, uid)
    choice = next((p for p in choices['items'] if (p['code'], p['revision'], p['interval']) == (code, revision, interval)), None)
    if not choice:
        raise billing.Error('This change is no longer available. Reload and review the plans.', 409)
    if not checkout.period_end or billing.utc(checkout.period_end) != billing.utc(expected_end) or billing.utc(checkout.period_end) <= now() + timedelta(minutes=5):
        raise billing.Error('The renewal date changed or is too close. Refresh and review after renewal.', 409)
    payment = assessment(db, checkout, now(), settings.subscription_grace_days)
    if not checkout.price_matches or not payment['covered'] or payment['issue']:
        raise billing.Error('Resolve payment and verify current paid coverage before changing a subscription.', 409)
    value = subscription(client, checkout)
    simple_subscription(value)
    if value.get('schedule') or value.get('cancel_at_period_end') or value.get('status') != 'active':
        raise billing.Error('Stripe already has a schedule or cancellation, or payment is not active. Refresh billing.', 409)
    target = db.scalar(select(Plan).where(Plan.code == code, Plan.revision == revision))
    report = client.mapping(target.configuration)
    if not report['matches']:
        raise billing.Error('The target plan no longer matches Stripe. Ask an administrator to review it.', 409)
    chosen = choose_ids(db, uid, digest_ids, target.configuration['max_digests'])
    change = Change(user_id=uid, checkout_id=checkout.id, source_revision_id=checkout.plan_revision_id,
        target_revision_id=target.id, source_interval=checkout.interval, target_interval=interval,
        source_price_id=checkout.price_id, target_price_id=target.configuration['stripe_sandbox']['monthly_price_id' if interval == 'monthly' else 'annual_price_id'],
        effective_at=checkout.period_end, digest_ids=chosen, next_attempt_at=now(), created_at=now())
    db.add(change)
    db.commit()  # Durable intent before the external side effect; account lock is reacquired below.
    return retry(db, settings, uid, change.id)


def advance(db, client, change):
    checkout = db.get(SandboxCheckout, change.checkout_id)
    if change.state == 'needs_review':
        # Read-only recovery after an operator releases a stranded schedule in Stripe.
        value = subscription(client, checkout)
        if change.schedule_id:
            observe(db, client, checkout, value)
        elif not value.get('schedule') and now() - billing.utc(change.created_at) > timedelta(hours=23):
            change.state = 'stopped'
            notice(db, change, 'stopped', 'No Stripe schedule remains. Review your subscription before choosing another change.')
        return
    if change.state not in WORK:
        return
    if change.state == 'preparing':
        value = subscription(client, checkout)
        if not change.schedule_id:
            item = ((value.get('items') or {}).get('data') or [{}])[0]
            if (value.get('status') != 'active' or value.get('cancel_at_period_end') or ref(item.get('price')) != change.source_price_id
                or item.get('current_period_end', value.get('current_period_end')) != int(billing.utc(change.effective_at).timestamp())):
                change.state, change.last_error = 'needs_review', 'The source subscription changed before scheduling. Operator review is required.'
                return
            if now() - billing.utc(change.created_at) > timedelta(hours=23):
                change.state, change.last_error = 'needs_review', 'The unresolved request is too old to replay safely. Ask an operator to reconcile its Stripe schedule.'
                return
            if value.get('schedule'):
                # The create response may have been lost. Replay only the same request/key;
                # its returned ID must equal the subscription's attached schedule.
                attached = ref(value['schedule'])
            else:
                attached = None
            simple_subscription(value)
            created = client.request('POST', 'subscription_schedules', data={'from_subscription': checkout.subscription_id},
                idempotency_key=f'radar-change-{change.id}-create')
            sid = billing.identifier(created.get('id'), 'sub_sched_')
            if attached and attached != sid:
                raise billing.Error('A different Stripe schedule is attached. Operator review is required.', 409)
            change.schedule_id = sid
            db.commit()  # Save the provider ID before configuring its future phase.
            billing.lock_account(db, change.user_id)
            db.refresh(change)
            if change.state != 'preparing':
                return
        current = verified_schedule(client, checkout, change)
        if current.get('status') != 'active':
            change.state = 'stopped'
            notice(db, change, 'stopped', 'Stripe no longer has an active schedule. Review your billing status.')
            return
        if has_target(current, change):
            change.state = 'scheduled'
            notice(db, change, 'scheduled', 'Your requested change is scheduled. No immediate charge or proration is made. You can undo it before renewal.')
            return
        if billing.utc(change.effective_at) <= now() + timedelta(seconds=30):
            change.state, change.last_error = 'needs_review', 'Renewal arrived before the schedule could be confirmed. Operator review is required.'
            return
        current_subscription = subscription(client, checkout)
        item = ((current_subscription.get('items') or {}).get('data') or [{}])[0]
        if (current_subscription.get('status') != 'active' or current_subscription.get('cancel_at_period_end')
            or ref(current_subscription.get('schedule')) != change.schedule_id or ref(item.get('price')) != change.source_price_id
            or item.get('current_period_end', current_subscription.get('current_period_end')) != int(billing.utc(change.effective_at).timestamp())):
            raise billing.Error('The source subscription changed before confirmation. Operator review is required.', 409)
        simple_subscription(current_subscription)
        if not change.parameters:
            phases = current.get('phases') or []
            if len(phases) != 1 or len(phases[0].get('items') or []) != 1 or ref(phases[0]['items'][0].get('price')) != change.source_price_id:
                raise billing.Error('The source schedule was customized. Operator review is required.', 409)
            start = (current.get('current_phase') or {}).get('start_date')
            if type(start) is not int or start >= int(billing.utc(change.effective_at).timestamp()):
                raise billing.Error('The current schedule phase could not be verified.', 409)
            change.parameters = {'end_behavior': 'release', 'proration_behavior': 'none',
                'metadata[radar_change_id]': str(change.id),
                'phases[0][start_date]': str(start), 'phases[0][end_date]': str(int(billing.utc(change.effective_at).timestamp())),
                'phases[0][items][0][price]': change.source_price_id, 'phases[0][items][0][quantity]': '1', 'phases[0][proration_behavior]': 'none',
                'phases[1][start_date]': str(int(billing.utc(change.effective_at).timestamp())),
                'phases[1][duration][interval]': 'month' if change.target_interval == 'monthly' else 'year',
                'phases[1][duration][interval_count]': '1', 'phases[1][items][0][price]': change.target_price_id,
                'phases[1][items][0][quantity]': '1', 'phases[1][proration_behavior]': 'none', 'phases[1][billing_cycle_anchor]': 'phase_start'}
            db.commit()
            billing.lock_account(db, change.user_id)
            db.refresh(change)
            if change.state != 'preparing':
                return
        client.request('POST', f'subscription_schedules/{change.schedule_id}', data=change.parameters,
            idempotency_key=f'radar-change-{change.id}-configure')
        confirmed = verified_schedule(client, checkout, change)
        if not has_target(confirmed, change):
            raise billing.Error('Stripe has not confirmed the requested future phase.', 503)
        change.state = 'scheduled'
        notice(db, change, 'scheduled', 'Your requested change is scheduled. No immediate charge or proration is made. You can undo it before renewal.')
    elif change.state in {'undoing', 'finalizing'}:
        value = verified_schedule(client, checkout, change)
        if value.get('status') == 'active':
            if change.state == 'undoing' and billing.utc(change.effective_at) <= now() + timedelta(seconds=30):
                # Do not release after the boundary: it could leave the new price in place.
                billing.observe_subscription(db, client, checkout, checkout.subscription_id)
                if change.state == 'undoing':
                    change.state = 'scheduled'
                return
            client.request('POST', f'subscription_schedules/{change.schedule_id}/release', data={'preserve_cancel_date': 'true'},
                idempotency_key=f'radar-change-{change.id}-release')
            value = verified_schedule(client, checkout, change)
        if value.get('status') not in {'released', 'completed', 'canceled'}:
            raise billing.Error('Stripe has not confirmed release of this schedule.', 503)
        was_undo = change.state == 'undoing'
        # Canonical refresh detects a boundary race; never claim undo if the target took effect.
        billing.observe_subscription(db, client, checkout, checkout.subscription_id)
        if was_undo and change.applied_at is None:
            if not checkout.price_matches or checkout.subscription_status in billing.TERMINAL:
                change.state, change.last_error = 'needs_review', 'The schedule was released, but the original subscription is no longer active at its saved price. Review billing.'
                return
            change.state = 'undone'
            notice(db, change, 'undone', 'The scheduled change was undone. Your current plan and billing interval continue.')
        elif change.state == 'finalizing':
            change.state = 'applied'


def retry(db, settings, uid, change_id):
    billing.enabled(settings)
    billing.lock_account(db, uid)
    change = db.get(Change, change_id, populate_existing=True)
    if not change or change.user_id != uid:
        raise billing.Error('Subscription change not found.', 404)
    try:
        advance(db, billing.StripeSandboxClient(settings), change)
        change.last_error = None if change.state != 'needs_review' else change.last_error
        change.next_attempt_at = now() + timedelta(seconds=30)
        db.commit()
    except billing.Error as exc:
        db.rollback()
        billing.lock_account(db, uid)
        change = db.get(Change, change_id, populate_existing=True)
        change.attempts += 1
        change.last_error = str(exc)[:500]
        change.next_attempt_at = now() + timedelta(seconds=min(3600, 30 * 2 ** min(change.attempts, 7)))
        if change.attempts >= 10:
            change.state = 'needs_review'
        db.commit()
    return serialized(db, change)


def undo(db, settings, uid, change_id):
    billing.enabled(settings)
    billing.lock_account(db, uid)
    change = db.get(Change, change_id, populate_existing=True)
    if not change or change.user_id != uid:
        raise billing.Error('Subscription change not found.', 404)
    if change.state == 'undone':
        return serialized(db, change)
    if change.state == 'undoing':
        db.commit()
        return retry(db, settings, uid, change.id)
    if change.state != 'scheduled' or billing.utc(change.effective_at) <= now() + timedelta(seconds=30):
        raise billing.Error('This change is already starting or cannot be undone. Refresh billing status.', 409)
    change.state, change.next_attempt_at = 'undoing', now()
    db.commit()
    return retry(db, settings, uid, change.id)


def tick(factory, settings):
    if not settings.stripe_sandbox_checkout_enabled:
        return False
    with factory() as db:
        row = db.scalar(select(Change).where(Change.state.in_(WORK), Change.next_attempt_at <= now())
            .order_by(Change.next_attempt_at, Change.id).limit(1))
        if not row:
            return False
        retry(db, settings, row.user_id, row.id)
        return True


def active_digests(db, settings, uid, ids=None):
    try:
        current = resolve(db, uid, settings)
    except AccessDenied as exc:
        raise billing.Error(str(exc), exc.status) from None
    if current['billing_type'] != 'stripe' or not current['allowed']:
        return {'available': False, 'items': [], 'selected_ids': [], 'limit': 0}
    maximum = current['plan']['configuration']['max_digests']
    state = db.get(SubscriptionAccountState, uid)
    if ids is not None:
        state.paid_digest_ids = choose_ids(db, uid, ids, maximum)
        db.flush()
        resolve(db, uid, settings)
    result = {'available': True, 'limit': maximum, 'selected_ids': state.paid_digest_ids,
        'items': [{'id': str(d.id), 'topic': d.topic} for d in db.scalars(select(Digest).where(Digest.owner_id == uid).order_by(Digest.created_at, Digest.id))]}
    db.commit()
    return result
