from typing import Literal
from uuid import UUID
from fastapi import APIRouter, Query
from app.api.dependencies import CurrentAdmin, DbSession, AppSettings
from app.api.routes.stripe_sandbox import call, limit as rate_limit
from app.services import billing_sync_service as sync

router = APIRouter()


@router.get('')
def overview(actor: CurrentAdmin, db: DbSession, user_id: UUID | None = None,
             state: Literal['pending', 'processing', 'retry', 'failed', 'processed'] | None = None,
             offset: int = Query(0, ge=0), limit: int = Query(25, ge=1, le=100)):
    return sync.overview(db, actor, user_id=user_id, state=state, offset=offset, limit=limit)


@router.post('/{job_id}/retry', status_code=202)
def retry(job_id: str, actor: CurrentAdmin, db: DbSession, settings: AppSettings):
    rate_limit(db, settings, actor)
    return call(db, sync.retry, actor, job_id)
