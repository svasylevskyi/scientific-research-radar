"""Durable closure progress. No passwords, Stripe payloads, or free-text reasons."""
from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class AccountClosure(Base):
    __tablename__ = "account_closures"

    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    requested_by: Mapped[UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    requested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    state: Mapped[str] = mapped_column(String(24), default="pending", index=True)
    attempts: Mapped[int] = mapped_column(default=0)
    next_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    last_error: Mapped[str | None] = mapped_column(String(500))
    billing_resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    data_removed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Minimal actionable references while billing is unresolved; erased on completion.
    billing_issues: Mapped[list[dict]] = mapped_column(JSON, default=list)
    unrelated_contact_ids: Mapped[list[str]] = mapped_column(JSON, default=list)
    notification_email: Mapped[str | None] = mapped_column(String(320))
    notification_deadline: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    notice_state: Mapped[str] = mapped_column(String(24), default="pending")
    notice_attempts: Mapped[int] = mapped_column(default=0)
    notice_next_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    acknowledgement_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completion_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
