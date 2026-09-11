from datetime import datetime, timezone
from uuid import UUID, uuid4
from sqlalchemy import DateTime, ForeignKey, JSON, String
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base


class SandboxBillingAccount(Base):
    __tablename__ = "sandbox_billing_accounts"
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    lock_version: Mapped[int] = mapped_column(default=0)


class SandboxCheckout(Base):
    __tablename__ = "sandbox_checkouts"
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    plan_revision_id: Mapped[int] = mapped_column(ForeignKey("subscription_plan_revisions.id", ondelete="RESTRICT"))
    interval: Mapped[str] = mapped_column(String(10))
    price_id: Mapped[str] = mapped_column(String(255))
    parameters: Mapped[dict] = mapped_column(JSON)
    checkout_id: Mapped[str | None] = mapped_column(String(255), unique=True)
    checkout_status: Mapped[str] = mapped_column(String(30), default="creating")
    subscription_id: Mapped[str | None] = mapped_column(String(255), unique=True)
    subscription_status: Mapped[str | None] = mapped_column(String(30))
    customer_id: Mapped[str | None] = mapped_column(String(255))
    cancel_at_period_end: Mapped[bool] = mapped_column(default=False)
    price_matches: Mapped[bool] = mapped_column(default=True)
    period_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    billing_anchor: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    delinquent_since: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    active_through: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    period_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    observed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class SandboxStripeEvent(Base):
    __tablename__ = "sandbox_stripe_events"
    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    checkout_id: Mapped[UUID] = mapped_column(ForeignKey("sandbox_checkouts.id", ondelete="CASCADE"))
    event_type: Mapped[str] = mapped_column(String(100))
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
