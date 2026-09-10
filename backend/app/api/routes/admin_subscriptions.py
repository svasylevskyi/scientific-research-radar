"""Internal plan catalogue only: no checkout, assignment or quota enforcement."""
from datetime import timezone
from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from app.api.dependencies import CurrentAdmin, DbSession
from app.models.subscription_plan import SubscriptionPlanRevision
from app.schemas.subscription_plan import SubscriptionPlanSave

router = APIRouter()


def serialize(row):
    return {"id": row.id, "code": row.code, "revision": row.revision,
            "configuration": row.configuration, "change_note": row.change_note,
            "created_by": row.created_by, "created_at": row.created_at.replace(tzinfo=timezone.utc) if row.created_at.tzinfo is None else row.created_at}


@router.get("")
def list_plans(actor: CurrentAdmin, db: DbSession,
               offset: int = Query(0, ge=0), limit: int = Query(25, ge=1, le=100)):
    latest = select(func.max(SubscriptionPlanRevision.revision).label("revision"),
                    SubscriptionPlanRevision.code).group_by(SubscriptionPlanRevision.code).subquery()
    statement = select(SubscriptionPlanRevision).join(latest,
        (SubscriptionPlanRevision.code == latest.c.code) & (SubscriptionPlanRevision.revision == latest.c.revision))
    return {"items": [serialize(row) for row in db.scalars(statement.order_by(
        func.coalesce(SubscriptionPlanRevision.configuration["display_order"].as_integer(), 0),
        SubscriptionPlanRevision.code).offset(offset).limit(limit))],
            "total": db.scalar(select(func.count()).select_from(latest))}


@router.get("/{code}/revisions")
def history(code: str, actor: CurrentAdmin, db: DbSession,
            offset: int = Query(0, ge=0), limit: int = Query(25, ge=1, le=100)):
    statement = select(SubscriptionPlanRevision).where(SubscriptionPlanRevision.code == code)
    return {"items": [serialize(row) for row in db.scalars(statement.order_by(SubscriptionPlanRevision.revision.desc()).offset(offset).limit(limit))],
            "total": db.scalar(select(func.count()).select_from(SubscriptionPlanRevision).where(SubscriptionPlanRevision.code == code))}


@router.post("", status_code=201)
def save_plan(payload: SubscriptionPlanSave, actor: CurrentAdmin, db: DbSession):
    current = db.scalar(select(func.max(SubscriptionPlanRevision.revision)).where(SubscriptionPlanRevision.code == payload.code)) or 0
    if current != payload.expected_revision:
        raise HTTPException(status_code=409, detail="This plan changed. Reload the catalogue and review the latest revision before saving.")
    row = SubscriptionPlanRevision(code=payload.code, revision=current + 1,
        configuration=payload.configuration.model_dump(mode="json"), change_note=payload.change_note, created_by=actor.id)
    db.add(row)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Another admin saved this plan. Reload and review the latest revision.") from exc
    return serialize(row)
