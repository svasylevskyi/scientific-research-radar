from datetime import date
from uuid import UUID
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from app.api.dependencies import CurrentAdmin, DbSession
from app.models.subscription_observation import ObservationAssignment
from app.services.admin_user_service import AdminUserService, AdminActionForbiddenError, UserNotFoundError
from app.services import subscription_observation_service as service

router = APIRouter()


class AssignmentRequest(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    plan_revision_id: int | None = Field(default=None, ge=1)
    expected_version: int = Field(ge=0)
    change_note: str = Field(min_length=1, max_length=500)


def authorize(db, actor, user_id):
    try:
        return AdminUserService(db).get_user(actor=actor, user_id=user_id)
    except AdminActionForbiddenError as exc:
        raise HTTPException(403, str(exc)) from None
    except UserNotFoundError as exc:
        raise HTTPException(404, str(exc)) from None


@router.get('/{user_id}')
def overview(user_id: UUID, actor: CurrentAdmin, db: DbSession,
             period: date | None = None, offset: int = Query(0, ge=0), limit: int = Query(25, ge=1, le=100)):
    user = authorize(db, actor, user_id)
    return {'user': {'id': user.id, 'email': user.email, 'full_name': user.full_name},
            **service.overview(db, user_id, period.replace(day=1) if period else None, offset, limit)}


@router.post('/{user_id}/assignments', status_code=201)
def assign(user_id: UUID, payload: AssignmentRequest, actor: CurrentAdmin, db: DbSession):
    authorize(db, actor, user_id)
    try:
        result = service.assign(db, user_id, actor.id, payload.plan_revision_id, payload.expected_version, payload.change_note)
        db.commit()
        return result
    except service.ObservationError as exc:
        db.rollback()
        raise HTTPException(exc.status, str(exc)) from None


@router.get('/{user_id}/assignments')
def history(user_id: UUID, actor: CurrentAdmin, db: DbSession,
            offset: int = Query(0, ge=0), limit: int = Query(25, ge=1, le=100)):
    authorize(db, actor, user_id)
    statement = select(ObservationAssignment).where(ObservationAssignment.user_id == user_id)
    return {'items': [service.assignment_read(db, row) for row in db.scalars(statement.order_by(
        ObservationAssignment.version.desc()).offset(offset).limit(limit))],
        'total': db.scalar(select(func.count()).select_from(statement.subquery()))}
