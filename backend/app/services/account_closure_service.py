"""Durable, irreversible closure shared by profile and administration.

Lock order: billing account → observation account → user → closure. Background
ticks hold the closure row while working; SKIP LOCKED lets other replicas proceed
without replaying the same task. Provider mutations are always read/verified on
retry, including after a process exits between Stripe's response and our commit.
"""
import asyncio
import logging
import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import delete, or_, select, update

from app.core.security import hash_password, verify_password
from app.db.base import Base
from app.models.account_closure import AccountClosure
from app.models.auth_session import AuthSession
from app.models.claim_review import ClaimReview
from app.models.contact_message import ContactMessage
from app.models.digest import Digest
from app.models.digest_run import DigestRun
from app.models.email_verification import EmailVerification
from app.models.password_reset import PasswordReset
from app.models.stripe_sandbox import SandboxCheckout
from app.models.user import User
from app.services.account_closure_billing import close_attempt, verify_checkout
from app.services.billing_provider import StripeSandboxClient
from app.services.email_service import EmailService, OutgoingEmail
from app.services.stripe_environment import ensure_database_mode

logger = logging.getLogger(__name__)


def now():
    return datetime.now(timezone.utc)


def request_closure(db, *, target_id: UUID, actor: User, password: str) -> AccountClosure:
    from app.services.stripe_sandbox_service import lock_account
    from app.services.subscription_observation_service import lock
    lock_account(db, target_id, allow_closing=True)
    lock(db, target_id)
    target = db.get(User, target_id, populate_existing=True, with_for_update=True)
    if target is None:
        raise HTTPException(404, "Account not found.")
    if target.is_super_admin:
        raise HTTPException(403, "The protected super-admin account cannot be closed.")
    if actor.id != target_id and actor.role != "admin":
        raise HTTPException(403, "Administrator access required.")
    # Re-read after locks, so concurrent password changes cannot authorize closure.
    actor = db.get(User, actor.id, populate_existing=True)
    if not actor or not actor.is_active or not verify_password(password, actor.password_hash):
        raise HTTPException(400, "Current password is incorrect or the account is inactive.")
    if actor.id != target_id and actor.role != "admin":
        raise HTTPException(403, "Administrator access required.")
    existing = db.get(AccountClosure, target_id)
    if existing:
        return existing
    stamp = now()
    closure = AccountClosure(user_id=target_id, requested_by=actor.id, requested_at=stamp,
        state="pending", attempts=0, next_attempt_at=stamp, billing_issues=[], unrelated_contact_ids=[],
        notification_email=target.email, notification_deadline=stamp + timedelta(days=7),
        notice_state="pending", notice_attempts=0, notice_next_at=stamp)
    closure.billing_issues = [{"kind": "contact_review", "reference": str(message_id)} for message_id in db.scalars(
        select(ContactMessage.id).where(ContactMessage.user_id.is_(None), ContactMessage.email == target.email,
                                        ContactMessage.created_at <= stamp))]
    target.closure_requested_at, target.is_active = stamp, False
    target.auth_version += 1
    db.add(closure)
    db.execute(update(AuthSession).where(AuthSession.user_id == target_id).values(revoked_at=stamp))
    db.execute(delete(EmailVerification).where(EmailVerification.user_id == target_id))
    db.execute(delete(PasswordReset).where(PasswordReset.user_id == target_id))
    db.execute(update(Digest).where(Digest.owner_id == target_id).values(
        schedule_paused=True, schedule_next_at=None, subscription_retry_at=None))
    db.commit()
    return closure


def require_closure(db, user_id):
    row = db.get(AccountClosure, user_id)
    if row is None:
        raise HTTPException(404, "No account closure was requested.")
    return row


def retry(db, user_id):
    row = db.get(AccountClosure, user_id, with_for_update=True)
    if row is None:
        raise HTTPException(404, "No account closure was requested.")
    if row.state != "completed":
        row.state, row.next_attempt_at, row.attempts = "pending", now(), 0
        row.last_error = None
    db.commit()
    return row


def recover_checkout(db, settings, user_id, payload):
    # This only binds a verified pre-existing object. It never creates a session.
    from app.services.stripe_sandbox_service import lock_account
    lock_account(db, user_id, allow_closing=True)
    row = require_closure(db, user_id)
    if row.state == "completed":
        raise HTTPException(409, "This closure is already complete.")
    attempt = db.get(SandboxCheckout, payload.attempt_id, with_for_update=True)
    if not attempt or attempt.user_id != user_id or attempt.checkout_id:
        raise HTTPException(409, "This is not an unresolved checkout for this account.")
    value = StripeSandboxClient(settings).request("GET", "checkout/sessions/" + payload.checkout_id)
    verify_checkout(value, attempt)
    if value.get("id") != payload.checkout_id:
        raise HTTPException(409, "Stripe returned a different checkout.")
    attempt.checkout_id = payload.checkout_id
    db.flush()
    return retry(db, user_id)


