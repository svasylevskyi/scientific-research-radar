"""Sandbox access policy and billing-window usage, separate from observation history."""
from datetime import datetime, timezone
from uuid import UUID
from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, JSON, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base


def now():
    return datetime.now(timezone.utc)


class SubscriptionAccessPolicy(Base):
    __tablename__ = 'subscription_access_policies'
    __table_args__ = (UniqueConstraint('user_id', 'version', name='uq_access_policy_version'),
        CheckConstraint("mode IN ('complimentary', 'sandbox')", name='ck_access_policy_mode'))
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[UUID] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), index=True)
    version: Mapped[int]
    mode: Mapped[str] = mapped_column(String(20))
    created_by: Mapped[UUID | None] = mapped_column(ForeignKey('users.id', ondelete='SET NULL'))
    change_note: Mapped[str] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class SubscriptionRunUsage(Base):
    __tablename__ = 'subscription_run_usage'
    __table_args__ = (Index('ix_access_usage_window', 'user_id', 'checkout_id', 'period_start'),
        CheckConstraint("state IN ('reserved', 'settled', 'released')", name='ck_access_usage_state'),
        CheckConstraint('requested_papers >= 0 AND actual_papers >= 0', name='ck_access_usage_counts'))
    run_key: Mapped[UUID] = mapped_column(primary_key=True)
    run_id: Mapped[UUID | None] = mapped_column(ForeignKey('digest_runs.id', ondelete='SET NULL'))
    user_id: Mapped[UUID] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'))
    checkout_id: Mapped[UUID] = mapped_column(ForeignKey('sandbox_checkouts.id', ondelete='CASCADE'))
    plan_revision_id: Mapped[int] = mapped_column(ForeignKey('subscription_plan_revisions.id', ondelete='RESTRICT'))
    period_start: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    period_end: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    trigger: Mapped[str] = mapped_column(String(16))
    state: Mapped[str] = mapped_column(String(16))
    requested_papers: Mapped[int]
    actual_papers: Mapped[int] = mapped_column(default=0)
    request_context: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
