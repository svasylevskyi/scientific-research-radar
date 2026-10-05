"""Approved retention cleanup for Radar-controlled live records."""
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.models.contact_message import ContactMessage

CONTACT_MESSAGE_RETENTION_DAYS = 365


def cleanup_retained_records(db: Session, *, current: datetime | None = None) -> int:
    """Delete ordinary reviewed contact messages after 12 months.

    Legal/accounting/privacy cases remain when an administrator has set the
    explicit retention hold. Unreviewed messages are never expired by this job.
    """
    current = current or datetime.now(timezone.utc)
    cutoff = current - timedelta(days=CONTACT_MESSAGE_RETENTION_DAYS)
    result = db.execute(
        delete(ContactMessage).where(
            ContactMessage.reviewed_at.is_not(None),
            ContactMessage.reviewed_at <= cutoff,
            ContactMessage.retention_hold.is_(False),
        )
    )
    db.commit()
    return result.rowcount or 0
