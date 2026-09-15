"""Canonical, read-only expected-mode invoice reconciliation. Caller owns the transaction."""

from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from types import SimpleNamespace
from urllib.parse import urlencode

from sqlalchemy import select

from app.models.billing_invoice import BillingInvoice
from app.models.subscription_plan import SubscriptionPlanRevision
from app.services.billing_payment_rules import (
    expected_invoice_price,
    invoice_issue,
    ref,
    stamp,
    subscription_id,
)
from app.services.billing_payment_rules import metadata as metadata
from app.services.billing_provider import identifier
from app.services.stripe_catalogue_service import StripeCatalogueError as Error

INVOICE_EVENTS = {'invoice.paid', 'invoice.payment_failed', 'invoice.payment_action_required',
    'invoice.finalized', 'invoice.finalization_failed', 'invoice.voided', 'invoice.marked_uncollectible', 'invoice.updated'}


def utc(value):
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def observe(db, checkout, value):
    invoice_id = identifier(value.get('id'), 'in_')
    if value.get('object') != 'invoice' or value.get('livemode') is not checkout.livemode:
        raise Error('Stripe did not return a expected-mode invoice.')
    if subscription_id(value) != checkout.subscription_id or ref(value.get('customer')) != checkout.customer_id:
        raise Error('Invoice ownership does not match the subscription.')
    row = db.get(BillingInvoice, invoice_id)
    if row and row.checkout_id != checkout.id:
        raise Error('Invoice is already associated with a different checkout.')
    status = value.get('status')
    if status not in {'draft', 'open', 'paid', 'void', 'uncollectible'}:
        raise Error('Stripe returned an unknown invoice status.')
    amounts = {k: value.get(k) for k in ('amount_due', 'amount_paid', 'amount_remaining', 'attempt_count')}
    if any(type(v) is not int or v < 0 for v in amounts.values()):
        raise Error('Stripe returned invalid invoice amounts or attempts.')
    config = db.get(SubscriptionPlanRevision, checkout.plan_revision_id).configuration
    currency = value.get('currency')
    if not isinstance(currency, str) or len(currency) != 3:
        raise Error('Stripe returned an invalid invoice currency.')
    issue = None
    lines = value.get('lines') or {}
    items = lines.get('data') or []
    start = end = None
    if len(items) != 1 or lines.get('has_more') is not False:
        issue = 'Invoice needs review: expected one complete recurring subscription line.'
    else:
        line = items[0]
        parent = line.get('parent') or {}
        details = parent.get('subscription_item_details') or {}
        linked = ref(details.get('subscription') or line.get('subscription'))
        price = ref(((line.get('pricing') or {}).get('price_details') or {}).get('price') or line.get('price'))
        start, end = stamp((line.get('period') or {}).get('start')), stamp((line.get('period') or {}).get('end'))
        try:
            quantity = Decimal(str(line.get('quantity_decimal') if line.get('quantity_decimal') is not None else line.get('quantity')))
        except InvalidOperation:
            quantity = Decimal(0)
        if linked != checkout.subscription_id or price != expected_invoice_price(db, checkout, start) or quantity != 1:
            issue = 'Invoice line does not match the subscription, quantity or saved price.'
        elif details.get('proration', line.get('proration')) is not False or not start or not end or start >= end:
            issue = 'Prorated or unverified invoice coverage needs manual review.'
    reason = value.get('billing_reason') or 'unknown'
    from app.models.subscription_change import SubscriptionChange
    transition_invoice = reason == 'subscription_update' and start and db.scalar(select(SubscriptionChange.id).where(SubscriptionChange.checkout_id == checkout.id, SubscriptionChange.applied_at.is_not(None), SubscriptionChange.effective_at == start))
    if reason not in {'subscription_create', 'subscription_cycle'} and not transition_invoice:
        issue = 'This invoice is not a supported initial or renewal invoice.'
    upgrade_check = invoice_issue(db=db, checkout=checkout, invoice=value)
    if upgrade_check is not None:
        issue, start, end = upgrade_check['issue'], upgrade_check['start'], upgrade_check['end']
    if currency.upper() != config['currency'] or value.get('collection_method') != 'charge_automatically':
        issue = 'Invoice currency or collection method differs from the supported subscription setup.'
    if value.get('paid_out_of_band') is True or value.get('amount_paid_off_stripe', 0) or value.get('post_payment_credit_notes_amount', 0) or value.get('pre_payment_credit_notes_amount', 0):
        issue = 'Manual settlement or credit notes require review before granting access.'
    paid_at = stamp((value.get('status_transitions') or {}).get('paid_at'))
    if status == 'paid' and (not paid_at or amounts['amount_remaining'] != 0 or amounts['amount_paid'] < amounts['amount_due']):
        issue = 'Invoice settlement is inconsistent or incomplete.'
    if row is None:
        row = BillingInvoice(id=invoice_id, checkout_id=checkout.id)
        db.add(row)
    for k, v in amounts.items():
        setattr(row, k, v)
    row.status, row.currency, row.billing_reason = status, currency.lower(), reason
    row.period_start, row.period_end, row.paid_at = start, end, paid_at
    row.issue, row.next_payment_attempt = issue, stamp(value.get('next_payment_attempt'))
    row.created_at, row.observed_at = stamp(value.get('created'), optional=False), datetime.now(timezone.utc)
    db.flush()
    return row


