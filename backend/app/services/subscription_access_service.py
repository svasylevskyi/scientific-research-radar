"""Opt-in sandbox entitlements. All mutations share the observation account lock.

No Stripe calls in request admission. Accepted work keeps its reservation when
billing changes; retries are new admissions. Old observation rows are never moved.
"""

from calendar import monthrange
from datetime import datetime, timedelta, timezone

from sqlalchemy import case, func, select

from app.core.config import get_settings
from app.models.digest import Digest
from app.models.digest_run import DigestRun, DigestRunPaper, DigestRunStatus
from app.models.stripe_sandbox import SandboxCheckout
from app.models.subscription_access import SubscriptionAccessPolicy as Policy
from app.models.subscription_access import SubscriptionRunUsage as Usage
from app.models.subscription_plan import SubscriptionPlanRevision
from app.services.billing_invoice_service import assessment
from app.services.billing_notification_service import enqueue
from app.services.billing_policy import AccessDenied
from app.services.free_subscription_service import assign
from app.services.subscription_observation_service import lock, reasons, utc


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


def _resolve_billing(db, user_id, settings=None):
    settings, stamp = settings or get_settings(), now()
    selected = policy(db, user_id)
    result = dict(mode=selected.mode if selected else 'complimentary', version=selected.version if selected else 0,
        allowed=True, reason='Complimentary development access.', status='complimentary', plan=None,
        checkout_id=None, period_start=None, period_end=None, grace_until=None, access_until=None,
        observed_at=None, cancel_at_period_end=False, billing_type=None)
    if result['mode'] == 'complimentary':
        return result
    row = db.scalar(select(SandboxCheckout).where(SandboxCheckout.user_id == user_id,
        SandboxCheckout.subscription_id.is_not(None)).order_by(SandboxCheckout.created_at.desc(), SandboxCheckout.id.desc()).limit(1))
    result.update(allowed=False, status='unavailable', reason='No verified sandbox subscription. Review Subscription and usage.')
    if not row:
        from app.models.subscription_access import FreeSubscription
        free = db.get(FreeSubscription, user_id)
        if free:
            plan = db.get(SubscriptionPlanRevision, free.plan_revision_id)
            start, end = window(free.anchor, stamp)
            result.update(allowed=True, status='free', reason='Free subscription limits apply.', billing_type='free',
                plan={'id': plan.id, 'name': plan.configuration['name'], 'configuration': plan.configuration},
                period_start=start, period_end=end)
            return result
        return result
    plan = db.get(SubscriptionPlanRevision, row.plan_revision_id)
    result.update(billing_type='stripe', checkout_id=row.id, status=row.subscription_status, observed_at=utc(row.observed_at) if row.observed_at else None,
        plan={'id': plan.id, 'name': plan.configuration['name'], 'configuration': plan.configuration},
        cancel_at_period_end=row.cancel_at_period_end)
    if row.billing_anchor:
        result['period_start'], result['period_end'] = window(row.billing_anchor, stamp)
    if row.subscription_status in {'canceled', 'incomplete_expired', 'incomplete'}:
        result.update(fallback_eligible=True, reason='The paid subscription ended or its initial payment is incomplete.')
        return result
    payment = assessment(db, row, stamp, settings.subscription_grace_days)
    result.update(payment_status=payment['status'], paid_through=payment['paid_through'], payment_issue=payment['issue'])
    if not row.price_matches:
        result['reason'] = 'The subscription price differs from the saved plan. Ask an admin to review billing synchronization.'
    elif not row.observed_at or stamp - utc(row.observed_at) > timedelta(seconds=settings.subscription_sync_max_age_seconds):
        result['reason'] = 'Subscription synchronization is overdue. New research is paused until billing is verified.'
    elif not row.billing_anchor or not row.period_start or not row.period_end or utc(row.period_start) > stamp:
        result['reason'] = 'The subscription period is not verified yet. Ask an admin to reconcile billing.'
    elif not row.invoices_checked_at or stamp - utc(row.invoices_checked_at) > timedelta(seconds=settings.subscription_sync_max_age_seconds):
        result['reason'] = 'Payment verification is pending or overdue. Ask an admin to reconcile billing.'
    elif payment['issue']:
        result['reason'] = payment['issue'] + ' New research is paused; saved results remain available.'
    elif row.subscription_status == 'active' and payment['covered']:
        result.update(allowed=True, reason='Sandbox subscription limits apply.', access_until=payment['paid_through'])
    elif row.subscription_status in {'active', 'past_due'} and payment['grace_until']:
        end = payment['grace_until']
        result.update(grace_until=end, access_until=end)
        result.update(allowed=stamp < end, reason=(f'Renewal payment failed or is pending. Grace period ends {end.isoformat()}.' if stamp < end
            else 'Renewal grace period has ended. Resolve payment to start new research.'))
    else:
        result['reason'] = 'The subscription does not currently allow new research. Saved results remain available.'
    if not result['allowed'] and not payment['issue'] and row.price_matches and row.billing_anchor and row.observed_at and row.invoices_checked_at:
        ended = row.cancel_at_period_end and payment['paid_through'] and stamp >= payment['paid_through']
        failed = not payment['covered'] and ((row.subscription_status in {'past_due', 'unpaid'} and not payment['grace_until']) or (row.subscription_status in {'active', 'past_due', 'unpaid'} and payment['grace_until'] and stamp >= payment['grace_until']))
        if ended or failed:
            result['fallback_eligible'] = True
    return result


