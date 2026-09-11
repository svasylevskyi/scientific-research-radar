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


@router.get('/plans')
def plans(db: DbSession, response: Response):
    response.headers['Cache-Control'] = 'no-store'
    return service.catalogue(db)


@router.get('/billing')
def status(actor: CurrentUser, db: DbSession, settings: AppSettings, response: Response):
    response.headers['Cache-Control'] = 'no-store'
    return service.status(db, settings, actor.id)


@router.post('/billing/checkout')
def checkout(payload: Selection, actor: CurrentUser, db: DbSession, settings: AppSettings):
    limit(db, settings, actor)
    return call(db, service.checkout, settings, actor.id, payload.code, payload.revision, payload.interval)


@router.post('/billing/resume')
def resume(actor: CurrentUser, db: DbSession, settings: AppSettings):
    limit(db, settings, actor)
    return call(db, service.resume, settings, actor.id)


@router.post('/billing/refresh')
def refresh(actor: CurrentUser, db: DbSession, settings: AppSettings):
    limit(db, settings, actor)
    return call(db, service.refresh, settings, actor.id)


@router.post('/billing/portal')
def portal(actor: CurrentUser, db: DbSession, settings: AppSettings):
    limit(db, settings, actor)
    return call(db, service.portal, settings, actor.id)
