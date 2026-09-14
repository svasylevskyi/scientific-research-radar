"""Same-interval paid upgrades: reviewed quote -> pending Stripe payment -> activation.

No general acceptance of prorated invoices. Every credit/debit must match an
owner-scoped, confirmed quote; the prior paid coverage remains a dependency.
"""
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from sqlalchemy import select, func
from app.models.subscription_upgrade import SubscriptionUpgrade as Upgrade
from app.models.subscription_plan import SubscriptionPlanRevision as Plan
from app.models.billing_invoice import BillingInvoice
from app.services import stripe_sandbox_service as billing, subscription_change_service as changes
from app.services import subscriber_billing_service as subscribers, billing_invoice_service as invoices

OPEN = {'submitting', 'pending_payment', 'needs_review'}


def now():
    return datetime.now(timezone.utc)


def blocking(db, uid):
    return db.scalar(select(Upgrade).where(Upgrade.user_id == uid, Upgrade.state.in_(OPEN)).limit(1))


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


def eligible(source, target, interval):
    a, b = source.configuration, target.configuration
    key = 'monthly_price' if interval == 'monthly' else 'annual_price'
    return (source.id != target.id and subscribers.available(target) and b.get('billing_type', 'stripe') == 'stripe'
        and a['currency'] == b['currency'] and a.get(key) is not None and b.get(key) is not None
        and Decimal(str(b[key])) > Decimal(str(a[key])) and all(b[k] >= a[k] for k in changes.LIMITS)
        and set(a['schedule_frequencies']) <= set(b['schedule_frequencies']) and (not a['email_delivery'] or b['email_delivery'])
        and (any(b[k] > a[k] for k in changes.LIMITS) or set(b['schedule_frequencies']) > set(a['schedule_frequencies']) or (b['email_delivery'] and not a['email_delivery'])))


def options(db, settings, uid):
    row = billing.latest(db, uid)
    result = {'items': [], 'upgrade': serialized(db, latest(db, uid)), 'reason': ''}
    if not settings.stripe_sandbox_checkout_enabled or not subscribers.opted_in(db, uid):
        result['reason'] = 'Paid upgrades are unavailable for this account.'
    elif not row or row.subscription_status != 'active' or row.cancel_at_period_end:
        result['reason'] = 'An active paid subscription without cancellation is required.'
    elif blocking(db, uid) or changes.blocking(db, uid):
        result['reason'] = 'Resolve the existing subscription change before requesting an upgrade.'
    else:
        source = db.get(Plan, row.plan_revision_id)
        versions = select(Plan.code, func.max(Plan.revision).label('revision')).group_by(Plan.code).subquery()
        plans = db.scalars(select(Plan).join(versions, (Plan.code == versions.c.code) & (Plan.revision == versions.c.revision)).order_by(Plan.code))
        result['items'] = [{'code': p.code, 'revision': p.revision, 'name': p.configuration['name'], 'interval': row.interval,
            'currency': p.configuration['currency'], 'price': p.configuration['monthly_price' if row.interval == 'monthly' else 'annual_price']}
            for p in plans if eligible(source, p, row.interval)]
    return result


def notice(db, row, event, text):
    from app.services.billing_notification_service import enqueue
    config = db.get(Plan, row.target_revision_id).configuration
    enqueue(db, row.user_id, f'upgrade:{row.id}:{event}', 'Subscription upgrade ' + event,
        f"{text}\nTarget: {config['name']} ({row.interval}).\nYour allowance reset date, used quota, and saved research are preserved.")


