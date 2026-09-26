"""Immutable per-run evidence and a shared metadata cache/provider throttle."""
from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, JSON, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class SourceVerification(Base):
    __tablename__ = "source_verifications"
    __table_args__ = (
        CheckConstraint("trigger IN ('automatic', 'manual')", name="ck_source_verification_trigger"),
        Index("idx_source_verifications_run_created", "run_id", "created_at"),
        Index("uq_source_verification_automatic", "run_id", unique=True,
              postgresql_where=text("trigger = 'automatic'")),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True)
    run_id: Mapped[UUID] = mapped_column(ForeignKey("digest_runs.id", ondelete="CASCADE"), nullable=False)
    trigger: Mapped[str] = mapped_column(String(16), nullable=False)
    created_by: Mapped[UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_by_name: Mapped[str] = mapped_column(String(120), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    engine_version: Mapped[str] = mapped_column(String(20), nullable=False)
    config: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    papers: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False)
    findings: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False)


class SourceMetadataCache(Base):
    __tablename__ = "source_metadata_cache"
    key: Mapped[str] = mapped_column(String(240), primary_key=True)
    data: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class SourceProviderState(Base):
    __tablename__ = "source_provider_state"
    provider: Mapped[str] = mapped_column(String(20), primary_key=True)
    available_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    lease_token: Mapped[str | None] = mapped_column(String(36))
    content_window_started: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    content_requests: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
