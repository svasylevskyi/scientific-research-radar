"""Owner-scoped subscriber sandbox flow; never changes the opt-in policy."""

from sqlalchemy import func, select

from app.models.subscription_plan import SubscriptionPlanRevision as Plan
from app.models.subscription_access import FreeSubscription
from app.services import stripe_sandbox_service as billing
from app.services.billing_policy import available, opted_in
from app.services.billing_policy import blocking_change as blocking
from app.services.billing_policy import blocking_upgrade as upgrade_pending
from app.services.billing_policy import require_opt_in as require_opt_in

PUBLIC_FIELDS = ('name', 'description', 'currency', 'monthly_price', 'annual_price', 'tax_display',
    'max_digests', 'max_papers_per_run', 'papers_per_month', 'runs_per_month', 'manual_runs_per_month',
    'schedule_frequencies', 'email_delivery')


def catalogue(db):
    latest = select(Plan.code, func.max(Plan.revision).label('revision')).group_by(Plan.code).subquery()
    rows = db.scalars(select(Plan).join(latest, (Plan.code == latest.c.code) & (Plan.revision == latest.c.revision))
        .order_by(func.coalesce(Plan.configuration['display_order'].as_integer(), 0), Plan.code))
    return {'items': [{'code': p.code, 'revision': p.revision, 'billing_type': p.configuration.get('billing_type', 'stripe'), **{k: p.configuration[k] for k in PUBLIC_FIELDS}}
        for p in rows if available(p)], 'sandbox': True}


def enrolment_catalogue(db, user_id):
    """Show the account's actual Free revision, even if no longer advertised.

    Registration already assigned it transactionally. Selecting paid checkout
    must not change that assignment before payment evidence grants paid access.
    """
    result = catalogue(db)
    result['items'] = [item for item in result['items'] if item['billing_type'] != 'free']
    assigned = db.get(FreeSubscription, user_id)
    if assigned:
        plan = db.get(Plan, assigned.plan_revision_id)
        result['items'].insert(0, {'code': plan.code, 'revision': plan.revision,
            'billing_type': 'free', **{key: plan.configuration[key] for key in PUBLIC_FIELDS}})
    return result


def status(db, settings, uid):
    change_pending = blocking(db, user_id=uid) is not None or upgrade_pending(db, user_id=uid) is not None
    row = billing.latest(db, uid)
    pending = bool(row and row.checkout_status in ('creating', 'open'))
    subscribed = bool(row and row.subscription_id and row.subscription_status not in billing.TERMINAL)
    eligible = opted_in(db, user_id=uid)
    enabled = settings.stripe_sandbox_checkout_enabled
    reason = ('Sandbox checkout is disabled.' if not enabled else
        'Contact the administrator to enroll this account in sandbox subscription testing.' if not eligible else
        'You already have a subscription. Review scheduled changes below, or use Manage billing for payment details.' if subscribed else
        'Resume the pending checkout before selecting another plan.' if pending else '')
    attempt = None
    if row:
        plan = db.get(Plan, row.plan_revision_id)
        attempt = {'plan_name': plan.configuration['name'], 'code': plan.code, 'revision': plan.revision,
            'interval': row.interval, 'checkout_status': row.checkout_status, 'subscription_status': row.subscription_status}
    return {'sandbox': True, 'checkout_allowed': enabled and eligible and not subscribed and not pending,
        'resume_allowed': enabled and eligible and pending and not subscribed,
        'portal_allowed': bool(enabled and row and row.customer_id and settings.stripe_sandbox_portal_configuration_id),
        'cancel_allowed': bool(enabled and subscribed and not change_pending and not row.cancel_at_period_end and settings.stripe_sandbox_portal_configuration_id),
        'cancel_at_period_end': bool(row and row.cancel_at_period_end),
        'period_end': billing.utc(row.period_end) if row and row.period_end else None,
        'reason': reason, 'attempt': attempt}


def checkout(db, settings, uid, code, revision, interval):
    return billing.start_checkout(db, settings, uid, revision, interval, code=code, subscriber=True)


def resume(db, settings, uid):
    # Resolve the owner's saved intent; never accept a session ID from the browser.
    row = billing.latest(db, uid)
    if not row or row.checkout_status not in ('creating', 'open'):
        raise billing.Error('There is no pending checkout. Refresh billing status.', 409)
    plan = db.get(Plan, row.plan_revision_id)
    return checkout(db, settings, uid, plan.code, plan.revision, row.interval)


def refresh(db, settings, uid):
    billing.refresh(db, settings, uid)
    return status(db, settings, uid)


def portal(db, settings, uid):
    # Existing customers can manage/cancel even after an admin removes opt-in.
    return billing.portal(db, settings, uid, subscriber=True)


def cancel(db, settings, uid):
    return billing.portal(db, settings, uid, subscriber=True, cancel=True)
