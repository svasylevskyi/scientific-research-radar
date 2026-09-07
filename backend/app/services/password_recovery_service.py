from datetime import datetime, timedelta, timezone
from html import escape
import hashlib
import hmac
import logging
import secrets
from urllib.parse import urlsplit

from fastapi import HTTPException
from sqlalchemy import delete, select, update
from sqlalchemy.exc import IntegrityError

from app.core.security import hash_password, hash_token
from app.models.user import User
from app.models.email_verification import EmailVerification
from app.models.password_reset import PasswordReset, RecoveryRateLimit
from app.repositories.auth_session_repository import AuthSessionRepository
from app.services.email_service import EmailService, OutgoingEmail

logger = logging.getLogger(__name__)
RECOVERY_MESSAGE = "If an active account uses this email, we will send a password reset link. Check your inbox and spam folder."
INVALID_LINK = "This reset link is invalid or expired. Please request a new one."


def allowed(db, settings, scope, subject, limit, seconds):
    now = datetime.now(timezone.utc)
    bucket = int(now.timestamp()) // seconds
    key = hmac.new(settings.jwt_secret.encode(), f"{scope}:{subject}:{bucket}".encode(), hashlib.sha256).hexdigest()
    statement = update(RecoveryRateLimit).where(RecoveryRateLimit.key == key, RecoveryRateLimit.count < limit).values(count=RecoveryRateLimit.count + 1)
    if db.execute(statement).rowcount:
        db.commit()
        return True
    if db.get(RecoveryRateLimit, key):
        db.commit()
        return False
    try:
        with db.begin_nested():
            db.add(RecoveryRateLimit(key=key, count=1, expires_at=now + timedelta(seconds=seconds)))
            db.flush()
        db.commit()
        return True
    except IntegrityError:
        accepted = db.execute(statement).rowcount == 1
        db.commit()
        return accepted


def fingerprint(user):
    return hash_token(f"{user.password_hash}:{user.email}")


def send_recovery(session_factory, settings, email):
    """Runs after the generic HTTP response; no raw token is persisted or logged."""
    try:
        with session_factory() as db:
            user = db.scalar(select(User).where(User.email == email, User.is_active.is_(True)))
            if user is None:
                return
            now = datetime.now(timezone.utc)
            token = secrets.token_urlsafe(32)
            # Replacing a request invalidates its predecessor, even if the older email arrives later.
            db.execute(delete(PasswordReset).where(PasswordReset.user_id == user.id))
            db.add(PasswordReset(user_id=user.id, token_hash=hash_token(token), email=user.email,
                credential_fingerprint=fingerprint(user), expires_at=now + timedelta(minutes=30)))
            db.commit()
            base = settings.frontend_base_url
            if settings.environment == "production" and (urlsplit(base).scheme != "https" or urlsplit(base).hostname in ("localhost", "127.0.0.1", "::1")):
                raise ValueError("A public HTTPS FRONTEND_BASE_URL is required")
            link = f"{base}/reset-password#token={token}"
            text = f"Reset your Scientific Research Radar password using this link:\n\n{link}\n\nThis link expires in 30 minutes and can be used once. If you did not request it, ignore this email; your password has not changed."
            EmailService(settings).send(OutgoingEmail(recipient=email, subject="Reset your Radar password", text=text,
                html=f'<h1>Reset your password</h1><p><a href="{escape(link, quote=True)}">Choose a new password</a></p><p>This link expires in 30 minutes and can be used once.</p><p>If you did not request it, ignore this email. Your password has not changed.</p>'))
    except Exception:
        # Never expose request status or tokens through public responses or log exceptions containing mail bodies.
        logger.error("Password recovery email could not be prepared or delivered")


def reset_password(db, token, password):
    now = datetime.now(timezone.utc)
    token_hash = hash_token(token)
    reset = db.scalar(select(PasswordReset).where(PasswordReset.token_hash == token_hash))
    user = db.get(User, reset.user_id) if reset else None
    if not reset or not user or not user.is_active or fingerprint(user) != reset.credential_fingerprint:
        db.rollback()
        raise HTTPException(400, INVALID_LINK)
    new_hash = hash_password(password)
    consumed = db.execute(update(PasswordReset).where(PasswordReset.token_hash == token_hash,
        PasswordReset.consumed_at.is_(None), PasswordReset.expires_at > now).values(consumed_at=now),
        execution_options={"synchronize_session": False})
    if consumed.rowcount != 1:
        db.rollback()
        raise HTTPException(400, INVALID_LINK)
    changed = db.execute(update(User).where(User.id == user.id, User.is_active.is_(True),
        User.password_hash == user.password_hash, User.email == reset.email, User.auth_version == user.auth_version
    ).values(password_hash=new_hash, auth_version=User.auth_version + 1), execution_options={"synchronize_session": False})
    if changed.rowcount != 1:
        db.rollback()
        raise HTTPException(400, INVALID_LINK)
    AuthSessionRepository(db).revoke_all_for_user(user.id)
    db.execute(delete(EmailVerification).where(EmailVerification.user_id == user.id))
    db.commit()
    return reset.email


def notify_password_reset(settings, email):
    try:
        EmailService(settings).send(OutgoingEmail(recipient=email, subject="Your Radar password was changed",
            text="Your Scientific Research Radar password was reset and existing sessions were signed out. If you did not make this change, request password recovery immediately and secure your email account."))
    except Exception:
        logger.error("Password reset notification could not be delivered")


def cleanup_recovery(db):
    now = datetime.now(timezone.utc)
    db.execute(delete(PasswordReset).where(PasswordReset.expires_at <= now))
    db.execute(delete(RecoveryRateLimit).where(RecoveryRateLimit.expires_at <= now))
    db.commit()