def snapshot(value, checkout, row, *, preview=False):
    """Validate the complete invoice, retaining only payment-relevant fields."""
    if (value.get('object') != 'invoice' or value.get('livemode') is not False
        or invoices.ref(value.get('customer')) != checkout.customer_id
        or invoices.subscription_id(value) != checkout.subscription_id):
        raise billing.Error('Upgrade invoice ownership could not be verified.', 409)
    currency = row.quote['currency']
    if value.get('currency') != currency or value.get('collection_method') != 'charge_automatically':
        raise billing.Error('Upgrade invoice currency or collection method does not match.', 409)
    if not preview and value.get('billing_reason') != 'subscription_update':
        raise billing.Error('Expected an invoice generated by this subscription update.', 409)
    if (value.get('discounts') or value.get('total_discount_amounts') or value.get('default_tax_rates')
        or (value.get('automatic_tax') or {}).get('enabled') or value.get('starting_balance', 0)
        or value.get('ending_balance', 0) or value.get('amount_shipping', 0)
        or value.get('paid_out_of_band') or value.get('amount_paid_off_stripe', 0)
        or value.get('post_payment_credit_notes_amount', 0) or value.get('pre_payment_credit_notes_amount', 0)
        or value.get('amount_overpaid', 0)):
        raise billing.Error('Discounts, balances, manual settlement, or invoice adjustments require review.', 409)
    values = value.get('lines') or {}
    lines = values.get('data') or []
    if values.get('has_more') is not False or len(lines) != 2:
        raise billing.Error('Expected exactly the complete unused-time credit and upgrade charge.', 409)
    normalized = []
    for line in lines:
        details = (line.get('parent') or {}).get('subscription_item_details') or {}
        price = invoices.ref((((line.get('pricing') or {}).get('price_details') or {}).get('price')) or line.get('price'))
        try:
            quantity = Decimal(str(line.get('quantity_decimal') if line.get('quantity_decimal') is not None else line.get('quantity')))
        except InvalidOperation:
            quantity = Decimal(0)
        if (details.get('proration', line.get('proration')) is not True or quantity != 1
            or invoices.ref(details.get('subscription') or line.get('subscription')) != checkout.subscription_id
            or invoices.ref(details.get('subscription_item') or line.get('subscription_item')) != row.item_id
            or line.get('currency') != currency or type(line.get('amount')) is not int):
            raise billing.Error('Upgrade invoice line ownership, quantity, or proration is unverified.', 409)
        start, end = (line.get('period') or {}).get('start'), (line.get('period') or {}).get('end')
        if start != int(billing.utc(row.proration_at).timestamp()) or end != int(billing.utc(row.period_end).timestamp()):
            raise billing.Error('Upgrade proration dates differ from the confirmed quote.', 409)
        normalized.append({'price': price, 'amount': line['amount'], 'start': start, 'end': end})
    by_price = {l['price']: l for l in normalized}
    if (len(by_price) != 2 or set(by_price) != {row.source_price_id, row.target_price_id}
        or by_price[row.source_price_id]['amount'] > 0 or by_price[row.target_price_id]['amount'] <= 0):
        raise billing.Error('Upgrade invoice must credit the saved source price and charge the target price.', 409)
    total = value.get('total'); due = value.get('amount_due')
    if type(total) is not int or type(due) is not int or total <= 0 or due != total or sum(l['amount'] for l in normalized) != total:
        raise billing.Error('Upgrade total must match its credit and charge without other adjustments.', 409)
    return {'currency': currency, 'amount_due': due, 'total': total, 'lines': sorted(normalized, key=lambda l: l['price'])}


def preview_params(row, checkout):
    return {'subscription': checkout.subscription_id,
        'subscription_details[items][0][id]': row.item_id, 'subscription_details[items][0][price]': row.target_price_id,
        'subscription_details[items][0][quantity]': '1', 'subscription_details[proration_behavior]': 'always_invoice',
        'subscription_details[proration_date]': str(int(billing.utc(row.proration_at).timestamp()))}