def resolve(db, user_id, settings=None):
    # Changes are staged in the caller's transaction. Read APIs commit them too.
    selected = policy(db, user_id)
    if not selected or selected.mode == 'complimentary':
        return _resolve_billing(db, user_id, settings)
    lock(db, user_id)
    result = _resolve_billing(db, user_id, settings)
    from app.models.subscription_access import FreeSubscription
    from app.models.subscription_access import SubscriptionAccountState as State
    stamp = now()
    state = db.get(State, user_id, populate_existing=True)
    free = db.get(FreeSubscription, user_id)
    if state is None:
        paid = db.get(SandboxCheckout, result['checkout_id']) if result['checkout_id'] else None
        anchor = paid.billing_anchor if paid and paid.billing_anchor else free.anchor if free else stamp
        state = State(user_id=user_id, allowance_anchor=anchor, preferred_digest_ids=[])
        db.add(state); db.flush()
    if result.get('fallback_eligible') or (state.fallback_since is not None and not result['allowed']):
        free = assign(db, user_id, state.allowance_anchor)
        plan = db.get(SubscriptionPlanRevision, free.plan_revision_id)
        result.update(allowed=True, billing_type='free', status='free', checkout_id=None,
            plan={'id': plan.id, 'name': plan.configuration['name'], 'configuration': plan.configuration},
            grace_until=None, access_until=None, fallback=True,
            reason='Free access applies because paid access has ended. Saved research is retained. Any outstanding payment and Stripe retries remain separate.')
    else:
        result['fallback'] = False
    result['period_start'], result['period_end'] = window(state.allowance_anchor, stamp)
    if result['allowed'] and result['billing_type']:
        kind = result['billing_type']
        if kind == 'free' and result['fallback'] and state.fallback_since is None:
            state.fallback_since = stamp
            enqueue(db, user_id, f'fallback:{user_id}:{stamp.isoformat()}', 'Free access is now active',
                'Paid access ended or payment grace expired. Your Free limits now apply. Saved research is retained, incompatible schedules are paused, and used allowance is preserved. Outstanding Stripe payments remain separate.')
        if kind == 'stripe':
            if state.fallback_since is not None:
                enqueue(db, user_id, f'recovery:{user_id}:{utc(state.fallback_since).isoformat()}', 'Paid access restored',
                    'Your paid access has been verified again. Used allowance is preserved. Review and explicitly save any paused schedule to resume future runs.')
            state.fallback_since = None
        state.effective_type = kind
    result['fallback_since'] = utc(state.fallback_since) if state.fallback_since else None
    if result['billing_type'] in {'free', 'stripe'} and result['allowed']:
        ids = free_digest_ids(db, user_id, state, result['plan']['configuration']['max_digests'], paid=result['billing_type'] == 'stripe')
        result['active_digest_ids'] = ids
        from app.models.subscription_change import SubscriptionChange
        changed_paid_plan = result['checkout_id'] and db.scalar(select(SubscriptionChange.id).where(
            SubscriptionChange.checkout_id == result['checkout_id'], SubscriptionChange.applied_at.is_not(None)).limit(1))
        # Pauses are latched only for Free fallback or an actual paid transition.
        # Ordinary pre-existing policy restrictions retain their previous deferral behavior.
        for digest in db.scalars(select(Digest).where(Digest.owner_id == user_id, Digest.schedule.is_not(None))):
            if not digest.schedule or (result['billing_type'] == 'stripe' and not changed_paid_plan):
                continue
            config = result['plan']['configuration']
            if (str(digest.id) not in ids or digest.maximum_papers > config['max_papers_per_run'] or digest.schedule['frequency'] not in config['schedule_frequencies']
                    or (digest.schedule.get('send_email') and not config['email_delivery'])):
                digest.schedule_paused = True
                digest.schedule_next_at = None
                digest.subscription_retry_at = None
    db.flush()
    return result


