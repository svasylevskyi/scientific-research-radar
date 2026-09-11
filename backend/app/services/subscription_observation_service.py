"""Monthly observation ledger; caller owns the transaction. Never denies a run.

The shared account lock serializes assignments and ledger transitions on both
supported databases. Run uniqueness and run-state transitions remain in runner.
No Stripe state is consumed or changed by this module.
"""
from datetime import date, datetime, timezone
from sqlalchemy import case, func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from app.models.subscription_observation import ObservationAccount, ObservationAssignment, ObservedRunUsage
from app.models.subscription_plan import SubscriptionPlanRevision
from app.models.digest import Digest
from app.models.digest_run import DigestRunPaper


class ObservationError(ValueError):
    def __init__(self, message, status=422):
        super().__init__(message)
        self.status = status


def now():
    return datetime.now(timezone.utc)


def utc(value):
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def month(value):
    return utc(value).date().replace(day=1)


def next_month(value):
    return date(value.year + (value.month == 12), value.month % 12 + 1, 1)


def lock(db, user_id):
    insert = pg_insert if db.bind.dialect.name == 'postgresql' else sqlite_insert
    db.execute(insert(ObservationAccount).values(user_id=user_id, version=0, lock_version=0, tracking_since=now()).on_conflict_do_nothing())
    db.execute(update(ObservationAccount).where(ObservationAccount.user_id == user_id)
               .values(lock_version=ObservationAccount.lock_version + 1))
    return db.scalar(select(ObservationAccount).where(ObservationAccount.user_id == user_id).execution_options(populate_existing=True))


def current_assignment(db, user_id):
    return db.scalar(select(ObservationAssignment).where(ObservationAssignment.user_id == user_id)
                     .order_by(ObservationAssignment.version.desc()).limit(1))


def plan_for(db, assignment):
    return db.get(SubscriptionPlanRevision, assignment.plan_revision_id) if assignment and assignment.plan_revision_id else None


def assignment_read(db, row):
    plan = plan_for(db, row)
    return {'id': row.id if row else None, 'version': row.version if row else 0,
        'mode': 'plan_observation' if plan else 'complimentary',
        'plan': {'id': plan.id, 'code': plan.code, 'revision': plan.revision, 'configuration': plan.configuration} if plan else None,
        'created_by': row.created_by if row else None, 'change_note': row.change_note if row else 'Complimentary development access',
        'created_at': utc(row.created_at) if row else None}


def assign(db, user_id, actor_id, plan_revision_id, expected_version, note):
    account = lock(db, user_id)
    if account.version != expected_version:
        raise ObservationError('The assignment changed. Reload and review before saving.', 409)
    if plan_revision_id is not None:
        plan = db.get(SubscriptionPlanRevision, plan_revision_id)
        if not plan or plan.configuration['state'] == 'archived':
            raise ObservationError('Select an existing, non-archived plan revision.')
    row = ObservationAssignment(user_id=user_id, version=account.version + 1,
        plan_revision_id=plan_revision_id, created_by=actor_id, change_note=note)
    db.add(row)
    account.version += 1
    db.flush()
    return assignment_read(db, row)


def totals(db, user_id, period):
    values = db.execute(select(
        func.coalesce(func.sum(case((ObservedRunUsage.state == 'settled', 1), else_=0)), 0),
        func.coalesce(func.sum(case((ObservedRunUsage.state == 'reserved', 1), else_=0)), 0),
        func.coalesce(func.sum(case(((ObservedRunUsage.state.in_(['settled', 'reserved'])) & (ObservedRunUsage.trigger == 'manual'), 1), else_=0)), 0),
        func.coalesce(func.sum(case((ObservedRunUsage.state == 'settled', ObservedRunUsage.actual_papers), else_=0)), 0),
        func.coalesce(func.sum(case((ObservedRunUsage.state == 'reserved', ObservedRunUsage.requested_papers), else_=0)), 0),
        func.coalesce(func.sum(case((ObservedRunUsage.state == 'released', 1), else_=0)), 0),
    ).where(ObservedRunUsage.user_id == user_id, ObservedRunUsage.period_start == period)).one()
    return dict(zip(['completed_runs', 'reserved_runs', 'manual_runs', 'completed_papers', 'reserved_papers', 'released_runs'], map(int, values)))


def reasons(config, usage, *, requested_papers, trigger, digest_count, frequency=None, email=False):
    if not config:
        return []
    checks = [
        (usage['completed_runs'] + usage['reserved_runs'] + 1 > config['runs_per_month'], 'Monthly run allowance would be exceeded'),
        (trigger == 'manual' and usage['manual_runs'] + 1 > config['manual_runs_per_month'], 'Monthly manual-run allowance would be exceeded'),
        (usage['completed_papers'] + usage['reserved_papers'] + requested_papers > config['papers_per_month'], 'Monthly paper allowance would be exceeded'),
        (requested_papers > config['max_papers_per_run'], 'Requested papers exceed the per-run limit'),
        (digest_count > config['max_digests'], 'Existing digest count exceeds the plan limit'),
        (trigger == 'scheduled' and frequency not in config['schedule_frequencies'], 'Schedule frequency is not included in the plan'),
        (email and not config['email_delivery'], 'Email delivery is not included in the plan'),
    ]
    return [message for applies, message in checks if applies]


