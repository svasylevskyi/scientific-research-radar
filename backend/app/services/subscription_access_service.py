"""Opt-in sandbox entitlements. All mutations share the observation account lock.

No Stripe calls in request admission. Accepted work keeps its reservation when
billing changes; retries are new admissions. Old observation rows are never moved.
"""
from calendar import monthrange
from datetime import datetime, timedelta, timezone
from sqlalchemy import case, func, select
from app.core.config import get_settings
from app.models.subscription_access import SubscriptionAccessPolicy as Policy, SubscriptionRunUsage as Usage
from app.models.stripe_sandbox import SandboxCheckout
from app.models.subscription_plan import SubscriptionPlanRevision
from app.models.digest import Digest
from app.models.digest_run import DigestRun, DigestRunPaper, DigestRunStatus
from app.services.subscription_observation_service import lock, utc, reasons


class AccessDenied(ValueError):
    def __init__(self, message, status=403):
        super().__init__(message)
        self.status = status


def now():
    return datetime.now(timezone.utc)


def policy(db, user_id):
    return db.scalar(select(Policy).where(Policy.user_id == user_id).order_by(Policy.version.desc()).limit(1))


def month_at(anchor, offset):
    index = anchor.year * 12 + anchor.month - 1 + offset
    year, month = divmod(index, 12)
    month += 1
    return anchor.replace(year=year, month=month, day=min(anchor.day, monthrange(year, month)[1]))


def window(anchor, stamp):
    anchor, stamp = utc(anchor), utc(stamp)
    offset = (stamp.year - anchor.year) * 12 + stamp.month - anchor.month
    if month_at(anchor, offset) > stamp:
        offset -= 1
    return month_at(anchor, offset), month_at(anchor, offset + 1)


def resolve(db, user_id, settings=None):
    settings, stamp = settings or get_settings(), now()
    selected = policy(db, user_id)
    result = dict(mode=selected.mode if selected else 'complimentary', version=selected.version if selected else 0,
        allowed=True, reason='Complimentary development access.', status='complimentary', plan=None,
        checkout_id=None, period_start=None, period_end=None, grace_until=None, access_until=None,
        observed_at=None, cancel_at_period_end=False)
    if result['mode'] == 'complimentary':
        return result
    row = db.scalar(select(SandboxCheckout).where(SandboxCheckout.user_id == user_id,
        SandboxCheckout.subscription_id.is_not(None)).order_by(SandboxCheckout.created_at.desc(), SandboxCheckout.id).limit(1))
    result.update(allowed=False, status='unavailable', reason='No verified sandbox subscription. Review Subscription and usage.')
    if not row:
        return result
    plan = db.get(SubscriptionPlanRevision, row.plan_revision_id)
    result.update(checkout_id=row.id, status=row.subscription_status, observed_at=utc(row.observed_at) if row.observed_at else None,
        plan={'id': plan.id, 'name': plan.configuration['name'], 'configuration': plan.configuration},
        cancel_at_period_end=row.cancel_at_period_end)
    if row.billing_anchor:
        result['period_start'], result['period_end'] = window(row.billing_anchor, stamp)
    if not row.price_matches:
        result['reason'] = 'The subscription price differs from the saved plan. Ask an admin to review billing synchronization.'
    elif not row.observed_at or stamp - utc(row.observed_at) > timedelta(seconds=settings.subscription_sync_max_age_seconds):
        result['reason'] = 'Subscription synchronization is overdue. New research is paused until billing is verified.'
    elif not row.billing_anchor or not row.period_start or not row.period_end or utc(row.period_start) > stamp:
        result['reason'] = 'The subscription period is not verified yet. Ask an admin to reconcile billing.'
    elif row.subscription_status == 'active' and stamp < utc(row.period_end):
        result.update(allowed=True, reason='Sandbox subscription limits apply.', access_until=utc(row.period_end))
    elif row.subscription_status == 'past_due' and row.active_through and row.delinquent_since:
        end = utc(row.delinquent_since) + timedelta(days=settings.subscription_grace_days)
        if row.cancel_at_period_end:
            end = min(end, utc(row.period_end))
        result.update(grace_until=end, access_until=end)
        result.update(allowed=stamp < end, reason=(f'Renewal payment failed. Grace period ends {end.isoformat()}.' if stamp < end
            else 'Renewal grace period has ended. Resolve payment to start new research.'))
    else:
        result['reason'] = 'The subscription does not currently allow new research. Saved results remain available.'
    return result