def preflight(db, settings, uid, client):
    billing.enabled(settings)
    subscribers.require_opt_in(db, uid)
    checkout = billing.latest(db, uid)
    if not checkout or not checkout.subscription_id:
        raise billing.Error('An active paid subscription is required.', 409)
    billing.observe_subscription(db, client, checkout, checkout.subscription_id)
    value = changes.subscription(client, checkout)
    changes.simple_subscription(value)
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
    if blocking(db, uid) or changes.blocking(db, uid):
        raise billing.Error('Resolve the existing subscription change first.', 409)
    client = billing.StripeSandboxClient(settings)
    checkout, item = preflight(db, settings, uid, client)
    source = db.get(Plan, checkout.plan_revision_id)
    target = db.scalar(select(Plan).where(Plan.code == code).order_by(Plan.revision.desc()).limit(1))
    if not target or target.revision != revision or not eligible(source, target, checkout.interval):
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
    row.quote = snapshot(client.request('POST', 'invoices/create_preview', data=preview_params(row, checkout)), checkout, row, preview=True)
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
    if blocking(db, uid) or changes.blocking(db, uid):
        raise billing.Error('Another subscription change is pending.', 409)
    client = billing.StripeSandboxClient(settings)
    checkout, item = preflight(db, settings, uid, client)
    if (checkout.id != row.checkout_id or checkout.price_id != row.source_price_id or checkout.plan_revision_id != row.source_revision_id
        or checkout.latest_invoice_id != row.source_invoice_id or item != row.item_id
        or billing.utc(checkout.period_start) != billing.utc(row.period_start) or billing.utc(checkout.period_end) != billing.utc(row.period_end)):
        raise billing.Error('Your subscription changed. Request a new preview.', 409)
    target = db.get(Plan, row.target_revision_id)
    current = db.scalar(select(Plan).where(Plan.code == target.code).order_by(Plan.revision.desc()).limit(1))
    if current.id != target.id or not eligible(db.get(Plan, row.source_revision_id), target, row.interval) or not client.mapping(target.configuration)['matches']:
        raise billing.Error('The target plan changed. Request a new preview.', 409)
    if snapshot(client.request('POST', 'invoices/create_preview', data=preview_params(row, checkout)), checkout, row, preview=True) != row.quote:
        row.state = 'expired'; db.commit()
        raise billing.Error('The charge changed. Review a new preview before confirming.', 409)
    row.state, row.submitted_at, row.next_attempt_at = 'submitting', now(), now()
    db.commit()  # Explicit consent and exact request survive a timeout or process crash.
    return retry(db, settings, uid, quote_id)


def invoice_issue(db, checkout, value):
    row = db.scalar(select(Upgrade).where(Upgrade.invoice_id == value.get('id'), Upgrade.checkout_id == checkout.id))
    if not row:
        return None
    try:
        if snapshot(value, checkout, row) != row.quote:
            raise billing.Error('The invoice differs from the confirmed upgrade quote.', 409)
        if value.get('status') == 'paid' and (value.get('amount_paid') != row.quote['amount_due'] or value.get('amount_remaining') != 0
            or not (value.get('status_transitions') or {}).get('paid_at')):
            raise billing.Error('Upgrade settlement is incomplete or inconsistent.', 409)
        return {'issue': None, 'start': row.proration_at, 'end': row.period_end}
    except billing.Error as exc:
        return {'issue': str(exc), 'start': row.proration_at, 'end': row.period_end}


def evidence(db, client, checkout, invoice_id, seen=None):
    """Refresh the entire bounded paid-coverage chain, oldest invoice first."""
    seen = set() if seen is None else seen
    if invoice_id in seen or len(seen) >= 16:
        raise billing.Error('Upgrade coverage chain needs operator review.', 409)
    seen.add(invoice_id)
    earlier = db.scalar(select(Upgrade).where(Upgrade.invoice_id == invoice_id, Upgrade.checkout_id == checkout.id))
    if earlier:
        evidence(db, client, checkout, earlier.source_invoice_id, seen)
    invoices.observe(db, checkout, invoices.retrieve(client, invoice_id))


