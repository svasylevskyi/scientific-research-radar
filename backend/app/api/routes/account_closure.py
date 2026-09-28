"""One confirmed closure workflow for account holders and administrators."""
from uuid import UUID

from fastapi import APIRouter, HTTPException

from app.api.dependencies import AppSettings, CurrentAdmin, CurrentUser, DbSession
from app.schemas.account_closure import CheckoutRecovery, ClosureRead, ClosureRequest, ContactClosureDecision
from app.schemas.contact_message import ContactMessageRead
from app.services import account_closure_service as closure
from app.services.stripe_catalogue_service import StripeCatalogueError

router = APIRouter()


@router.post("/users/me/closure", response_model=ClosureRead, status_code=202)
def close_my_account(payload: ClosureRequest, db: DbSession, actor: CurrentUser):
    return closure.request_closure(db, target_id=actor.id, actor=actor, password=payload.current_password)


@router.post("/admin/users/{user_id}/closure", response_model=ClosureRead, status_code=202)
def close_managed_account(user_id: UUID, payload: ClosureRequest, db: DbSession, actor: CurrentAdmin):
    if user_id == actor.id:
        raise HTTPException(403, "Use your Profile page to close your own account.")
    return closure.request_closure(db, target_id=user_id, actor=actor, password=payload.current_password)


@router.get("/admin/users/{user_id}/closure", response_model=ClosureRead | None)
def closure_status(user_id: UUID, db: DbSession, actor: CurrentAdmin):
    return db.get(closure.AccountClosure, user_id)


@router.post("/admin/users/{user_id}/closure/retry", response_model=ClosureRead)
def retry_closure(user_id: UUID, db: DbSession, actor: CurrentAdmin):
    return closure.retry(db, user_id)


@router.post("/admin/users/{user_id}/closure/checkout", response_model=ClosureRead)
def recover_checkout(user_id: UUID, payload: CheckoutRecovery, db: DbSession, actor: CurrentAdmin, settings: AppSettings):
    try:
        return closure.recover_checkout(db, settings, user_id, payload)
    except StripeCatalogueError as exc:
        raise HTTPException(exc.status_code, str(exc)) from exc


@router.get("/admin/users/{user_id}/closure/contact-messages", response_model=list[ContactMessageRead])
def contact_messages(user_id: UUID, db: DbSession, actor: CurrentAdmin):
    return closure.anonymous_contacts(db, user_id)


@router.post("/admin/users/{user_id}/closure/contact-messages/{message_id}", response_model=ClosureRead)
def review_contact_message(user_id: UUID, message_id: UUID, payload: ContactClosureDecision, db: DbSession, actor: CurrentAdmin):
    messages = closure.anonymous_contacts(db, user_id)
    message = next((item for item in messages if item.id == message_id), None)
    if message is None:
        raise HTTPException(404, "This message is not part of the closure review.")
    if payload.decision == "delete":
        db.delete(message)
    else:
        row = closure.require_closure(db, user_id)
        row.unrelated_contact_ids = [*row.unrelated_contact_ids, str(message_id)]
    db.flush()
    return closure.retry(db, user_id)