def totals(db, user_id, access):
    query = select(
        func.coalesce(func.sum(case((Usage.state == 'settled', 1), else_=0)), 0),
        func.coalesce(func.sum(case((Usage.state == 'reserved', 1), else_=0)), 0),
        func.coalesce(func.sum(case((Usage.trigger == 'manual', 1), else_=0)), 0),
        func.coalesce(func.sum(case((Usage.state == 'settled', Usage.actual_papers), else_=0)), 0),
        func.coalesce(func.sum(case((Usage.state == 'reserved', Usage.requested_papers), else_=0)), 0)
    ).where(Usage.user_id == user_id, Usage.checkout_id == access['checkout_id'],
        Usage.period_start == access['period_start'], Usage.state.in_(['reserved', 'settled']))
    return dict(zip(['completed_runs', 'reserved_runs', 'manual_runs', 'completed_papers', 'reserved_papers'], map(int, db.execute(query).one())))


def overview(db, user_id, settings=None):
    access = resolve(db, user_id, settings)
    usage = totals(db, user_id, access)
    config = access['plan']['configuration'] if access['plan'] else None
    count = db.scalar(select(func.count()).select_from(Digest).where(Digest.owner_id == user_id))
    access.update(usage=usage, digest_count=count, remaining={
        'runs': max(0, config['runs_per_month'] - usage['completed_runs'] - usage['reserved_runs']) if config else None,
        'manual_runs': max(0, config['manual_runs_per_month'] - usage['manual_runs']) if config else None,
        'papers': max(0, config['papers_per_month'] - usage['completed_papers'] - usage['reserved_papers']) if config else None,
        'digests': max(0, config['max_digests'] - count) if config else None})
    create_reasons = []
    if access['mode'] != 'complimentary':
        if not access['allowed']:
            create_reasons.append(access['reason'])
        elif config and count >= config['max_digests']:
            create_reasons.append('Your digest limit is reached. Upgrade to a plan with more digests, or delete an unused digest to free a slot.')
    access['create_allowed'] = not create_reasons
    access['create_reasons'] = create_reasons
    access['schedule_allowed'] = access['allowed'] and (config is None or bool(config['schedule_frequencies']))
    access['schedule_reasons'] = ([] if access['schedule_allowed'] else [access['reason'] if not access['allowed'] else
        'Scheduling is not included in your plan. Upgrade to a plan with scheduled runs.'])
    access['paper_limit'] = config['max_papers_per_run'] if config and access['allowed'] else (30 if access['mode'] == 'complimentary' else 0)
    access['research_warning'] = None
    if config and access['allowed'] and (access['remaining']['runs'] == 0 or access['remaining']['papers'] == 0):
        access['research_warning'] = 'Your research allowance is exhausted. You can save digest settings, but new research must wait until ' + str(access['period_end']) + ', or until your subscription allowance is increased.'
    elif config and access['allowed'] and access['remaining']['manual_runs'] == 0:
        access['research_warning'] = 'Your manual-run allowance is exhausted. You can still save digest settings and included schedules. Manual runs become available at ' + str(access['period_end']) + ', or after a subscription upgrade.'
    # Never expose internal Stripe mapping through the user-facing response.
    if access['plan']:
        access['plan']['configuration'] = {k: config[k] for k in ('max_digests', 'max_papers_per_run', 'papers_per_month',
            'runs_per_month', 'manual_runs_per_month', 'schedule_frequencies', 'email_delivery')}
    return access


def assess(db, user_id, requested_papers, trigger='manual', schedule=None, settings=None):
    access = resolve(db, user_id, settings)
    if access['mode'] == 'complimentary':
        return access, []
    if not access['allowed']:
        return access, [access['reason']]
    count = db.scalar(select(func.count()).select_from(Digest).where(Digest.owner_id == user_id))
    usage = totals(db, user_id, access)
    config = access['plan']['configuration']
    issues = reasons(config, usage, requested_papers=requested_papers,
        trigger=trigger, digest_count=count, frequency=(schedule or {}).get('frequency'),
        email=trigger == 'scheduled' and (schedule or {}).get('send_email', False))
    issues = [s.replace('would be exceeded', 'is exhausted').replace('would', 'will') for s in issues]
    remaining_papers = max(0, config['papers_per_month'] - usage['completed_papers'] - usage['reserved_papers'])
    issues = [f'Monthly paper allowance: {remaining_papers} papers available, but this run requests {requested_papers}. Reduce Maximum papers or upgrade your subscription.'
        if i.startswith('Monthly paper allowance') else i for i in issues]
    if any(i.startswith('Requested papers') for i in issues):
        issues.append('Reduce Maximum papers to the per-run plan limit or upgrade your subscription.')
    if any(i.startswith('Existing digest count') for i in issues):
        issues.append('Delete an unused digest or upgrade to a plan with more digest slots.')
    if any(i.startswith('Monthly') for i in issues) and access['period_end']:
        issues.append('Monthly allowances reset at ' + access['period_end'].isoformat() + '. Saved results remain available.')
    return access, issues


