"""Same-interval paid upgrades: reviewed quote -> pending Stripe payment -> activation.

No general acceptance of prorated invoices. Every credit/debit must match an
owner-scoped, confirmed quote; the prior paid coverage remains a dependency.
"""

from app.services.billing_types import PlanEntitlements
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import func, select

from app.models.subscription_plan import SubscriptionPlanRevision as Plan
from app.models.subscription_upgrade import SubscriptionUpgrade as Upgrade
from app.services import billing_invoice_service as invoices
from app.services import billing_policy as changes
from app.services import billing_policy as subscribers
from app.services import stripe_sandbox_service as billing
from app.services.billing_payment_rules import invoice_issue as invoice_issue
from app.services.billing_payment_rules import snapshot
from app.services.billing_policy import UPGRADE_OPEN as OPEN
from app.services.billing_policy import blocking_upgrade as blocking
from app.services.billing_upgrade_observation import evidence as evidence
from app.services.billing_upgrade_observation import notice as notice
from app.services.billing_upgrade_observation import observe as observe


def now():
    return datetime.now(timezone.utc)


def latest(db, uid):
    return db.scalar(select(Upgrade).where(Upgrade.user_id == uid).order_by(Upgrade.created_at.desc(), Upgrade.id.desc()).limit(1))


def serialized(db, row):
    if not row:
        return None
    config = db.get(Plan, row.target_revision_id).configuration
    state = 'expired' if row.state == 'preview' and billing.utc(row.expires_at) <= now() else row.state
    return {'id': str(row.id), 'state': state, 'plan_name': config['name'], 'interval': row.interval,
        'recurring_price': config['monthly_price' if row.interval == 'monthly' else 'annual_price'],
        'currency': row.quote['currency'], 'amount_due': row.quote['amount_due'],
        'credit': -next(l['amount'] for l in row.quote['lines'] if l['price'] == row.source_price_id),
        'charge': next(l['amount'] for l in row.quote['lines'] if l['price'] == row.target_price_id),
        'proration_at': billing.utc(row.proration_at), 'period_end': billing.utc(row.period_end),
        'expires_at': billing.utc(row.expires_at), 'pending_until': billing.utc(row.pending_until) if row.pending_until else None,
        'error': row.last_error, 'confirm_allowed': state == 'preview',
        'retry_allowed': state in OPEN, 'payment_allowed': state == 'pending_payment',
        'limits': {k: config[k] for k in (*changes.LIMITS, 'schedule_frequencies', 'email_delivery')}}


def eligible(*, source: Plan, target: Plan, interval: str) -> bool:
    """An immediate upgrade costs more and improves benefits without removing any."""
    source_configuration, target_configuration = source.configuration, target.configuration
    price_key = 'monthly_price' if interval == 'monthly' else 'annual_price'
    if (source.id == target.id or not subscribers.available(target)
        or target_configuration.get('billing_type', 'stripe') != 'stripe'
        or source_configuration['currency'] != target_configuration['currency']
        or source_configuration.get(price_key) is None or target_configuration.get(price_key) is None):
        return False
    if Decimal(str(target_configuration[price_key])) <= Decimal(str(source_configuration[price_key])):
        return False
    source_entitlements = PlanEntitlements.from_configuration(source_configuration)
    target_entitlements = PlanEntitlements.from_configuration(target_configuration)
    return target_entitlements.improves(other=source_entitlements)