def retrieve(client, invoice_id):
    invoice_id = identifier(invoice_id, "in_")
    value = client.request("GET", "invoices/" + invoice_id)
    if value.get("id") != invoice_id:
        raise Error("Stripe returned a different invoice than requested.")
    return value


def reconcile(db, client, checkout, latest_id):
    latest_id = identifier(ref(latest_id), 'in_') if latest_id else None
    checkout.latest_invoice_id = latest_id
    # Always retrieve latest explicitly: a page of historical invoices cannot hide it.
    if latest_id:
        observe(db, checkout, retrieve(client, latest_id))
    def page(cursor=None):
        query = {'subscription': checkout.subscription_id, 'limit': 100}
        if cursor:
            query['starting_after'] = identifier(cursor, 'in_')
        result = client.request('GET', 'invoices?' + urlencode(query))
        values = result.get('data')
        if result.get('object') != 'list' or not isinstance(values, list) or len(values) > 100 or type(result.get('has_more')) is not bool:
            raise Error('Stripe returned an invalid invoice page.')
        if result['has_more'] and not values:
            raise Error('Stripe returned an empty invoice page with more results.')
        for value in values:
            observe(db, checkout, value)
        return result
    recent = page()
    recent_ids = {v['id'] for v in recent['data']}
    # Reverify the immediately preceding settled period even when it lies outside
    # the recent page. Stale historical payment evidence must not create grace.
    prior = db.scalar(select(BillingInvoice).where(BillingInvoice.checkout_id == checkout.id,
        BillingInvoice.period_end == checkout.period_start, BillingInvoice.status == 'paid', BillingInvoice.issue.is_(None))
        .order_by(BillingInvoice.created_at.desc()).limit(1))
    if prior and prior.id not in recent_ids and prior.id != latest_id:
        observe(db, checkout, retrieve(client, prior.id))
    # One extra historical page per tick; never scan an unbounded account history.
    if not checkout.invoice_history_complete:
        older = page(checkout.invoice_history_cursor) if checkout.invoice_history_cursor else recent
        if older['has_more']:
            cursor = identifier(older['data'][-1]['id'], 'in_')
            if cursor == checkout.invoice_history_cursor:
                raise Error('Stripe invoice pagination did not advance.')
            checkout.invoice_history_cursor = cursor
        else:
            checkout.invoice_history_complete = True
            checkout.invoice_history_cursor = None
    checkout.invoices_checked_at = datetime.now(timezone.utc)