def observe(db, client, checkout, value):
    """Read canonical subscription and invoice evidence; no writes to Stripe or commits."""
    row = db.scalar(select(Upgrade).where(Upgrade.checkout_id == checkout.id, Upgrade.submitted_at.is_not(None))
        .order_by(Upgrade.created_at.desc(), Upgrade.id.desc()).limit(1))
    if not row:
        return
    if row.invoice_id:
        # Even old upgrade credit/settlement evidence can change; verify before using it.
        evidence(db, client, checkout, row.invoice_id)
    if row.state in {'applied', 'expired'}:
        return
    items = (value.get('items') or {}).get('data') or []
    if len(items) != 1 or items[0].get('id') != row.item_id or items[0].get('quantity') != 1:
        row.state, row.last_error = 'needs_review', 'The subscription item changed unexpectedly.'
        return
    price = invoices.ref(items[0].get('price'))
    latest_id = invoices.ref(value.get('latest_invoice'))
    if not row.invoice_id and latest_id and latest_id != row.source_invoice_id:
        raw = invoices.retrieve(client, latest_id)
        try:
            if snapshot(raw, checkout, row) != row.quote or invoices.stamp(raw.get('created'), optional=False) < billing.utc(row.proration_at):
                raise billing.Error('The invoice does not match the saved upgrade request.', 409)
        except billing.Error as exc:
            row.state, row.last_error = 'needs_review', str(exc)
            return
        collision = db.scalar(select(Upgrade.id).where(Upgrade.invoice_id == latest_id))
        if collision and collision != row.id:
            row.state, row.last_error = 'needs_review', 'The invoice is already attached to another upgrade.'
            return
        row.invoice_id = latest_id; db.flush()
        evidence(db, client, checkout, latest_id)
    if not row.invoice_id:
        return  # An unresolved POST can only retry its original idempotency key.
    invoice = db.get(BillingInvoice, row.invoice_id)
    pending = value.get('pending_update')
    if invoice.issue:
        row.state, row.last_error = 'needs_review', invoice.issue
        return
    if invoice.status == 'paid' and not pending and price == row.target_price_id and value.get('status') == 'active':
        start = invoices.stamp(items[0].get('current_period_start', value.get('current_period_start')))
        end = invoices.stamp(items[0].get('current_period_end', value.get('current_period_end')))
        base = invoices.assessment(db, checkout, now(), client.settings.subscription_grace_days, invoice_id=row.source_invoice_id)
        if start != billing.utc(row.period_start) or end != billing.utc(row.period_end) or not base['covered'] or base['issue']:
            row.state, row.last_error = 'needs_review', 'The original paid coverage or unchanged billing period could not be verified.'
            return
        checkout.plan_revision_id, checkout.price_id = row.target_revision_id, row.target_price_id
        row.state, row.applied_at, row.last_error = 'applied', now(), None
        notice(db, row, 'completed', 'The prorated upgrade payment was verified. Your upgraded benefits are now active. Paused schedules still require explicit review and resumption.')
    elif invoice.status == 'void' and not pending and price == row.source_price_id:
        row.state, row.last_error = 'expired', None
        notice(db, row, 'expired', 'The pending upgrade expired or its invoice was voided. Your previous plan continues under its existing payment terms.')
    elif invoice.status == 'open' and pending and price == row.source_price_id:
        pending_items = pending.get('subscription_items') or []
        if len(pending_items) != 1 or pending_items[0].get('id') != row.item_id or invoices.ref(pending_items[0].get('price')) != row.target_price_id:
            row.state, row.last_error = 'needs_review', 'Stripe has a different pending subscription update.'
            return
        row.pending_until = invoices.stamp(pending.get('expires_at'), optional=False)
        row.state, row.last_error = 'pending_payment', None
        notice(db, row, 'payment pending', 'Complete payment or authentication on the secure invoice page. Until payment is verified, your previous paid plan remains in effect; no upgrade allowance is granted.')
    else:
        row.state, row.last_error = 'needs_review', 'The upgrade payment and subscription state do not agree. Refresh or ask an operator to review billing.'
    db.flush()


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
                value = changes.subscription(client, checkout)
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
                    changes.simple_subscription(value)
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
    if value.get('status') != 'open' or snapshot(value, checkout, row) != row.quote:
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
