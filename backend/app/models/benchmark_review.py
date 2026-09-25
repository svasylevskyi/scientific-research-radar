"""Shared benchmark inputs, append-only human reviews and frozen publications."""

from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ResearchBenchmark(Base):
    __tablename__ = "research_benchmarks"

    id: Mapped[UUID] = mapped_column(primary_key=True)
    fingerprint: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    dataset: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    criteria: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_by: Mapped[UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_by_name: Mapped[str] = mapped_column(String(120), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class BenchmarkCaseReview(Base):
    __tablename__ = "benchmark_case_reviews"
    __table_args__ = (UniqueConstraint("benchmark_id", "case_id", "version", name="uq_benchmark_case_version"),)

    id: Mapped[UUID] = mapped_column(primary_key=True)
    benchmark_id: Mapped[UUID] = mapped_column(ForeignKey("research_benchmarks.id", ondelete="CASCADE"), nullable=False)
    case_id: Mapped[str] = mapped_column(String(120), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    state: Mapped[str] = mapped_column(String(20), nullable=False)
    content: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    created_by: Mapped[UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_by_name: Mapped[str] = mapped_column(String(120), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class BenchmarkCriteriaHistory(Base):
    __tablename__ = "benchmark_criteria_history"
    __table_args__ = (UniqueConstraint("benchmark_id", "revision", name="uq_benchmark_criteria_revision"),)

    id: Mapped[UUID] = mapped_column(primary_key=True)
    benchmark_id: Mapped[UUID] = mapped_column(ForeignKey("research_benchmarks.id", ondelete="CASCADE"), nullable=False)
    revision: Mapped[int] = mapped_column(Integer, nullable=False)
    criteria: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    created_by: Mapped[UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_by_name: Mapped[str] = mapped_column(String(120), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class BenchmarkPublication(Base):
    __tablename__ = "benchmark_publications"
    __table_args__ = (UniqueConstraint("benchmark_id", "number", name="uq_benchmark_publication_number"),)

    id: Mapped[UUID] = mapped_column(primary_key=True)
    benchmark_id: Mapped[UUID] = mapped_column(ForeignKey("research_benchmarks.id", ondelete="CASCADE"), nullable=False)
    number: Mapped[int] = mapped_column(Integer, nullable=False)
    source_revision: Mapped[int] = mapped_column(Integer, nullable=False)
    reviews: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    criteria: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    reason: Mapped[str] = mapped_column(String(2000), nullable=False)
    created_by: Mapped[UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_by_name: Mapped[str] = mapped_column(String(120), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
