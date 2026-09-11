"""Durable sandbox synchronization; no billing writes, assignments or enforcement.

Claims are committed before work. A token and deadline fence every later commit.
Only minimized, signature-verified event data enters the inbox. Provider reads and
existing processed-event markers commit atomically with the inbox completion.
"""
import asyncio
import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4
from sqlalchemy import and_, exists, func, or_, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from app.models.billing_sync import BillingSyncHeartbeat, BillingSyncJob as Job
from app.models.stripe_sandbox import SandboxCheckout
from app.models.user import User
from app.services import stripe_sandbox_service as billing

LEASE_SECONDS = 120
logger = logging.getLogger(__name__)


def now():
    return datetime.now(timezone.utc)


def insert(db, model):
    return (pg_insert if db.bind.dialect.name == 'postgresql' else sqlite_insert)(model)


def job_values(checkout, job_id, kind, stamp, *, event_type=None, payload=None):
    return dict(id=job_id, checkout_id=checkout.id, user_id=checkout.user_id, kind=kind,
        event_type=event_type, payload=payload or {}, state='pending', attempts=0, failures=0,
        manual_retries=0, next_attempt_at=stamp, created_at=stamp)


def receive(db, settings, event):
    # Signature verification happens at the endpoint before this function.
    if event['type'] not in billing.EVENTS:
        return {'received': True, 'ignored': True}
    try:
        obj = event['data']['object']
        metadata = obj.get('metadata') or {}
        if metadata.get('radar_sandbox') != '1':
            return {'received': True, 'ignored': True}
        attempt_id = UUID(metadata.get('radar_attempt_id', ''))
        object_id = billing.identifier(obj.get('id'), 'sub_' if event['type'].startswith('customer.subscription.') else 'cs_test_')
    except (KeyError, TypeError, AttributeError, ValueError, billing.Error):
        raise billing.Error('Invalid sandbox event object.', 400) from None
    checkout = db.get(SandboxCheckout, attempt_id)
    if not checkout:
        return {'received': True, 'ignored': True}
    # No card/customer details or arbitrary provider fields are stored.
    minimal = {'id': event['id'], 'type': event['type'], 'data': {'object': {'id': object_id,
        'metadata': {'radar_attempt_id': str(attempt_id), 'radar_sandbox': '1'}}}}
    db.execute(insert(db, Job).values(**job_values(checkout, event['id'], 'webhook', now(),
        event_type=event['type'], payload=minimal)).on_conflict_do_nothing(index_elements=['id']))
    db.commit()  # Acknowledge only after durable persistence; duplicate IDs do not reset work.
    return {'received': True, 'queued': True}


def seed_reconciliation(db):
    stamp = now()
    # No full Stripe account scans. Reconcile every locally known attempt,
    # including historical ones, in bounded batches without starvation.
    missing = ~exists(select(Job.id).where(Job.checkout_id == SandboxCheckout.id, Job.kind == 'reconcile'))
    checkouts = list(db.scalars(select(SandboxCheckout).where(missing).order_by(SandboxCheckout.created_at, SandboxCheckout.id).limit(25)))
    for checkout in checkouts:
        db.execute(insert(db, Job).values(**job_values(checkout, 'reconcile:' + str(checkout.id), 'reconcile', stamp))
                   .on_conflict_do_nothing(index_elements=['id']))
    db.execute(insert(db, BillingSyncHeartbeat).values(id=1, last_seen_at=stamp)
        .on_conflict_do_update(index_elements=['id'], set_={'last_seen_at': stamp}))
    db.commit()


def due(stamp):
    return or_(and_(Job.state.in_(['pending', 'retry', 'processed']), Job.next_attempt_at <= stamp),
               and_(Job.state == 'processing', Job.lease_expires_at <= stamp))


def claim(db):
    stamp, token = now(), str(uuid4())
    # CAS works on both databases. A competing claimant simply tries next tick.
    candidate = db.scalar(select(Job.id).where(due(stamp))
        .order_by(func.coalesce(Job.next_attempt_at, Job.lease_expires_at), Job.created_at, Job.id).limit(1))
    if not candidate:
        return None
    changed = db.execute(update(Job).execution_options(synchronize_session=False).where(Job.id == candidate, due(stamp)).values(
        state='processing', lease_token=token, lease_expires_at=stamp + timedelta(seconds=LEASE_SECONDS),
        attempts=Job.attempts + 1, last_attempt_at=stamp))
    db.commit()
    return (candidate, token) if changed.rowcount == 1 else None


def owned(job_id, token):
    return and_(Job.id == job_id, Job.state == 'processing', Job.lease_token == token, Job.lease_expires_at > now())