def active_work(db, user_id):
    run_ids = select(DigestRun.id).where(DigestRun.owner_id == user_id)
    running = db.scalar(select(DigestRun.id).where(DigestRun.owner_id == user_id,
        DigestRun.status == "running", DigestRun.lease_expires_at > now()).limit(1))
    reviewing = db.scalar(select(ClaimReview.id).where(
        or_(ClaimReview.run_id.in_(run_ids), ClaimReview.created_by == user_id),
        ClaimReview.active_key.is_not(None), ClaimReview.lease_until > now()).limit(1))
    return bool(running or reviewing)


def anonymous_contacts(db, user_id):
    row = require_closure(db, user_id)
    # Keep a bounded identity window for notices and legacy-contact review. New
    # authenticated submissions have an owner FK and are erased automatically.
    saved_ids = [UUID(item["reference"]) for item in row.billing_issues if item["kind"] == "contact_review"]
    identity_match = (ContactMessage.email == row.notification_email) if row.notification_email else False
    return list(db.scalars(select(ContactMessage).where(ContactMessage.user_id.is_(None),
        ContactMessage.id.not_in([UUID(value) for value in row.unrelated_contact_ids]),
        or_(identity_match, ContactMessage.id.in_(saved_ids)), ContactMessage.created_at <= row.requested_at)
        .order_by(ContactMessage.created_at, ContactMessage.id)))


def erase_personal_data(db, row):
    """Delete owned data and detach admin attribution, retaining billing identifiers
    only while external cancellation still needs them. A non-login tombstone lets
    admins inspect progress and prevents stale requests from restoring the account.
    """
    uid = row.user_id
    user = db.get(User, uid, with_for_update=True)
    assert user is not None
    # Case review content and published snapshots contain reviewer names as well
    # as attribution columns. Preserve the scientific review using a pseudonym.
    from app.services.account_closure_redaction import redact_admin_history
    redact_admin_history(db, uid)
    # Foreign-key ownership is the authoritative inventory; children cascade.
    # The queue and saved checkout IDs are needed until Stripe is resolved.
    retained = {"account_closures", "sandbox_checkouts", "sandbox_billing_accounts", "subscription_observation_accounts"}
    for table in reversed(Base.metadata.sorted_tables):
        if table.name in retained:
            continue
        for foreign_key in table.foreign_keys:
            if foreign_key.target_fullname != "users.id":
                continue
            column = foreign_key.parent
            if foreign_key.ondelete == "CASCADE":
                db.execute(delete(table).where(column == uid))
            elif foreign_key.ondelete == "SET NULL":
                db.execute(update(table).where(column == uid).values({column.name: None}))
    user.full_name = "Closed account"
    user.email = f"closed-{uid.hex}@accounts.example.com"
    user.password_hash = hash_password(secrets.token_urlsafe(48))
    user.role = "user"
    for attempt in db.scalars(select(SandboxCheckout).where(SandboxCheckout.user_id == uid)):
        attempt.parameters = {key: value for key, value in attempt.parameters.items() if key.startswith("metadata[") or key == "expires_at"}
        attempt.notification_state = {}
    row.data_removed_at = now()
    db.flush()


