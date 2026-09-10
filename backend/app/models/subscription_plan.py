from datetime import datetime, timezone
from uuid import UUID
from sqlalchemy import DateTime, ForeignKey, JSON, String, UniqueConstraint, CheckConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base


class SubscriptionPlanRevision(Base):
    __tablename__ = "subscription_plan_revisions"
    __table_args__ = (
        UniqueConstraint("code", "revision", name="uq_subscription_plan_revision"),
        CheckConstraint("revision > 0", name="ck_subscription_plan_revision_positive"),
    )
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(60))
    revision: Mapped[int]
    configuration: Mapped[dict] = mapped_column(JSON)
    change_note: Mapped[str] = mapped_column(String(500))
    created_by: Mapped[UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
