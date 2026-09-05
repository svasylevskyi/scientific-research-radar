from datetime import date, datetime
from enum import StrEnum
from typing import Any
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class DigestRunStatus(StrEnum):
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class DigestRunTrigger(StrEnum):
    MANUAL = "manual"
    SCHEDULED = "scheduled"


class DigestRun(Base):
    __tablename__ = "digest_runs"
    __table_args__ = (
        CheckConstraint(
            "status IN ('running', 'completed', 'failed')",
            name="ck_digest_runs_status",
        ),
        CheckConstraint(
            "trigger IN ('manual', 'scheduled')",
            name="ck_digest_runs_trigger",
        ),
        Index("idx_digest_runs_digest_created_at", "digest_id", "created_at"),
        Index("idx_digest_runs_status", "status"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True)
    digest_id: Mapped[UUID] = mapped_column(
        ForeignKey("digests.id", ondelete="CASCADE"), nullable=False
    )
    status: Mapped[DigestRunStatus] = mapped_column(String(16), nullable=False)
    trigger: Mapped[DigestRunTrigger] = mapped_column(String(16), nullable=False)
    digest_snapshot: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    history_context: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False)
    search_data: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    relevance_data: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    model_name: Mapped[str] = mapped_column(String(100), nullable=False)
    prompt_version: Mapped[str] = mapped_column(String(50), nullable=False)
    openai_response_id: Mapped[str | None] = mapped_column(String(255))
    error_message: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    digest: Mapped["Digest"] = relationship(back_populates="runs")  # noqa: F821
    paper_results: Mapped[list["DigestRunPaper"]] = relationship(
        back_populates="run",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="DigestRunPaper.rank",
    )
    trend_analysis: Mapped["DigestRunTrendAnalysis | None"] = relationship(
        back_populates="run",
        cascade="all, delete-orphan",
        passive_deletes=True,
        uselist=False,
    )
    briefing: Mapped["DigestRunBriefing | None"] = relationship(
        back_populates="run",
        cascade="all, delete-orphan",
        passive_deletes=True,
        uselist=False,
    )

    @property
    def paper_count(self) -> int:
        return len(self.paper_results)


class Paper(Base):
    __tablename__ = "papers"
    __table_args__ = (
        UniqueConstraint(
            "source_name", "external_id", name="uq_papers_source_external_id"
        ),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True)
    source_name: Mapped[str] = mapped_column(String(100), nullable=False)
    external_id: Mapped[str] = mapped_column(String(255), nullable=False)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    authors: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    abstract: Mapped[str | None] = mapped_column(Text)
    published_date: Mapped[date | None] = mapped_column(Date)
    url: Mapped[str] = mapped_column(String(1000), nullable=False)
    doi: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    run_results: Mapped[list["DigestRunPaper"]] = relationship(
        back_populates="paper"
    )


class DigestRunPaper(Base):
    __tablename__ = "digest_run_papers"
    __table_args__ = (
        UniqueConstraint("run_id", "paper_id", name="uq_digest_run_papers_run_paper"),
        CheckConstraint(
            "relevance_score BETWEEN 0 AND 100",
            name="ck_digest_run_papers_relevance_score",
        ),
        CheckConstraint("rank >= 1", name="ck_digest_run_papers_rank"),
        Index("idx_digest_run_papers_run_rank", "run_id", "rank"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True)
    run_id: Mapped[UUID] = mapped_column(
        ForeignKey("digest_runs.id", ondelete="CASCADE"), nullable=False
    )
    paper_id: Mapped[UUID] = mapped_column(
        ForeignKey("papers.id", ondelete="RESTRICT"), nullable=False
    )
    rank: Mapped[int] = mapped_column(Integer, nullable=False)
    relevance_score: Mapped[float] = mapped_column(Float, nullable=False)
    search_data: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    relevance_data: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    summary_data: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    run: Mapped[DigestRun] = relationship(back_populates="paper_results")
    paper: Mapped[Paper] = relationship(back_populates="run_results")


class DigestRunTrendAnalysis(Base):
    __tablename__ = "digest_run_trend_analyses"

    id: Mapped[UUID] = mapped_column(primary_key=True)
    run_id: Mapped[UUID] = mapped_column(
        ForeignKey("digest_runs.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    overview: Mapped[str] = mapped_column(Text, nullable=False)
    data: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    run: Mapped[DigestRun] = relationship(back_populates="trend_analysis")


class DigestRunBriefing(Base):
    __tablename__ = "digest_run_briefings"

    id: Mapped[UUID] = mapped_column(primary_key=True)
    run_id: Mapped[UUID] = mapped_column(
        ForeignKey("digest_runs.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    executive_summary: Mapped[str] = mapped_column(Text, nullable=False)
    content_markdown: Mapped[str] = mapped_column(Text, nullable=False)
    data: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    run: Mapped[DigestRun] = relationship(back_populates="briefing")
