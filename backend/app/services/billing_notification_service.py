"""Transactional lifecycle notifications, delivered by the billing worker.

Deduplicated events; bounded SMTP retries with stable Message-ID. SMTP can accept
mail before a connection fails, so delivery is at-least-once, not exactly-once.
"""
from datetime import datetime, timedelta, timezone
import hashlib
import logging
from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from app.models.subscription_change import BillingNotification as Notice
from app.models.user import User
from app.services.email_service import EmailService, OutgoingEmail

logger = logging.getLogger(__name__)


def now():
    return datetime.now(timezone.utc)


def enqueue(db, uid, key, subject, text):
    insert = pg_insert if db.bind.dialect.name == 'postgresql' else sqlite_insert
    db.execute(insert(Notice).values(id=key, user_id=uid, subject=subject, text=text,
        state='pending', attempts=0, next_attempt_at=now(), created_at=now()).on_conflict_do_nothing(index_elements=['id']))


def capture(db, checkout, payment):
    previous = checkout.notification_state or {}
    sequence = previous.get('sequence', 0)
    cancel = bool(checkout.cancel_at_period_end)
    if checkout.subscription_status in {'canceled', 'incomplete_expired'}:
        enqueue(db, checkout.user_id, f'ended:{checkout.id}', 'Paid subscription ended',
            'Your paid subscription has ended. Review your Free access and retained research in Subscription and usage.')
    elif cancel != previous.get('cancel', False):
        sequence += 1
        label = 'Cancellation scheduled' if cancel else 'Cancellation withdrawn'
        enqueue(db, checkout.user_id, f'cancel:{checkout.id}:{sequence}', label,
            ('Renewal is cancelled. Paid access continues until ' + str(checkout.period_end) + '. Free access then applies; saved research is retained.'
             if cancel else 'Your cancellation was withdrawn. Your subscription will renew unless you cancel again.'))
    from app.models.billing_invoice import BillingInvoice
    invoice = db.get(BillingInvoice, checkout.latest_invoice_id) if checkout.latest_invoice_id else None
    if payment['status'] == 'open' and not payment['issue'] and invoice and invoice.attempt_count > 0:
        enqueue(db, checkout.user_id, f'payment:{checkout.latest_invoice_id}', 'Subscription payment needs attention',
            'Your subscription payment has not completed. Review your payment method in Manage billing.'
            + (f" Grace ends {payment['grace_until'].isoformat()}; Free access applies afterward." if payment['grace_until'] else ' Paid benefits require verified payment.')
            + ' Your saved research remains available.')
    checkout.notification_state = {'cancel': cancel, 'sequence': sequence}


def tick(factory, settings):
    stamp = now()
    with factory() as db:
        # Atomic claim, with expiry for recovery after worker termination.
        row = db.scalar(select(Notice).where(Notice.state.in_(['pending', 'sending']), Notice.next_attempt_at <= stamp)
            .order_by(Notice.next_attempt_at, Notice.id).limit(1))
        if not row:
            return False
        key = row.id
        lease = stamp + timedelta(minutes=5)
        changed = db.execute(update(Notice).execution_options(synchronize_session=False).where(Notice.id == key, Notice.state.in_(['pending', 'sending']), Notice.next_attempt_at <= stamp)
            .values(state='sending', next_attempt_at=lease, attempts=Notice.attempts + 1))
        if changed.rowcount != 1:
            db.rollback()
            return False
        db.commit()
        db.refresh(row)
        user = db.get(User, row.user_id)
        if not user:
            return False
        message = OutgoingEmail(recipient=user.email, subject='Research Radar — ' + row.subject,
            text=row.text + '\n\nReview your subscription: ' + settings.frontend_base_url + '/subscription',
            message_id='<billing-' + hashlib.sha256(key.encode()).hexdigest() + '@research-radar>')
        attempts = row.attempts
    try:
        EmailService(settings).send(message)
        values = dict(state='sent', sent_at=now())
    except Exception:
        logger.warning('Billing notification delivery failed for %s', key)
        values = dict(state='failed' if attempts >= 8 else 'pending',
            next_attempt_at=now() + timedelta(seconds=min(3600, 30 * 2 ** attempts)))
    with factory() as db:
        db.execute(update(Notice).execution_options(synchronize_session=False).where(Notice.id == key, Notice.state == 'sending', Notice.next_attempt_at == lease).values(**values))
        db.commit()
    return True