def reserve(db, run, *, schedule=None):
    lock(db, run.owner_id)
    row = db.get(ObservedRunUsage, run.id, populate_existing=True)
    if row and row.state != 'released':
        return  # Same enqueue or already settled: never double reserve/charge.
    stamp = now()
    if row is None:
        assignment = current_assignment(db, run.owner_id)
        row = ObservedRunUsage(run_key=run.id, run_id=run.id, digest_id=run.digest_id, user_id=run.owner_id,
            assignment_id=assignment.id if assignment else None, topic=run.digest_snapshot['topic'],
            period_start=month(stamp), trigger=run.trigger, state='released',
            requested_papers=run.digest_snapshot['maximum_papers'], actual_papers=0, attempts=1, assessments=[])
        # A retry of a pre-deployment run is first observed now, without guessing old usage.
        db.add(row)
    else:
        assignment = db.get(ObservationAssignment, row.assignment_id) if row.assignment_id else None
        row.attempts += 1
    plan = plan_for(db, assignment)
    usage = totals(db, run.owner_id, row.period_start)
    count = db.scalar(select(func.count()).select_from(Digest).where(Digest.owner_id == run.owner_id))
    context = row.assessments[0]['request_context'] if row.assessments else {
        'frequency': (schedule or {}).get('frequency'), 'email': bool((schedule or {}).get('send_email')) and row.trigger == 'scheduled'}
    assessed = reasons(plan.configuration if plan else None, usage, requested_papers=row.requested_papers,
        trigger=row.trigger, digest_count=count, frequency=context['frequency'], email=context['email'])
    row.assessments = [*row.assessments, {'at': stamp.isoformat(), 'reasons': assessed, 'would_block': bool(assessed), 'request_context': context}]
    row.state = 'reserved'
    row.updated_at = stamp
    db.flush()


def settle(db, run, *, success):
    lock(db, run.owner_id)
    row = db.get(ObservedRunUsage, run.id, populate_existing=True)
    if row is None or row.state != 'reserved':
        return  # Pre-deployment run or repeated worker completion.
    db.flush()  # Include newly saved summaries in the count, without committing.
    row.actual_papers = sum(isinstance(value, dict) and bool(value) for value in db.scalars(
        select(DigestRunPaper.summary_data).where(DigestRunPaper.run_id == run.id)))
    row.state = 'settled' if success else 'released'
    row.updated_at = now()
    db.flush()


def overview(db, user_id, period=None, offset=0, limit=25):
    period = period or month(now())
    account = db.get(ObservationAccount, user_id)
    assignment = current_assignment(db, user_id)
    plan = plan_for(db, assignment)
    usage = totals(db, user_id, period)
    config = plan.configuration if plan else None
    count = db.scalar(select(func.count()).select_from(Digest).where(Digest.owner_id == user_id))
    def remaining(key, used):
        return max(0, config[key] - used) if config else None
    entries = select(ObservedRunUsage).where(ObservedRunUsage.user_id == user_id, ObservedRunUsage.period_start == period)
    rows = list(db.scalars(entries.order_by(ObservedRunUsage.created_at.desc(), ObservedRunUsage.run_key).offset(offset).limit(limit)))
    return {'mode': 'observation_only', 'access': 'complimentary_development',
        'tracking_since': utc(account.tracking_since) if account else None,
        'period_start': period, 'period_end': next_month(period),
        'assignment': assignment_read(db, assignment), 'usage': usage, 'digest_count': count,
        'remaining': {'runs': remaining('runs_per_month', usage['completed_runs'] + usage['reserved_runs']),
            'manual_runs': remaining('manual_runs_per_month', usage['manual_runs']),
            'papers': remaining('papers_per_month', usage['completed_papers'] + usage['reserved_papers']),
            'digests': remaining('max_digests', count)},
        'total': db.scalar(select(func.count()).select_from(entries.subquery())),
        'items': [{'run_key': row.run_key, 'run_id': row.run_id, 'digest_id': row.digest_id, 'topic': row.topic,
            'state': row.state, 'trigger': row.trigger, 'requested_papers': row.requested_papers, 'actual_papers': row.actual_papers,
            'attempts': row.attempts, 'assignment_id': row.assignment_id, 'assessments': row.assessments,
            'created_at': utc(row.created_at), 'updated_at': utc(row.updated_at)} for row in rows]}
