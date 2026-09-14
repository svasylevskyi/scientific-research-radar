"""Immutable upgrade quotes and durable payment-dependent upgrade intents."""
from datetime import datetime
from uuid import UUID, uuid4
from sqlalchemy import DateTime, ForeignKey, Index, JSON, String
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base


class SubscriptionUpgrade(Base):
    __tablename__ = 'subscription_upgrades'
    __table_args__ = (Index('ix_subscription_upgrade_work', 'state', 'next_attempt_at'),)
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), index=True)
    checkout_id: Mapped[UUID] = mapped_column(ForeignKey('sandbox_checkouts.id', ondelete='CASCADE'), index=True)
    source_revision_id: Mapped[int] = mapped_column(ForeignKey('subscription_plan_revisions.id', ondelete='RESTRICT'))
    target_revision_id: Mapped[int] = mapped_column(ForeignKey('subscription_plan_revisions.id', ondelete='RESTRICT'))
    source_price_id: Mapped[str] = mapped_column(String(255))
    target_price_id: Mapped[str] = mapped_column(String(255))
    item_id: Mapped[str] = mapped_column(String(255))
    interval: Mapped[str] = mapped_column(String(10))
    source_invoice_id: Mapped[str] = mapped_column(String(255))
    invoice_id: Mapped[str | None] = mapped_column(String(255), unique=True)
    period_start: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    period_end: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    proration_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    applied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    pending_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    state: Mapped[str] = mapped_column(String(30), default='preview')
    quote: Mapped[dict] = mapped_column(JSON)
    parameters: Mapped[dict] = mapped_column(JSON)
    attempts: Mapped[int] = mapped_column(default=0)
    next_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_error: Mapped[str | None] = mapped_column(String(500))
