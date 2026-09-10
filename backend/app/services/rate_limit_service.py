"""Atomic, shared fixed-window counters. Subjects are HMAC hashed, never stored raw."""
from datetime import datetime, timezone
import hashlib
import hmac
import math

from sqlalchemy import delete, update
from sqlalchemy.exc import IntegrityError

from app.models.rate_limit import RateLimitBucket


# Central policy: these count attempts, including successful ones. No permanent locks.
POLICIES = {
    "sandbox-billing-user": (20, 60),
    "api-ip": (1200, 60),
    "api-user": (600, 60),
    "login-ip": (60, 900),
    "login-email": (10, 900),
    "registration-ip": (20, 3600),
    "registration-email": (5, 3600),
    "verify-ip": (60, 900),
    "verify-challenge": (10, 900),
    "resend-ip": (20, 3600),
    "resend-challenge": (5, 3600),
    "email-change-user": (5, 3600),
    "password-change-user": (10, 900),
    "refresh-ip": (120, 60),
}


RECOVERY_POLICIES = {
    "request-ip": (20, 3600),
    "request-email-minute": (1, 60),
    "request-email-hour": (5, 3600),
    "reset-ip": (30, 900),
}


class RateLimitExceeded(Exception):
    def __init__(self, retry_after: int):
        self.retry_after = retry_after
        super().__init__(f"Too many requests. Please try again in {retry_after} seconds.")


def window_key(settings, scope, subject, seconds, now):
    bucket = int(now.timestamp()) // seconds
    deadline = datetime.fromtimestamp((bucket + 1) * seconds, timezone.utc)
    key = hmac.new(settings.jwt_secret.encode(), f"{scope}:{subject}:{bucket}".encode(), hashlib.sha256).hexdigest()
    return key, deadline


def run_allowance_available_at(db, settings, owner_id, now):
    """Read the same windows as enqueue without incrementing or reserving counters."""
    blocked_until = []
    for scope, limit, seconds in (("radar-hour", settings.radar_runs_per_hour, 3600),
                                   ("radar-day", settings.radar_runs_per_day, 86400)):
        key, deadline = window_key(settings, scope, str(owner_id), seconds, now)
        record = db.get(RateLimitBucket, key)
        if record is not None and record.count >= limit:
            blocked_until.append(deadline)
    return max(blocked_until) if blocked_until else None


def consume(db, settings, scope, subject, limit, seconds, *, commit=True):
    now = datetime.now(timezone.utc)
    key, deadline = window_key(settings, scope, subject, seconds, now)
    retry_after = max(1, math.ceil((deadline - now).total_seconds()))
    statement = update(RateLimitBucket).where(RateLimitBucket.key == key, RateLimitBucket.count < limit).values(count=RateLimitBucket.count + 1)
    accepted = db.execute(statement).rowcount == 1
    if not accepted and db.get(RateLimitBucket, key) is None:
        try:
            with db.begin_nested():
                db.add(RateLimitBucket(key=key, count=1, expires_at=deadline))
                db.flush()
            accepted = True
        except IntegrityError:
            accepted = db.execute(statement).rowcount == 1
    if commit:
        db.commit()
    return accepted, retry_after


def allowed(db, settings, scope, subject, limit, seconds):
    return consume(db, settings, scope, subject, limit, seconds)[0]


def enforce(db, settings, scope, subject, limit, seconds, *, commit=True):
    accepted, retry_after = consume(db, settings, scope, subject, limit, seconds, commit=commit)
    if not accepted:
        raise RateLimitExceeded(retry_after)


def cleanup_rate_limits(db):
    db.execute(delete(RateLimitBucket).where(RateLimitBucket.expires_at <= datetime.now(timezone.utc)))
    db.commit()