def assessment(db, checkout, at, grace_days, *, invoice_id=None, _depth=0):
    selected_id = invoice_id or checkout.latest_invoice_id
    invoice = db.get(BillingInvoice, selected_id) if selected_id else None
    result = dict(status=invoice.status if invoice else 'unverified', paid_through=None, grace_until=None,
        covered=False, issue='No verified current invoice. Reconcile billing to verify payment.')
    if not invoice or invoice.checkout_id != checkout.id:
        return result
    from app.models.subscription_upgrade import SubscriptionUpgrade
    upgrade = db.scalar(select(SubscriptionUpgrade).where(SubscriptionUpgrade.invoice_id == invoice.id, SubscriptionUpgrade.checkout_id == checkout.id))
    if upgrade:
        if _depth >= 16:
            result['issue'] = 'Upgrade payment evidence chain needs review.'
            return result
        # A failed optional upgrade must not revoke the previously paid plan.
        if upgrade.applied_at is None:
            if checkout.plan_revision_id == upgrade.source_revision_id and checkout.price_matches:
                return assessment(db, checkout, at, grace_days, invoice_id=upgrade.source_invoice_id, _depth=_depth + 1)
            result['issue'] = 'Upgrade payment has not been verified for the current plan.'
            return result
        if (invoice.issue or invoice.status != 'paid' or not invoice.paid_at or invoice.amount_remaining != 0
            or invoice.amount_paid != upgrade.quote['amount_due']):
            result['issue'] = invoice.issue or 'The prorated upgrade payment is not settled.'
            return result
        if (not checkout.period_start or not checkout.period_end
            or utc(checkout.period_start) != utc(upgrade.period_start) or utc(checkout.period_end) != utc(upgrade.period_end)):
            result['issue'] = 'Upgrade evidence does not cover the current billing period.'
            return result
        source = SimpleNamespace(**{k: getattr(checkout, k) for k in ('id', 'latest_invoice_id', 'period_start', 'period_end', 'cancel_at_period_end')},
            plan_revision_id=upgrade.source_revision_id, price_matches=True)
        base = assessment(db, source, at, grace_days, invoice_id=upgrade.source_invoice_id, _depth=_depth + 1)
        if not base['covered'] or base['issue']:
            result['issue'] = base['issue'] or 'The original paid coverage for this upgrade has expired.'
            return result
        result.update(status='paid', paid_through=utc(upgrade.period_end), covered=utc(upgrade.proration_at) <= at < utc(upgrade.period_end), issue=None)
        return result
    result['issue'] = invoice.issue
    if invoice.issue or not checkout.period_start or not checkout.period_end or not invoice.period_start or not invoice.period_end:
        result['issue'] = invoice.issue or 'Invoice coverage is not verified.'
        return result
    # Compare exact subscription period, not the invoice's aggregation timestamps.
    if utc(invoice.period_start) != utc(checkout.period_start) or utc(invoice.period_end) != utc(checkout.period_end):
        result['issue'] = 'Current invoice does not cover the current subscription period.'
        return result
    if invoice.status == 'paid' and invoice.paid_at and invoice.amount_remaining == 0:
        result.update(covered=utc(invoice.period_start) <= at < utc(invoice.period_end), paid_through=utc(invoice.period_end))
    elif invoice.status == 'open' and invoice.attempt_count > 0 and invoice.billing_reason in {'subscription_cycle', 'subscription_update'}:
        candidates = list(db.scalars(select(BillingInvoice).where(
            BillingInvoice.checkout_id == checkout.id, BillingInvoice.id != invoice.id, BillingInvoice.status == 'paid',
            BillingInvoice.issue.is_(None), BillingInvoice.amount_remaining == 0, BillingInvoice.paid_at.is_not(None),
            BillingInvoice.period_start < checkout.period_start, BillingInvoice.period_end == checkout.period_start).order_by(BillingInvoice.created_at.desc()).limit(16)))
        prior_upgrade = db.scalar(select(SubscriptionUpgrade).where(
            SubscriptionUpgrade.checkout_id == checkout.id, SubscriptionUpgrade.applied_at.is_not(None),
            SubscriptionUpgrade.period_end == checkout.period_start).order_by(SubscriptionUpgrade.proration_at.desc()).limit(1))
        # The original lower-tier invoice alone cannot justify grace after an upgrade.
        settled = (settled_chain(db, db.get(BillingInvoice, prior_upgrade.invoice_id)) if prior_upgrade
            else any(settled_chain(db, candidate) for candidate in candidates))
        if settled:
            end = utc(invoice.period_start) + timedelta(days=grace_days)
            if checkout.cancel_at_period_end:
                end = min(end, utc(checkout.period_end))
            result['grace_until'] = end
    return result


def serialized(row):
    return {k: utc(v) if isinstance(v := getattr(row, k), datetime) else v for k in (
        'id', 'status', 'currency', 'amount_due', 'amount_paid', 'amount_remaining', 'attempt_count', 'billing_reason',
        'period_start', 'period_end', 'paid_at', 'next_payment_attempt', 'issue', 'created_at', 'observed_at')}


def settled_chain(db, invoice, seen=None):
    from app.models.subscription_upgrade import SubscriptionUpgrade
    seen = set() if seen is None else seen
    if not invoice or invoice.id in seen or len(seen) >= 16 or invoice.issue:
        return False
    seen.add(invoice.id)
    upgrade = db.scalar(select(SubscriptionUpgrade).where(SubscriptionUpgrade.invoice_id == invoice.id, SubscriptionUpgrade.checkout_id == invoice.checkout_id))
    if upgrade and upgrade.applied_at is None and upgrade.state == 'expired' and invoice.status == 'void':
        return settled_chain(db, db.get(BillingInvoice, upgrade.source_invoice_id), seen)
    if invoice.status != 'paid' or not invoice.paid_at or invoice.amount_remaining:
        return False
    return not upgrade or (upgrade.applied_at is not None and invoice.amount_paid == upgrade.quote['amount_due']
        and settled_chain(db, db.get(BillingInvoice, upgrade.source_invoice_id), seen))
