"""Minimized invoice observations; no card data, addresses or hosted invoice links."""
from datetime import datetime
from uuid import UUID
from sqlalchemy import DateTime, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base


class BillingInvoice(Base):
    __tablename__ = 'billing_invoices'
    __table_args__ = (Index('ix_billing_invoice_checkout_created', 'checkout_id', 'created_at'),)
    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    checkout_id: Mapped[UUID] = mapped_column(ForeignKey('sandbox_checkouts.id', ondelete='CASCADE'))
    status: Mapped[str] = mapped_column(String(30))
    currency: Mapped[str] = mapped_column(String(3))
    amount_due: Mapped[int]
    amount_paid: Mapped[int]
    amount_remaining: Mapped[int]
    attempt_count: Mapped[int]
    billing_reason: Mapped[str] = mapped_column(String(60))
    period_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    period_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    next_payment_attempt: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    issue: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