def process_one(factory, settings, *, client=None):
    from app.services.stripe_sandbox_service import lock_account
    from app.services.subscription_observation_service import lock
    with factory() as db:
        # Account locks precede the queue lock everywhere, including requests.
        uid = db.scalar(select(AccountClosure.user_id).where(
            AccountClosure.state.in_(["pending", "waiting"]), AccountClosure.next_attempt_at <= now())
            .order_by(AccountClosure.next_attempt_at).limit(1))
        if uid is None:
            return False
        lock_account(db, uid, allow_closing=True)
        lock(db, uid)
        row = db.scalar(select(AccountClosure).where(AccountClosure.user_id == uid,
            AccountClosure.state.in_(["pending", "waiting"]), AccountClosure.next_attempt_at <= now())
            .with_for_update(skip_locked=True))
        if row is None:
            return False
        ensure_database_mode(db, settings)
        row.attempts += 1
        contacts = [{"kind": "contact_review", "reference": str(message.id)} for message in anonymous_contacts(db, uid)]
        row.billing_issues = [issue for issue in row.billing_issues if issue["kind"] != "contact_review"] + contacts
        if not row.data_removed_at and not active_work(db, uid):
            try:
                with db.begin_nested():
                    erase_personal_data(db, row)
            except Exception:
                logger.warning("Account closure %s data removal needs review", uid)
                row.state, row.next_attempt_at = "needs_review", None
                row.last_error = "Data removal could not complete. An operator must inspect the closure worker before retrying."
                db.commit()
                return True
        # Erasure does not wait for a Stripe outage or unresolved payment. Keep
        # only checkout references and contact records needing ownership review.
        db.commit()
        lock_account(db, uid, allow_closing=True)
        lock(db, uid)
        row = db.get(AccountClosure, uid, populate_existing=True, with_for_update=True)
        if row.state not in {"pending", "waiting"}:
            return True
        try:
            issues = []
            attempts = list(db.scalars(select(SandboxCheckout).where(SandboxCheckout.user_id == uid)))
            if attempts:
                provider = client or StripeSandboxClient(settings)
                for attempt in attempts:
                    issues.extend(close_attempt(provider, attempt))
            issues.extend({"kind": "contact_review", "reference": str(message.id)} for message in anonymous_contacts(db, uid))
            row.billing_issues = issues
            billing_issues = [issue for issue in issues if issue["kind"] != "contact_review"]
            if not billing_issues:
                row.billing_resolved_at = row.billing_resolved_at or now()
            else:
                row.billing_resolved_at = None
            if active_work(db, uid):
                row.state, row.next_attempt_at = "waiting", now() + timedelta(seconds=30)
                row.last_error = "Waiting for an already-started research request to finish or its worker lease to expire."
            else:
                if not row.data_removed_at:
                    erase_personal_data(db, row)
                if issues:
                    row.state, row.next_attempt_at = "needs_review", None
                    row.last_error = "Resolve the listed items, then retry. Access is disabled; no new subscription requests will be submitted."
                else:
                    db.execute(delete(SandboxCheckout).where(SandboxCheckout.user_id == uid))
                    row.state, row.completed_at = "completed", now()
                    row.next_attempt_at, row.last_error, row.billing_issues = None, None, []
                    row.unrelated_contact_ids = []
                    if row.notification_email:
                        row.notice_state, row.notice_attempts, row.notice_next_at = "pending", 0, now()
            db.commit()
        except Exception:
            db.rollback()
            logger.warning("Account closure %s needs a billing retry", uid)
            # Do not expose provider payloads or exception text containing PII.
            lock_account(db, uid, allow_closing=True)
            row = db.get(AccountClosure, uid, populate_existing=True, with_for_update=True)
            row.last_error = "Billing verification failed. Check Stripe connectivity and permissions, then retry."
            row.state = "needs_review" if row.attempts >= 8 else "waiting"
            row.next_attempt_at = None if row.state == "needs_review" else now() + timedelta(seconds=min(3600, 30 * 2 ** row.attempts))
            db.commit()
        return True


def notify_one(factory, settings, *, sender=None):
    with factory() as db:
        row = db.scalar(select(AccountClosure).where(AccountClosure.notification_email.is_not(None),
            or_(AccountClosure.notice_next_at <= now(), AccountClosure.notification_deadline <= now()))
            .order_by(AccountClosure.requested_at).with_for_update(skip_locked=True).limit(1))
        if row is None:
            return False
        if row.notification_deadline <= now():
            row.notification_email, row.notice_next_at = None, None
            if row.notice_state != "sent":
                row.notice_state = "expired"
            db.commit()
            return True
        completed = row.state == "completed"
        phase = "completion" if completed else "acknowledgement"
        text = ("Your Radar account is closed. Your saved digests and personal profile have been removed, and any known Radar subscriptions have ended. "
                "Payment records may remain with Stripe for billing and legal purposes."
                if completed else "Your Radar account closure has been requested. Access and scheduled research are disabled. "
                "We are resolving billing and removing your data. We will notify you when this is complete.")
        text += "\n\nClosing an account does not automatically issue a refund. For a refund request or help, use " + settings.frontend_base_url + "/contact"
        text += "\nClosure reference: " + str(row.user_id)
        row.notice_attempts += 1
        try:
            (sender or EmailService(settings)).send(OutgoingEmail(recipient=row.notification_email,
                subject="Research Radar — " + ("Account closed" if completed else "Account closure requested"), text=text,
                message_id=f"<closure-{row.user_id}-{phase}@research-radar>"))
            row.notice_state, row.notice_next_at = "sent", None
            if completed:
                row.completion_sent_at, row.notification_email = now(), None
            else:
                row.acknowledgement_sent_at = now()
        except Exception:
            row.notice_state = "failed" if row.notice_attempts >= 8 else "retry"
            row.notice_next_at = None if row.notice_attempts >= 8 else now() + timedelta(minutes=2 ** row.notice_attempts)
        db.commit()
        return True


async def worker_loop(factory, settings):
    while True:
        try:
            await asyncio.to_thread(notify_one, factory, settings)
            await asyncio.to_thread(process_one, factory, settings)
        except Exception:
            logger.exception("Account closure worker tick failed")
        await asyncio.sleep(5)
