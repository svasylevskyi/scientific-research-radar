from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.api.dependencies import CurrentAdmin, CurrentSuperAdmin, DbSession
from app.models.research_quality import ResearchQualitySettings
from app.schemas.research_quality import QualitySettingsHistory, QualitySettingsRead, QualitySettingsUpdate
from app.services.research_quality_settings import current_settings, serialize_settings

router = APIRouter()


@router.get("", response_model=QualitySettingsRead)
def read_settings(actor: CurrentAdmin, db: DbSession):
    return current_settings(db)


@router.get("/history", response_model=QualitySettingsHistory)
def history(actor: CurrentAdmin, db: DbSession,
            offset: int = Query(0, ge=0), limit: int = Query(20, ge=1, le=100)):
    rows = db.scalars(select(ResearchQualitySettings).order_by(ResearchQualitySettings.version.desc()).offset(offset).limit(limit))
    return QualitySettingsHistory(items=[serialize_settings(row) for row in rows],
        total=db.scalar(select(func.count()).select_from(ResearchQualitySettings)) or 0, offset=offset, limit=limit)


@router.post("", status_code=201, response_model=QualitySettingsRead)
def update_settings(payload: QualitySettingsUpdate, actor: CurrentSuperAdmin, db: DbSession):
    current = current_settings(db)
    if current.version != payload.expected_version:
        raise HTTPException(409, "Quality settings changed. Reload before saving.")
    row = ResearchQualitySettings(version=current.version + 1, config=payload.config.model_dump(mode="json"),
        created_by=actor.id, created_by_name=actor.full_name, change_reason=payload.change_reason)
    db.add(row)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "Quality settings changed. Reload before saving.") from exc
    return serialize_settings(row)
