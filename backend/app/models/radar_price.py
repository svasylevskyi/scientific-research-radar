from datetime import datetime, timezone
from uuid import UUID
from sqlalchemy import DateTime, ForeignKey, JSON, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base


class RadarPrice(Base):
    __tablename__ = "radar_prices"
    __table_args__ = (UniqueConstraint("model_name", "version", name="uq_radar_price_version"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    model_name: Mapped[str] = mapped_column(String(100), index=True)
    version: Mapped[str] = mapped_column(String(100))
    pricing: Mapped[dict] = mapped_column(JSON)
    created_by: Mapped[UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
