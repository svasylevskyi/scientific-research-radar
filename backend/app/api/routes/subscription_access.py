from typing import Literal
from uuid import UUID
from fastapi import APIRouter, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from app.api.dependencies import CurrentUser, CurrentAdmin, DbSession, AppSettings
from app.api.routes.subscription_observation import authorize
from app.services import subscription_access_service as service
from app.models.subscription_access import SubscriptionAccessPolicy

router = APIRouter()
admin_router = APIRouter()


class AccessPolicyRequest(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    mode: Literal['complimentary', 'sandbox']
    expected_version: int = Field(ge=0)
    change_note: str = Field(min_length=1, max_length=500)


@router.get('')
def mine(actor: CurrentUser, db: DbSession, settings: AppSettings, digest_id: UUID | None = None, run_id: UUID | None = None):
    data = service.overview(db, actor.id, settings)
    if run_id and not digest_id:
        from fastapi import HTTPException
        raise HTTPException(422, 'A digest is required for a run assessment')
    if digest_id:
        from app.services.digest_service import DigestService, DigestNotFoundError
        from fastapi import HTTPException
        try:
            digest = DigestService(db).get_owned(owner=actor, digest_id=digest_id)
        except DigestNotFoundError:
            raise HTTPException(404, 'Digest not found') from None
        _, issues = service.assess(db, actor.id, digest.maximum_papers, settings=settings)
        data.update(run_allowed=not issues, run_reasons=issues)
        if run_id:
            from app.models.digest_run import DigestRun
            from app.models.subscription_access import SubscriptionRunUsage
            run = db.scalar(select(DigestRun).where(DigestRun.id == run_id, DigestRun.digest_id == digest_id, DigestRun.owner_id == actor.id))
            if run is None:
                raise HTTPException(404, 'Digest run not found')
            context = service.run_context(db, run, existing=db.get(SubscriptionRunUsage, run.id), schedule=digest.schedule)
            _, issues = service.assess(db, actor.id, run.digest_snapshot['maximum_papers'], str(run.trigger), context, settings)
            data.update(retry_allowed=run.status == 'failed' and not issues, retry_reasons=issues)
    return data


@admin_router.get('/{user_id}')
def overview(user_id: UUID, actor: CurrentAdmin, db: DbSession, settings: AppSettings,
             offset: int = Query(0, ge=0)):
    user = authorize(db, actor, user_id)
    history = list(db.scalars(select(SubscriptionAccessPolicy).where(SubscriptionAccessPolicy.user_id == user_id)
        .order_by(SubscriptionAccessPolicy.version.desc()).offset(offset).limit(25)))
    return {**service.overview(db, user_id, settings), 'email': user.email,
        'history': [{'version': r.version, 'mode': r.mode, 'created_by': r.created_by,
            'created_at': service.utc(r.created_at), 'change_note': r.change_note} for r in history]}


@admin_router.post('/{user_id}/policy', status_code=201)
def change(user_id: UUID, payload: AccessPolicyRequest, actor: CurrentAdmin, db: DbSession):
    authorize(db, actor, user_id)
    row = service.change_policy(db, user_id, actor.id, payload.mode, payload.expected_version, payload.change_note)
    db.commit()
    return {'version': row.version, 'mode': row.mode}
