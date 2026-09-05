from datetime import date, datetime
from enum import StrEnum
from uuid import UUID

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Index, Integer, JSON, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class TargetAudience(StrEnum):
    RESEARCHERS = "researchers"
    BUILDERS_TECHNICAL_TEAMS = "builders_technical_teams"
    SCIENCE_COMMUNICATORS_EDUCATORS = "science_communicators_educators"
    EXECUTIVES_DECISION_MAKERS = "executives_decision_makers"
    GENERAL = "general"


class DigestFrequency(StrEnum):
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"


class Digest(Base):
    __tablename__ = "digests"
    __table_args__ = (
        CheckConstraint(
            "frequency IN ('daily', 'weekly', 'monthly', 'quarterly')",
            name="ck_digests_frequency",
        ),
        CheckConstraint(
            "maximum_papers BETWEEN 1 AND 30",
            name="ck_digests_maximum_papers",
        ),
        CheckConstraint(
            "reporting_from <= reporting_to",
            name="ck_digests_reporting_period",
        ),
        Index("idx_digests_owner_created_at", "owner_id", "created_at"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True)
    owner_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    topic: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(String(300))
    include_keywords: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    exclude_keywords: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    target_audience: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    reporting_from: Mapped[date] = mapped_column(Date, nullable=False)
    reporting_to: Mapped[date] = mapped_column(Date, nullable=False)
    frequency: Mapped[DigestFrequency] = mapped_column(String(16), nullable=False)
    maximum_papers: Mapped[int] = mapped_column(Integer, nullable=False, default=20)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    owner: Mapped["User"] = relationship(back_populates="digests")  # noqa: F821
