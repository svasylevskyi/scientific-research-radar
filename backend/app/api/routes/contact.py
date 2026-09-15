"""Public submission and administrator-only review of contact messages."""
from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import func, select

from app.api.dependencies import CurrentAdmin, DbSession
from app.models.contact_message import ContactMessage
from app.schemas.contact_message import (
    ContactMessageCreate, ContactMessageList, ContactMessageRead,
    ContactMessageReceipt, ContactMessageReview,
)

router = APIRouter()
admin_router = APIRouter()


@router.post("", response_model=ContactMessageReceipt, status_code=201)
def submit_message(payload: ContactMessageCreate, db: DbSession) -> ContactMessageReceipt:
    db.add(ContactMessage(**payload.model_dump()))
    db.commit()
    return ContactMessageReceipt(message="Your message has been sent to the Radar administration team.")


@admin_router.get("", response_model=ContactMessageList)
def list_messages(
    db: DbSession,
    current_admin: CurrentAdmin,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
) -> ContactMessageList:
    total = db.scalar(select(func.count()).select_from(ContactMessage)) or 0
    messages = db.scalars(select(ContactMessage).order_by(
        ContactMessage.created_at.desc(), ContactMessage.id.desc(),
    ).offset(offset).limit(limit)).all()
    return ContactMessageList(items=[ContactMessageRead.model_validate(item) for item in messages],
                              total=total, offset=offset, limit=limit)


@admin_router.patch("/{message_id}", response_model=ContactMessageRead)
def review_message(
    message_id: UUID, payload: ContactMessageReview, db: DbSession, current_admin: CurrentAdmin,
) -> ContactMessageRead:
    message = db.get(ContactMessage, message_id)
    if message is None:
        raise HTTPException(404, "Contact message not found.")
    if payload.reviewed:
        message.reviewed_at = message.reviewed_at or datetime.now(UTC)
    else:
        message.reviewed_at = None
    db.commit()
    db.refresh(message)
    return ContactMessageRead.model_validate(message)
