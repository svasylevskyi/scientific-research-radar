from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, JSON, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class RunSourceContent(Base):
    __tablename__ = "run_source_content"
    __table_args__ = (UniqueConstraint("run_id", "external_id", name="uq_run_source_content_paper"),)
    id: Mapped[UUID] = mapped_column(primary_key=True)
    run_id: Mapped[UUID] = mapped_column(ForeignKey("digest_runs.id", ondelete="CASCADE"), index=True)
    external_id: Mapped[str] = mapped_column(String(500))
    document: Mapped[dict[str, Any]] = mapped_column(JSON)


class SourceContentCache(Base):
    __tablename__ = "source_content_cache"
    key: Mapped[str] = mapped_column(String(240), primary_key=True)
    document: Mapped[dict[str, Any]] = mapped_column(JSON)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
