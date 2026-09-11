from datetime import datetime, timezone
from uuid import UUID
from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, JSON, String
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base


class BillingSyncJob(Base):
    __tablename__ = 'billing_sync_jobs'
    __table_args__ = (
        CheckConstraint("kind IN ('webhook', 'reconcile')", name='ck_billing_sync_kind'),
        CheckConstraint("state IN ('pending', 'processing', 'retry', 'failed', 'processed')", name='ck_billing_sync_state'),
        Index('ix_billing_sync_due', 'state', 'next_attempt_at'),
    )
    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    checkout_id: Mapped[UUID] = mapped_column(ForeignKey('sandbox_checkouts.id', ondelete='CASCADE'), index=True)
    user_id: Mapped[UUID] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), index=True)
    kind: Mapped[str] = mapped_column(String(16))
    event_type: Mapped[str | None] = mapped_column(String(100))
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    state: Mapped[str] = mapped_column(String(16), default='pending')
    attempts: Mapped[int] = mapped_column(default=0)
    failures: Mapped[int] = mapped_column(default=0)
    manual_retries: Mapped[int] = mapped_column(default=0)
    retried_by: Mapped[UUID | None] = mapped_column(ForeignKey('users.id', ondelete='SET NULL'))
    retried_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    next_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    lease_token: Mapped[str | None] = mapped_column(String(36))
    lease_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_error: Mapped[str | None] = mapped_column(String(500))
    last_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_success_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class BillingSyncHeartbeat(Base):
    __tablename__ = 'billing_sync_heartbeat'
    id: Mapped[int] = mapped_column(primary_key=True)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
