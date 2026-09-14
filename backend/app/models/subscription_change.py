"""Durable, immutable subscription change intents and transactional email outbox."""
from datetime import datetime, timezone
from uuid import UUID, uuid4
from sqlalchemy import DateTime, ForeignKey, Index, JSON, String
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base


class SubscriptionChange(Base):
    __tablename__ = 'subscription_changes'
    __table_args__ = (Index('ix_subscription_change_work', 'state', 'next_attempt_at'),)
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), index=True)
    checkout_id: Mapped[UUID] = mapped_column(ForeignKey('sandbox_checkouts.id', ondelete='CASCADE'), index=True)
    source_revision_id: Mapped[int] = mapped_column(ForeignKey('subscription_plan_revisions.id', ondelete='RESTRICT'))
    target_revision_id: Mapped[int] = mapped_column(ForeignKey('subscription_plan_revisions.id', ondelete='RESTRICT'))
    source_price_id: Mapped[str] = mapped_column(String(255))
    target_price_id: Mapped[str] = mapped_column(String(255))
    source_interval: Mapped[str] = mapped_column(String(10))
    target_interval: Mapped[str] = mapped_column(String(10))
    effective_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    state: Mapped[str] = mapped_column(String(30), default='preparing')
    schedule_id: Mapped[str | None] = mapped_column(String(255), unique=True)
    parameters: Mapped[dict] = mapped_column(JSON, default=dict)
    digest_ids: Mapped[list] = mapped_column(JSON, default=list)
    applied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_error: Mapped[str | None] = mapped_column(String(500))
    attempts: Mapped[int] = mapped_column(default=0)
    next_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class BillingNotification(Base):
    __tablename__ = 'billing_notifications'
    __table_args__ = (Index('ix_billing_notification_work', 'state', 'next_attempt_at'),)
    id: Mapped[str] = mapped_column(String(400), primary_key=True)
    user_id: Mapped[UUID] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), index=True)
    subject: Mapped[str] = mapped_column(String(200))
    text: Mapped[str] = mapped_column(String(4000))
    state: Mapped[str] = mapped_column(String(20), default='pending')
    attempts: Mapped[int] = mapped_column(default=0)
    next_attempt_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
