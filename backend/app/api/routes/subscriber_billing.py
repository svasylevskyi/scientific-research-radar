from app.schemas.subscriber_responses import (
    ActiveDigestsRead,
    BillingStatusRead,
    ChangeOptionsRead,
    ChangeRead,
    NotificationsRead,
    PublicPlansRead,
    UpgradeOptionsRead,
    UpgradeRead,
)
from app.schemas.api_common import RedirectRead
from typing import Literal
from fastapi import APIRouter, Response
from pydantic import BaseModel, ConfigDict, Field
from app.api.dependencies import CurrentUser, DbSession, AppSettings
from app.api.routes.stripe_sandbox import call, limit
from app.services import subscriber_billing_service as service

router = APIRouter()


class Selection(BaseModel):
    model_config = ConfigDict(extra='forbid')
    code: str = Field(pattern=r'^[a-z][a-z0-9-]{0,59}$')
    revision: int = Field(ge=1)
    interval: Literal['monthly', 'annual']


@router.get('/plans', response_model=PublicPlansRead, response_model_exclude_unset=True)
def plans(db: DbSession, response: Response):
    response.headers['Cache-Control'] = 'no-store'
    return service.catalogue(db)


@router.get('/enrolment-plans', response_model=PublicPlansRead, response_model_exclude_unset=True)
def enrolment_plans(actor: CurrentUser, db: DbSession, response: Response):
    response.headers['Cache-Control'] = 'no-store'
    return service.enrolment_catalogue(db, actor.id)


@router.get('/billing', response_model=BillingStatusRead, response_model_exclude_unset=True)
def status(actor: CurrentUser, db: DbSession, settings: AppSettings, response: Response):
    response.headers['Cache-Control'] = 'no-store'
    return service.status(db, settings, actor.id)


@router.post('/billing/checkout', response_model=RedirectRead, response_model_exclude_unset=True)
def checkout(payload: Selection, actor: CurrentUser, db: DbSession, settings: AppSettings):
    limit(db, settings, actor)
    return call(db, service.checkout, settings, actor.id, payload.code, payload.revision, payload.interval)


@router.post('/billing/resume', response_model=RedirectRead, response_model_exclude_unset=True)
def resume(actor: CurrentUser, db: DbSession, settings: AppSettings):
    limit(db, settings, actor)
    return call(db, service.resume, settings, actor.id)


@router.post('/billing/refresh', response_model=BillingStatusRead, response_model_exclude_unset=True)
def refresh(actor: CurrentUser, db: DbSession, settings: AppSettings):
    limit(db, settings, actor)
    return call(db, service.refresh, settings, actor.id)


@router.post('/billing/portal', response_model=RedirectRead, response_model_exclude_unset=True)
def portal(actor: CurrentUser, db: DbSession, settings: AppSettings):
    limit(db, settings, actor)
    return call(db, service.portal, settings, actor.id)


@router.post('/billing/cancel', response_model=RedirectRead, response_model_exclude_unset=True)
def cancel(actor: CurrentUser, db: DbSession, settings: AppSettings):
    limit(db, settings, actor)
    return call(db, service.cancel, settings, actor.id)


from datetime import datetime
from uuid import UUID
from app.services import subscription_change_service as changes


class ChangeSelection(Selection):
    expected_period_end: datetime
    digest_ids: list[UUID] = Field(max_length=10000)


class ActiveDigests(BaseModel):
    model_config = ConfigDict(extra='forbid')
    digest_ids: list[UUID] = Field(max_length=10000)


@router.get('/billing/changes', response_model=ChangeOptionsRead, response_model_exclude_unset=True)
def change_options(actor: CurrentUser, db: DbSession, settings: AppSettings, response: Response):
    response.headers['Cache-Control'] = 'no-store'
    return changes.options(db, settings, actor.id)


@router.post('/billing/changes', response_model=ChangeRead, response_model_exclude_unset=True)
def schedule_change(payload: ChangeSelection, actor: CurrentUser, db: DbSession, settings: AppSettings):
    limit(db, settings, actor)
    return call(db, changes.schedule, settings, actor.id, payload.code, payload.revision, payload.interval, payload.expected_period_end, payload.digest_ids)


