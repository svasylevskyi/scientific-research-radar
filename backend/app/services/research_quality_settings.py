from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.research_quality import ResearchQualitySettings
from app.schemas.research_quality import QualityConfig, QualitySettingsRead, QualitySnapshot

ENGINE_VERSION = "1"


def serialize_settings(row: ResearchQualitySettings) -> QualitySettingsRead:
    return QualitySettingsRead(
        version=row.version, config=QualityConfig.model_validate(row.config),
        created_at=row.created_at, created_by_name=row.created_by_name,
        change_reason=row.change_reason,
    )


def current_settings(db: Session) -> QualitySettingsRead:
    row = db.scalar(select(ResearchQualitySettings).order_by(ResearchQualitySettings.version.desc()).limit(1))
    if row is not None:
        return serialize_settings(row)
    return QualitySettingsRead(
        version=0, config=QualityConfig(), created_at=None, created_by_name=None,
        change_reason="Built-in Observe defaults.",
    )


def snapshot_settings(db: Session) -> dict:
    current = current_settings(db)
    return QualitySnapshot(version=current.version, engine_version=ENGINE_VERSION, config=current.config).model_dump(mode="json")
