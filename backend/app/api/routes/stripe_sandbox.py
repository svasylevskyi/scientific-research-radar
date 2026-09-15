"""Admin-only billing tools plus a separate signed, public webhook endpoint."""
from app.schemas.admin_billing_responses import (SandboxOverviewRead)
from app.schemas.api_common import RedirectRead, WebhookReceiptRead
from typing import Literal
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field
from starlette.concurrency import run_in_threadpool
from app.api.dependencies import CurrentAdmin, DbSession, AppSettings
from app.services import stripe_sandbox_service as service
from app.services.billing_sync_service import receive
from app.services.rate_limit_service import enforce, POLICIES

router = APIRouter()
webhook_router = APIRouter()


class StripeModeRead(BaseModel):
    mode: Literal["sandbox", "live"]
    checkout_enabled: bool


@router.get("/mode", response_model=StripeModeRead, response_model_exclude_unset=True)
def mode(actor: CurrentAdmin, settings: AppSettings):
    return {"mode": settings.stripe_mode, "checkout_enabled": settings.effective_stripe_checkout_enabled}


class CheckoutRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    revision: int = Field(ge=1)
    interval: Literal["monthly", "annual"]


def call(db, operation, *args):
    try:
        return operation(db, *args)
    except service.Error as exc:
        db.rollback()
        raise HTTPException(exc.status_code, str(exc)) from None


def limit(db, settings, actor):
    enforce(db, settings, "sandbox-billing-user", str(actor.id), *POLICIES["sandbox-billing-user"])


@router.get("", response_model=SandboxOverviewRead, response_model_exclude_unset=True)
def status(actor: CurrentAdmin, db: DbSession, settings: AppSettings):
    return service.overview(db, settings, actor.id)


@router.post("/checkout", response_model=RedirectRead, response_model_exclude_unset=True)
def checkout(payload: CheckoutRequest, actor: CurrentAdmin, db: DbSession, settings: AppSettings):
    limit(db, settings, actor)
    return call(db, service.start_checkout, settings, actor.id, payload.revision, payload.interval)


@router.post("/refresh", response_model=SandboxOverviewRead, response_model_exclude_unset=True)
def refresh(actor: CurrentAdmin, db: DbSession, settings: AppSettings):
    limit(db, settings, actor)
    return call(db, service.refresh, settings, actor.id)


@router.post("/portal", response_model=RedirectRead, response_model_exclude_unset=True)
def portal(actor: CurrentAdmin, db: DbSession, settings: AppSettings):
    limit(db, settings, actor)
    return call(db, service.portal, settings, actor.id)


@webhook_router.post("/stripe", response_model=WebhookReceiptRead, response_model_exclude_unset=True)
@webhook_router.post("/stripe-sandbox", response_model=WebhookReceiptRead, response_model_exclude_unset=True)
async def webhook(request: Request, db: DbSession, settings: AppSettings):
    # Exempt only this signed endpoint from browser/auth request guards. Bound
    # raw input before decoding; the signature must cover the original bytes.
    chunks, size = [], 0
    async for chunk in request.stream():
        size += len(chunk)
        if size > 1_048_576:
            raise HTTPException(413, "Webhook payload is too large.")
        chunks.append(chunk)
    try:
        event = service.verify_event(b"".join(chunks), request.headers.get("stripe-signature", ""), settings)
    except service.Error as exc:
        raise HTTPException(exc.status_code, str(exc)) from None
    return await run_in_threadpool(call, db, receive, settings, event)
