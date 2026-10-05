from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.models.contact_message import ContactMessage
from app.services.retention_service import CONTACT_MESSAGE_RETENTION_DAYS, cleanup_retained_records


def message(*, reviewed_at, retention_hold=False, suffix="ordinary"):
    return ContactMessage(
        name="Retention fixture",
        email=f"{suffix}@example.test",
        message=suffix,
        reviewed_at=reviewed_at,
        retention_hold=retention_hold,
    )


def test_cleanup_removes_only_old_reviewed_ordinary_messages(db_session_factory):
    current = datetime(2026, 10, 5, 12, 0, tzinfo=timezone.utc)
    old = current - timedelta(days=CONTACT_MESSAGE_RETENTION_DAYS, seconds=1)
    recent = current - timedelta(days=CONTACT_MESSAGE_RETENTION_DAYS - 1)

    with db_session_factory() as db:
        ordinary = message(reviewed_at=old, suffix="ordinary")
        held = message(reviewed_at=old, retention_hold=True, suffix="held")
        unreviewed = message(reviewed_at=None, suffix="unreviewed")
        fresh = message(reviewed_at=recent, suffix="fresh")
        db.add_all([ordinary, held, unreviewed, fresh])
        db.commit()
        ids = {row.message: row.id for row in (ordinary, held, unreviewed, fresh)}

        assert cleanup_retained_records(db, current=current) == 1
        remaining = set(db.scalars(select(ContactMessage.message)))
        assert remaining == {"held", "unreviewed", "fresh"}
        assert db.get(ContactMessage, ids["ordinary"]) is None


def test_cleanup_boundary_is_twelve_month_policy(db_session_factory):
    current = datetime(2026, 10, 5, 12, 0, tzinfo=timezone.utc)
    boundary = current - timedelta(days=CONTACT_MESSAGE_RETENTION_DAYS)
    with db_session_factory() as db:
        row = message(reviewed_at=boundary, suffix="boundary")
        db.add(row); db.commit()
        assert cleanup_retained_records(db, current=current) == 1
        assert db.get(ContactMessage, row.id) is None