def process(factory, settings, job_id, token, *, client=None):
    try:
        with factory() as db:
            # Lock the claim so another process cannot take it while applying data.
            if db.execute(update(Job).execution_options(synchronize_session=False).where(owned(job_id, token)).values(lease_token=token)).rowcount != 1:
                db.rollback()
                return False
            job = db.get(Job, job_id)
            checkout = db.get(SandboxCheckout, job.checkout_id)
            if job.kind == 'webhook':
                billing.handle_event(db, settings, job.payload, client=client, commit=False)
                following = None
            else:
                billing.lock_account(db, checkout.user_id)
                db.refresh(checkout)
                if not checkout.checkout_id and not checkout.subscription_id:
                    raise billing.Error('No Stripe identifier is saved. Resume the original checkout from Sandbox billing; do not create another attempt.', 409)
                billing.sync_attempt(db, client or billing.StripeSandboxClient(settings), checkout)
                terminal = checkout.subscription_status in billing.TERMINAL or (checkout.checkout_status == 'expired' and not checkout.subscription_id)
                following = None if terminal else now() + timedelta(seconds=settings.stripe_sync_reconcile_seconds)
            db.flush()
            changed = db.execute(update(Job).execution_options(synchronize_session=False).where(owned(job_id, token)).values(state='processed', failures=0,
                last_error=None, last_success_at=now(), next_attempt_at=following, lease_token=None, lease_expires_at=None))
            if changed.rowcount != 1:
                db.rollback()  # Includes checkout changes and processed-event marker.
                return False
            db.commit()
            return True
    except Exception as exc:
        # The failed transaction has already rolled back; persist retry metadata
        # separately, but only if this worker still owns the claim.
        message = str(exc)[:500] if isinstance(exc, billing.Error) else 'Synchronization failed internally. Retry or check the API service logs.'
        logger.warning('Sandbox billing synchronization failed for job %s (%s)', job_id, type(exc).__name__)
        with factory() as db:
            if db.execute(update(Job).execution_options(synchronize_session=False).where(owned(job_id, token)).values(lease_token=token)).rowcount != 1:
                db.rollback()
                return False
            job = db.get(Job, job_id)
            failures = job.failures + 1
            exhausted = failures >= settings.stripe_sync_max_failures
            db.execute(update(Job).execution_options(synchronize_session=False).where(owned(job_id, token)).values(
                failures=failures, state='failed' if exhausted else 'retry', last_error=message,
                next_attempt_at=None if exhausted else now() + timedelta(seconds=min(3600, 30 * 2 ** (failures - 1))),
                lease_token=None, lease_expires_at=None))
            db.commit()
        return False


def tick(factory, settings, *, client=None):
    with factory() as db:
        seed_reconciliation(db)
        claimed = claim(db)
    if claimed:
        process(factory, settings, *claimed, client=client)
    return claimed is not None


async def worker_loop(factory, settings):
    while True:
        try:
            worked = await asyncio.to_thread(tick, factory, settings)
        except Exception:
            logger.exception('Sandbox synchronization worker tick failed')
            worked = False
        await asyncio.sleep(0.1 if worked else settings.stripe_sync_poll_seconds)


def visible(actor):
    return True if actor.is_super_admin else User.is_super_admin.is_(False)


def overview(db, actor, *, user_id=None, state=None, offset=0, limit=25):
    filters = [visible(actor)]
    if user_id:
        filters.append(Job.user_id == user_id)
    base = select(Job).join(User, User.id == Job.user_id).where(*filters)
    counts = dict(db.execute(select(Job.state, func.count()).join(User, User.id == Job.user_id)
        .where(*filters).group_by(Job.state)).all())
    if state:
        base = base.where(Job.state == state)
    # Errors first, then processing, then other records by creation time.
    from sqlalchemy import case
    rows = db.execute(select(Job, User.email, SandboxCheckout.observed_at, SandboxCheckout.subscription_status, SandboxCheckout.price_matches).join(User, User.id == Job.user_id)
        .join(SandboxCheckout, SandboxCheckout.id == Job.checkout_id).where(*filters,
        *([Job.state == state] if state else [])).order_by(
        case((Job.state == 'failed', 0), (Job.state == 'retry', 1), (Job.state == 'processing', 2), else_=3),
        Job.created_at.desc(), Job.id).offset(offset).limit(limit)).all()
    heartbeat = db.get(BillingSyncHeartbeat, 1)
    last = billing.utc(heartbeat.last_seen_at) if heartbeat else None
    return {'mode': 'sandbox', 'counts': counts, 'worker_last_seen_at': last,
        'worker_healthy': bool(last and (now() - last).total_seconds() < LEASE_SECONDS * 2),
        'total': db.scalar(select(func.count()).select_from(base.subquery())),
        'items': [{**{name: billing.utc(value) if isinstance(value := getattr(job, name), datetime) else value
            for name in ('id', 'checkout_id', 'user_id', 'kind', 'event_type', 'state', 'attempts', 'failures',
                         'manual_retries', 'retried_by', 'retried_at', 'next_attempt_at', 'lease_expires_at',
                         'last_error', 'last_attempt_at', 'last_success_at', 'created_at')},
            'email': email, 'provider_observed_at': billing.utc(observed) if observed else None,
            'subscription_status': subscription_status, 'price_matches': price_matches}
            for job, email, observed, subscription_status, price_matches in rows]}


def retry(db, actor, job_id):
    job = db.scalar(select(Job).join(User, User.id == Job.user_id).where(Job.id == job_id, visible(actor)))
    if not job:
        raise billing.Error('Synchronization job not found.', 404)
    stamp = now()
    allowed = or_(Job.state.in_(['failed', 'retry']), and_(Job.kind == 'reconcile', Job.state == 'processed'),
                  and_(Job.state == 'processing', Job.lease_expires_at <= stamp))
    updated = db.execute(update(Job).execution_options(synchronize_session=False).where(Job.id == job_id, allowed).values(
        state='pending', failures=0, next_attempt_at=stamp, lease_token=None, lease_expires_at=None,
        manual_retries=Job.manual_retries + 1, retried_by=actor.id, retried_at=stamp))
    if updated.rowcount != 1:
        raise billing.Error('This job is already pending or processing, or this event has already completed.', 409)
    db.commit()
    return {'queued': True}
