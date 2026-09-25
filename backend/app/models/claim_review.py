"""Durable review jobs and a separate paid-request ledger."""
from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import Date, DateTime, ForeignKey, Integer, JSON, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ClaimReviewBudget(Base):
    __tablename__ = "claim_review_budget"
    id: Mapped[int] = mapped_column(primary_key=True)
    serial: Mapped[int] = mapped_column(default=0)
    day: Mapped[date] = mapped_column(Date)
    reserved_usd: Mapped[Decimal] = mapped_column(Numeric(14, 6), default=0)
    reserved_calls: Mapped[int] = mapped_column(default=0)


class ClaimReview(Base):
    __tablename__ = "claim_reviews"
    id: Mapped[UUID] = mapped_column(primary_key=True)  # Client's idempotency key.
    kind: Mapped[str] = mapped_column(String(20))
    run_id: Mapped[UUID | None] = mapped_column(ForeignKey("digest_runs.id", ondelete="CASCADE"), index=True)
    publication_id: Mapped[UUID | None] = mapped_column(ForeignKey("benchmark_publications.id", ondelete="CASCADE"), index=True)
    active_key: Mapped[str | None] = mapped_column(String(20), unique=True)
    status: Mapped[str] = mapped_column(String(20), default="queued")
    created_by: Mapped[UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_by_name: Mapped[str] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    lease_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    lease_token: Mapped[str | None] = mapped_column(String(36))
    settings_version: Mapped[int]
    config: Mapped[dict[str, Any]] = mapped_column(JSON)
    pricing: Mapped[dict[str, Any]] = mapped_column(JSON)
    prompt_version: Mapped[str] = mapped_column(String(40))
    input_sha256: Mapped[str] = mapped_column(String(64))
    inputs: Mapped[list[dict[str, Any]]] = mapped_column(JSON)
    total_claims: Mapped[int]
    reserved_usd: Mapped[Decimal] = mapped_column(Numeric(14, 6))
    context: Mapped[dict[str, Any]] = mapped_column(JSON)
    report: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    error: Mapped[str | None] = mapped_column(String(500))


class ClaimReviewRequest(Base):
    __tablename__ = "claim_review_requests"
    __table_args__ = (UniqueConstraint("review_id", "case_id", name="uq_claim_review_request_case"),)
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    review_id: Mapped[UUID] = mapped_column(ForeignKey("claim_reviews.id", ondelete="CASCADE"), index=True)
    case_id: Mapped[str] = mapped_column(String(120))
    response_id: Mapped[str | None] = mapped_column(String(255))
    model_name: Mapped[str] = mapped_column(String(100))
    reasoning_effort: Mapped[str] = mapped_column(String(20), default="low")
    status: Mapped[str] = mapped_column(String(30), default="submitted")
    outcome: Mapped[str] = mapped_column(String(30), default="unconfirmed")
    usage: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    web_search_calls: Mapped[int | None]
    service_tier: Mapped[str | None] = mapped_column(String(30))
    pricing: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    observed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    result: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    latency_seconds: Mapped[float | None]