def options(db, settings, uid):
    row = billing.latest(db, uid)
    result = {'items': [], 'upgrade': serialized(db, latest(db, uid)), 'reason': ''}
    if not settings.stripe_sandbox_checkout_enabled or not subscribers.opted_in(db, user_id=uid):
        result['reason'] = 'Paid upgrades are unavailable for this account.'
    elif not row or row.subscription_status != 'active' or row.cancel_at_period_end:
        result['reason'] = 'An active paid subscription without cancellation is required.'
    elif blocking(db, user_id=uid) or changes.blocking_change(db, user_id=uid):
        result['reason'] = 'Resolve the existing subscription change before requesting an upgrade.'
    else:
        source = db.get(Plan, row.plan_revision_id)
        versions = select(Plan.code, func.max(Plan.revision).label('revision')).group_by(Plan.code).subquery()
        plans = db.scalars(select(Plan).join(versions, (Plan.code == versions.c.code) & (Plan.revision == versions.c.revision)).order_by(Plan.code))
        result['items'] = [{'code': p.code, 'revision': p.revision, 'name': p.configuration['name'], 'interval': row.interval,
            'currency': p.configuration['currency'], 'price': p.configuration['monthly_price' if row.interval == 'monthly' else 'annual_price']}
            for p in plans if eligible(source=source, target=p, interval=row.interval)]
    return result


def preview_params(row, checkout):
    return {'subscription': checkout.subscription_id,
        'subscription_details[items][0][id]': row.item_id, 'subscription_details[items][0][price]': row.target_price_id,
        'subscription_details[items][0][quantity]': '1', 'subscription_details[proration_behavior]': 'always_invoice',
        'subscription_details[proration_date]': str(int(billing.utc(row.proration_at).timestamp()))}


def preflight(db, settings, uid, client):
    billing.enabled(settings)
    subscribers.require_opt_in(db, user_id=uid)
    checkout = billing.latest(db, uid)
    if not checkout or not checkout.subscription_id:
        raise billing.Error('An active paid subscription is required.', 409)
    billing.observe_subscription(db, client, checkout, checkout.subscription_id)
    value = changes.subscription(client=client, checkout=checkout)
    changes.simple_subscription(value=value)
    if (value.get('status') != 'active' or value.get('cancel_at_period_end') or value.get('schedule')
        or not checkout.price_matches or not checkout.period_end or billing.utc(checkout.period_end) <= now() + timedelta(minutes=15)):
        raise billing.Error('Resolve billing changes or payment issues first; upgrades are unavailable close to renewal.', 409)
    payment = invoices.assessment(db, checkout, now(), settings.subscription_grace_days)
    if not payment['covered'] or payment['issue']:
        raise billing.Error('Verified current paid coverage is required before previewing an upgrade.', 409)
    item = value['items']['data'][0]
    if (invoices.ref(item.get('price')) != checkout.price_id
        or item.get('current_period_end', value.get('current_period_end')) != int(billing.utc(checkout.period_end).timestamp())
        or item.get('current_period_start', value.get('current_period_start')) != int(billing.utc(checkout.period_start).timestamp())):
        raise billing.Error('The subscription changed during verification. Refresh billing.', 409)
    return checkout, billing.identifier(item.get('id'), 'si_')


