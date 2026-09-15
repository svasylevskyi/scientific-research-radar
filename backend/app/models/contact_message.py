"""Messages submitted through the public contact form."""
from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import DateTime, Index, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ContactMessage(Base):
    __tablename__ = "contact_messages"
    __table_args__ = (Index("ix_contact_messages_created_at", "created_at", "id"),)

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(320))
    message: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