def run_context(db, run, *, existing=None, schedule=None):
    # Retried scheduled work retains its original distribution/frequency intent.
    context = existing.request_context if existing else dict(schedule or {})
    if existing is None and str(run.trigger) == 'scheduled':
        from app.models.subscription_observation import ObservedRunUsage
        from app.models.digest_email_delivery import DigestEmailDelivery
        observation = db.get(ObservedRunUsage, run.id)
        if observation and observation.assessments:
            original = observation.assessments[0]['request_context']
            context = {'frequency': original.get('frequency'), 'send_email': original.get('email', False)}
        if db.scalar(select(DigestEmailDelivery.run_id).where(DigestEmailDelivery.run_id == run.id)):
            context['send_email'] = True
    return context


def reserve(db, run, *, schedule=None, settings=None):
    lock(db, run.owner_id)
    existing = db.get(Usage, run.id, populate_existing=True)
    if existing and existing.state in ('reserved', 'settled'):
        return
    context = run_context(db, run, existing=existing, schedule=schedule)
    access, issues = assess(db, run.owner_id, run.digest_snapshot['maximum_papers'], str(run.trigger), context, settings)
    if issues:
        raise AccessDenied(' '.join(issues))
    if access['mode'] == 'complimentary':
        return
    if existing is None:
        existing = Usage(run_key=run.id, run_id=run.id, user_id=run.owner_id, request_context=context)
        db.add(existing)
    existing.checkout_id = access['checkout_id']
    existing.plan_revision_id = access['plan']['id']
    existing.period_start, existing.period_end = access['period_start'], access['period_end']
    existing.trigger, existing.state = str(run.trigger), 'reserved'
    existing.requested_papers, existing.actual_papers = run.digest_snapshot['maximum_papers'], 0
    db.flush()


def settle(db, run, *, success):
    lock(db, run.owner_id)
    row = db.get(Usage, run.id, populate_existing=True)
    if row is None or row.state != 'reserved':
        return
    db.flush()
    row.actual_papers = sum(isinstance(value, dict) and bool(value) for value in db.scalars(
        select(DigestRunPaper.summary_data).where(DigestRunPaper.run_id == run.id)))
    row.state = 'settled' if success else 'released'
    db.flush()


def change_policy(db, user_id, actor_id, mode, expected_version, note):
    lock(db, user_id)
    current = policy(db, user_id)
    version = current.version if current else 0
    if expected_version != version:
        raise AccessDenied('Access policy changed. Reload before saving.', 409)
    active = db.scalar(select(DigestRun.id).where(DigestRun.owner_id == user_id,
        DigestRun.status.in_([DigestRunStatus.QUEUED, DigestRunStatus.RUNNING])).limit(1))
    if active:
        raise AccessDenied('Wait for the active run to finish before changing access mode.', 409)
    row = Policy(user_id=user_id, version=version + 1, mode=mode, created_by=actor_id, change_note=note)
    db.add(row)
    db.flush()
    return row


def check_details(db, user_id, *, requested_papers=None, creating=False, schedule=None):
    lock(db, user_id)
    access = resolve(db, user_id)
    if access['mode'] == 'complimentary':
        return
    # Editing topic/date/description and deleting data remain available even after expiry.
    if not creating and requested_papers is None and schedule is None:
        return
    if not access['allowed']:
        raise AccessDenied(access['reason'])
    config = access['plan']['configuration']
    if creating:
        count = db.scalar(select(func.count()).select_from(Digest).where(Digest.owner_id == user_id))
        if count >= config['max_digests']:
            raise AccessDenied('Digest limit reached. Delete an unused digest before creating another.')
    if requested_papers is not None and requested_papers > config['max_papers_per_run']:
        raise AccessDenied('Maximum papers exceeds the subscription per-run limit.')
    if schedule and (schedule['frequency'] not in config['schedule_frequencies'] or (schedule['send_email'] and not config['email_delivery'])):
        raise AccessDenied('The selected schedule frequency or email delivery is not included in this subscription.')