def preview(db, settings, uid, code, revision):
    billing.lock_account(db, uid)
    if blocking(db, user_id=uid) or changes.blocking_change(db, user_id=uid):
        raise billing.Error('Resolve the existing subscription change first.', 409)
    client = billing.StripeSandboxClient(settings)
    checkout, item = preflight(db, settings, uid, client)
    source = db.get(Plan, checkout.plan_revision_id)
    target = db.scalar(select(Plan).where(Plan.code == code).order_by(Plan.revision.desc()).limit(1))
    if not target or target.revision != revision or not eligible(source=source, target=target, interval=checkout.interval):
        raise billing.Error('This upgrade is no longer available. Review current plans.', 409)
    if not client.mapping(target.configuration)['matches']:
        raise billing.Error('The target plan no longer matches Stripe. Ask an administrator to review it.', 409)
    stamp = now().replace(microsecond=0)
    if stamp <= billing.utc(checkout.period_start):
        raise billing.Error('The billing period just started. Request a preview in a moment.', 409)
    if db.scalar(select(Upgrade.id).where(Upgrade.checkout_id == checkout.id, Upgrade.applied_at.is_not(None), Upgrade.proration_at >= stamp).limit(1)):
        raise billing.Error('The preceding upgrade just completed. Request another preview in a moment.', 409)
    # Limit supplementary chains before charging, rather than failing verification afterward.
    predecessor, seen = checkout.latest_invoice_id, set()
    while predecessor:
        if predecessor in seen or len(seen) >= 15:
            raise billing.Error('Further upgrades require renewal or operator review of the payment evidence chain.', 409)
        seen.add(predecessor)
        older = db.scalar(select(Upgrade).where(Upgrade.checkout_id == checkout.id, Upgrade.invoice_id == predecessor))
        predecessor = older.source_invoice_id if older else None
    row = Upgrade(user_id=uid, checkout_id=checkout.id, source_revision_id=source.id, target_revision_id=target.id,
        source_price_id=checkout.price_id, target_price_id=target.configuration['stripe_sandbox']['monthly_price_id' if checkout.interval == 'monthly' else 'annual_price_id'],
        item_id=item, interval=checkout.interval, source_invoice_id=checkout.latest_invoice_id,
        period_start=checkout.period_start, period_end=checkout.period_end, proration_at=stamp,
        created_at=now(), expires_at=stamp + timedelta(minutes=10), quote={'currency': target.configuration['currency'].lower()}, parameters={})
    row.quote = snapshot(invoice=client.request('POST', 'invoices/create_preview', data=preview_params(row, checkout)), checkout=checkout, upgrade=row, preview=True)
    row.parameters = {'items[0][id]': item, 'items[0][price]': row.target_price_id, 'items[0][quantity]': '1',
        'payment_behavior': 'pending_if_incomplete', 'proration_behavior': 'always_invoice',
        'proration_date': str(int(stamp.timestamp()))}
    for old in db.scalars(select(Upgrade).where(Upgrade.user_id == uid, Upgrade.state == 'preview')):
        old.state = 'expired'
    db.add(row); db.commit()
    return serialized(db, row)


def owned(db, uid, quote_id):
    row = db.get(Upgrade, quote_id, populate_existing=True)
    if not row or row.user_id != uid:
        raise billing.Error('Upgrade preview not found.', 404)
    return row


def confirm(db, settings, uid, quote_id):
    billing.lock_account(db, uid)
    row = owned(db, uid, quote_id)
    if row.state != 'preview':
        db.commit()
        return retry(db, settings, uid, quote_id)
    if billing.utc(row.expires_at) <= now():
        row.state = 'expired'; db.commit()
        raise billing.Error('The preview expired. Request a new charge preview.', 409)
    if blocking(db, user_id=uid) or changes.blocking_change(db, user_id=uid):
        raise billing.Error('Another subscription change is pending.', 409)
    client = billing.StripeSandboxClient(settings)
    checkout, item = preflight(db, settings, uid, client)
    if (checkout.id != row.checkout_id or checkout.price_id != row.source_price_id or checkout.plan_revision_id != row.source_revision_id
        or checkout.latest_invoice_id != row.source_invoice_id or item != row.item_id
        or billing.utc(checkout.period_start) != billing.utc(row.period_start) or billing.utc(checkout.period_end) != billing.utc(row.period_end)):
        raise billing.Error('Your subscription changed. Request a new preview.', 409)
    target = db.get(Plan, row.target_revision_id)
    current = db.scalar(select(Plan).where(Plan.code == target.code).order_by(Plan.revision.desc()).limit(1))
    if current.id != target.id or not eligible(source=db.get(Plan, row.source_revision_id), target=target, interval=row.interval) or not client.mapping(target.configuration)['matches']:
        raise billing.Error('The target plan changed. Request a new preview.', 409)
    if snapshot(invoice=client.request('POST', 'invoices/create_preview', data=preview_params(row, checkout)), checkout=checkout, upgrade=row, preview=True) != row.quote:
        row.state = 'expired'; db.commit()
        raise billing.Error('The charge changed. Review a new preview before confirming.', 409)
    row.state, row.submitted_at, row.next_attempt_at = 'submitting', now(), now()
    db.commit()  # Explicit consent and exact request survive a timeout or process crash.
    return retry(db, settings, uid, quote_id)