@router.post('/billing/changes/{change_id}/undo', response_model=ChangeRead, response_model_exclude_unset=True)
def undo_change(change_id: UUID, actor: CurrentUser, db: DbSession, settings: AppSettings):
    limit(db, settings, actor)
    return call(db, changes.undo, settings, actor.id, change_id)


@router.post('/billing/changes/{change_id}/retry', response_model=ChangeRead, response_model_exclude_unset=True)
def retry_change(change_id: UUID, actor: CurrentUser, db: DbSession, settings: AppSettings):
    limit(db, settings, actor)
    return call(db, changes.retry, settings, actor.id, change_id)


@router.get('/billing/active-digests', response_model=ActiveDigestsRead, response_model_exclude_unset=True)
def active_digests(actor: CurrentUser, db: DbSession, settings: AppSettings, response: Response):
    response.headers['Cache-Control'] = 'no-store'
    return call(db, changes.active_digests, settings, actor.id)


@router.put('/billing/active-digests', response_model=ActiveDigestsRead, response_model_exclude_unset=True)
def select_active_digests(payload: ActiveDigests, actor: CurrentUser, db: DbSession, settings: AppSettings):
    return call(db, changes.active_digests, settings, actor.id, payload.digest_ids)


@router.get('/billing/notifications', response_model=NotificationsRead, response_model_exclude_unset=True)
def notifications(actor: CurrentUser, db: DbSession, response: Response):
    from sqlalchemy import select
    from app.models.subscription_change import BillingNotification
    response.headers['Cache-Control'] = 'no-store'
    return {'items': [{'id': n.id, 'subject': n.subject, 'text': n.text, 'email_status': n.state, 'created_at': n.created_at}
        for n in db.scalars(select(BillingNotification).where(BillingNotification.user_id == actor.id)
            .order_by(BillingNotification.created_at.desc(), BillingNotification.id).limit(20))]}


from app.services import subscription_upgrade_service as upgrades


class UpgradeSelection(BaseModel):
    model_config = ConfigDict(extra='forbid')
    code: str = Field(pattern=r'^[a-z][a-z0-9-]{0,59}$')
    revision: int = Field(ge=1)


@router.get('/billing/upgrades', response_model=UpgradeOptionsRead, response_model_exclude_unset=True)
def upgrade_options(actor: CurrentUser, db: DbSession, settings: AppSettings, response: Response):
    response.headers['Cache-Control'] = 'no-store'
    return upgrades.options(db, settings, actor.id)


@router.post('/billing/upgrades/preview', response_model=UpgradeRead, response_model_exclude_unset=True)
def preview_upgrade(payload: UpgradeSelection, actor: CurrentUser, db: DbSession, settings: AppSettings):
    limit(db, settings, actor)
    return call(db, upgrades.preview, settings, actor.id, payload.code, payload.revision)


@router.post('/billing/upgrades/{quote_id}/confirm', response_model=UpgradeRead, response_model_exclude_unset=True)
def confirm_upgrade(quote_id: UUID, actor: CurrentUser, db: DbSession, settings: AppSettings):
    limit(db, settings, actor)
    return call(db, upgrades.confirm, settings, actor.id, quote_id)


@router.post('/billing/upgrades/{quote_id}/retry', response_model=UpgradeRead, response_model_exclude_unset=True)
def retry_upgrade(quote_id: UUID, actor: CurrentUser, db: DbSession, settings: AppSettings):
    limit(db, settings, actor)
    return call(db, upgrades.retry, settings, actor.id, quote_id)


@router.post('/billing/upgrades/{quote_id}/payment', response_model=RedirectRead, response_model_exclude_unset=True)
def upgrade_payment(quote_id: UUID, actor: CurrentUser, db: DbSession, settings: AppSettings):
    limit(db, settings, actor)
    return call(db, upgrades.payment, settings, actor.id, quote_id)