def free_digest_ids(db, user_id, state, limit, *, persist=True, paid=False):
    # Most recently used, then edited/created, with a deterministic ID tiebreaker.
    available = [str(uid) for uid in db.scalars(select(Digest.id).where(Digest.owner_id == user_id)
        .order_by(func.coalesce(Digest.latest_successful_run_at, Digest.updated_at).desc(), Digest.created_at.desc(), Digest.id))]
    attribute = 'paid_digest_ids' if paid else 'preferred_digest_ids'
    preferences = getattr(state, attribute) or []
    chosen = [uid for uid in preferences if uid in available][:limit]
    chosen += [uid for uid in available if uid not in chosen][:max(0, limit - len(chosen))]
    if persist and preferences != chosen:
        setattr(state, attribute, chosen)
    return chosen


def totals(db, user_id, access):
    query = select(
        func.coalesce(func.sum(case((Usage.state == 'settled', 1), else_=0)), 0),
        func.coalesce(func.sum(case((Usage.state == 'reserved', 1), else_=0)), 0),
        func.coalesce(func.sum(case((Usage.trigger == 'manual', 1), else_=0)), 0),
        func.coalesce(func.sum(case((Usage.state == 'settled', Usage.actual_papers), else_=0)), 0),
        func.coalesce(func.sum(case((Usage.state == 'reserved', Usage.requested_papers), else_=0)), 0)
    ).where(Usage.user_id == user_id, Usage.period_end > access['period_start'] if access['period_start'] else Usage.period_start.is_(None),
        Usage.period_start < access['period_end'] if access['period_end'] else Usage.period_end.is_(None), Usage.state.in_(['reserved', 'settled']))
    return dict(zip(['completed_runs', 'reserved_runs', 'manual_runs', 'completed_papers', 'reserved_papers'], map(int, db.execute(query).one())))


def overview(db, user_id, settings=None):
    access = resolve(db, user_id, settings)
    usage = totals(db, user_id, access)
    config = access['plan']['configuration'] if access['plan'] else None
    total_count = db.scalar(select(func.count()).select_from(Digest).where(Digest.owner_id == user_id))
    count = len(access['active_digest_ids']) if 'active_digest_ids' in access else total_count
    access['retained_digest_count'] = total_count
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


def assess(db, user_id, requested_papers, trigger='manual', schedule=None, settings=None, *, digest_id=None):
    access = resolve(db, user_id, settings)
    if access['mode'] == 'complimentary':
        return access, []
    if not access['allowed']:
        return access, [access['reason']]
    count = db.scalar(select(func.count()).select_from(Digest).where(Digest.owner_id == user_id))
    if 'active_digest_ids' in access:
        count = len(access['active_digest_ids'])
        if digest_id is not None and str(digest_id) not in access['active_digest_ids']:
            return access, ['This digest is inactive under your plan. Choose it in Subscription and usage to run research; saved results remain available.']
    if trigger == 'scheduled' and digest_id is not None and db.get(Digest, digest_id).schedule_paused:
        return access, ['This schedule is paused. Review and save it to resume from its next future occurrence.']
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
        from app.models.digest_email_delivery import DigestEmailDelivery
        from app.models.subscription_observation import ObservedRunUsage
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
    access, issues = assess(db, run.owner_id, run.digest_snapshot['maximum_papers'], str(run.trigger), context, settings, digest_id=run.digest_id)
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
    if mode == 'sandbox':
        assign(db, user_id, now())
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
        if 'active_digest_ids' in access:
            count = len(access['active_digest_ids'])
        if count >= config['max_digests']:
            raise AccessDenied('Digest limit reached. Delete an unused digest before creating another.')
    if requested_papers is not None and requested_papers > config['max_papers_per_run']:
        raise AccessDenied('Maximum papers exceeds the subscription per-run limit.')
    if schedule and (schedule['frequency'] not in config['schedule_frequencies'] or (schedule['send_email'] and not config['email_delivery'])):
        raise AccessDenied('The selected schedule frequency or email delivery is not included in this subscription.')