def retry(db, settings, uid, quote_id):
    billing.enabled(settings)
    billing.lock_account(db, uid)
    row = owned(db, uid, quote_id)
    if row.state not in OPEN:
        return serialized(db, row)
    client = billing.StripeSandboxClient(settings)
    checkout = billing.latest(db, uid)
    if not checkout or checkout.id != row.checkout_id:
        raise billing.Error('The original upgrade subscription is no longer current.', 409)
    try:
        billing.observe_subscription(db, client, checkout, checkout.subscription_id)
        if row.state == 'submitting' and not row.invoice_id:
            if now() - billing.utc(row.submitted_at) >= timedelta(hours=23):
                row.state, row.last_error = 'needs_review', 'The unresolved upgrade is too old to replay. Reconcile it in Stripe before another request.'
            else:
                value = changes.subscription(client=client, checkout=checkout)
                item = ((value.get('items') or {}).get('data') or [{}])[0]
                coverage = invoices.assessment(db, checkout, now(), settings.subscription_grace_days)
                if (not coverage['covered'] or coverage['issue'] or value.get('pending_update') or value.get('schedule') or value.get('cancel_at_period_end')
                    or value.get('status') != 'active' or invoices.ref(item.get('price')) != row.source_price_id
                    or item.get('id') != row.item_id or item.get('quantity') != 1
                    or invoices.ref(value.get('latest_invoice')) != row.source_invoice_id
                    or item.get('current_period_start', value.get('current_period_start')) != int(billing.utc(row.period_start).timestamp())
                    or item.get('current_period_end', value.get('current_period_end')) != int(billing.utc(row.period_end).timestamp())):
                    row.state, row.last_error = 'needs_review', 'The source subscription changed before the upgrade was confirmed.'
                else:
                    changes.simple_subscription(value=value)
                    # Never substitute a new price, amount, date or idempotency key on retry.
                    client.request('POST', 'subscriptions/' + checkout.subscription_id, data=row.parameters,
                        idempotency_key=f'radar-upgrade-{row.id}')
                    billing.observe_subscription(db, client, checkout, checkout.subscription_id)
        row.next_attempt_at = now() + timedelta(seconds=30)
        db.commit()
    except billing.Error as exc:
        db.rollback(); billing.lock_account(db, uid)
        row = owned(db, uid, quote_id)
        row.attempts += 1; row.last_error = str(exc)[:500]
        row.next_attempt_at = now() + timedelta(seconds=min(3600, 30 * 2 ** min(row.attempts, 7)))
        if row.attempts >= 10:
            row.state = 'needs_review'
        db.commit()
    return serialized(db, row)


def payment(db, settings, uid, quote_id):
    retry(db, settings, uid, quote_id)
    billing.lock_account(db, uid)
    row = owned(db, uid, quote_id)
    if row.state != 'pending_payment' or not row.invoice_id or not row.pending_until or billing.utc(row.pending_until) <= now():
        raise billing.Error('This upgrade has no payable pending invoice. Refresh billing status.', 409)
    checkout = billing.latest(db, uid)
    value = invoices.retrieve(billing.StripeSandboxClient(settings), row.invoice_id)
    if value.get('status') != 'open' or snapshot(invoice=value, checkout=checkout, upgrade=row) != row.quote:
        raise billing.Error('The pending invoice changed. Refresh billing status.', 409)
    url = billing.redirect_url(value.get('hosted_invoice_url'), 'invoice.stripe.com')
    db.commit()
    return {'url': url}


def tick(factory, settings):
    if not settings.stripe_sandbox_checkout_enabled:
        return False
    with factory() as db:
        row = db.scalar(select(Upgrade).where(Upgrade.state.in_(['submitting', 'pending_payment']), Upgrade.next_attempt_at <= now())
            .order_by(Upgrade.next_attempt_at, Upgrade.id).limit(1))
        if not row:
            return False
        retry(db, settings, row.user_id, row.id)
        return True
