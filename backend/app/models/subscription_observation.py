"""Observation-only assignments and usage; never a billing entitlement."""
from datetime import date, datetime, timezone
from uuid import UUID
from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Index, JSON, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base


def now():
    return datetime.now(timezone.utc)


class ObservationAccount(Base):
    __tablename__ = 'subscription_observation_accounts'
    user_id: Mapped[UUID] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), primary_key=True)
    version: Mapped[int] = mapped_column(default=0)
    lock_version: Mapped[int] = mapped_column(default=0)
    tracking_since: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class ObservationAssignment(Base):
    __tablename__ = 'subscription_observation_assignments'
    __table_args__ = (UniqueConstraint('user_id', 'version', name='uq_observation_assignment_version'),)
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[UUID] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), index=True)
    version: Mapped[int]
    plan_revision_id: Mapped[int | None] = mapped_column(ForeignKey('subscription_plan_revisions.id', ondelete='RESTRICT'))
    created_by: Mapped[UUID | None] = mapped_column(ForeignKey('users.id', ondelete='SET NULL'))
    change_note: Mapped[str] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class ObservedRunUsage(Base):
    __tablename__ = 'subscription_observed_runs'
    __table_args__ = (
        CheckConstraint("state IN ('reserved', 'settled', 'released')", name='ck_observed_run_state'),
        CheckConstraint('requested_papers >= 0 AND actual_papers >= 0 AND attempts >= 1', name='ck_observed_run_counts'),
        Index('ix_observed_user_period', 'user_id', 'period_start'),
    )
    run_key: Mapped[UUID] = mapped_column(primary_key=True)  # Stable even if a digest/run is deleted.
    run_id: Mapped[UUID | None] = mapped_column(ForeignKey('digest_runs.id', ondelete='SET NULL'))
    digest_id: Mapped[UUID | None] = mapped_column(ForeignKey('digests.id', ondelete='SET NULL'))
    user_id: Mapped[UUID] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'))
    assignment_id: Mapped[int | None] = mapped_column(ForeignKey('subscription_observation_assignments.id', ondelete='SET NULL'))
    topic: Mapped[str] = mapped_column(String(200))
    period_start: Mapped[date] = mapped_column(Date)
    trigger: Mapped[str] = mapped_column(String(16))
    state: Mapped[str] = mapped_column(String(16))
    requested_papers: Mapped[int]
    actual_papers: Mapped[int] = mapped_column(default=0)
    attempts: Mapped[int] = mapped_column(default=1)
    # One small immutable assessment per accepted enqueue/retry, not provider request.
    assessments: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
