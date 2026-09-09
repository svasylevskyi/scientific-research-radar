from datetime import datetime
from uuid import UUID, uuid4
from sqlalchemy import DateTime, ForeignKey, JSON, String, func
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base


class RadarRequest(Base):
    __tablename__ = "radar_requests"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    run_id: Mapped[UUID] = mapped_column(ForeignKey("digest_runs.id", ondelete="CASCADE"), index=True)
    stage_id: Mapped[UUID] = mapped_column(ForeignKey("digest_run_stages.id", ondelete="CASCADE"))
    response_id: Mapped[str | None] = mapped_column(String(255), unique=True)
    model_name: Mapped[str] = mapped_column(String(100))
    reasoning_effort: Mapped[str] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(30), default="submitted")
    outcome: Mapped[str] = mapped_column(String(30), default="unconfirmed")
    usage: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    web_search_calls: Mapped[int | None]
    service_tier: Mapped[str | None] = mapped_column(String(30))
    pricing: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    observed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
