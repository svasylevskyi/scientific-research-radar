"""Evaluate immutable completed output; never mutate run, usage, or delivery state."""

from datetime import datetime, timezone
from uuid import uuid4

from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.digest_run import DigestRun, DigestRunStageStatus, DigestRunStatus, RADAR_STAGE_ORDER
from app.models.research_quality import ResearchQualityEvaluation
from app.models.user import User
from app.radar.quality import evaluate_quality
from app.schemas.research_quality import QualityEvaluationHistory, QualityEvaluationRead, QualitySnapshot
from app.services.research_quality_settings import ENGINE_VERSION, current_settings


class ManualQualityUnavailableError(ValueError):
    pass


def evaluate_manually(
    db: Session, *, run: DigestRun, actor: User, expected_settings_version: int,
) -> QualityEvaluationRead:
    if run.status != DigestRunStatus.COMPLETED:
        raise ManualQualityUnavailableError("Quality checks require a completed research run.")
    stages = {stage.stage: stage for stage in run.stages}
    if any(stage not in stages or stages[stage].status != DigestRunStageStatus.COMPLETED
           or stages[stage].result_data is None for stage in RADAR_STAGE_ORDER):
        raise ManualQualityUnavailableError("This run does not contain all saved stage outputs required for evaluation.")

    settings = current_settings(db)
    if settings.version != expected_settings_version:
        raise ManualQualityUnavailableError("Quality settings changed. Refresh the quality block before evaluating.")
    snapshot = QualitySnapshot(version=settings.version, engine_version=ENGINE_VERSION, config=settings.config)
    try:
        # An explicit manual request runs checks even when automatic checks are Off.
        # Keep the original mode in the audit snapshot, but always assess without enforcement.
        decision = evaluate_quality(
            digest_snapshot=run.digest_snapshot,
            stages={str(name): stage.result_data for name, stage in stages.items()},
            config=settings.config.model_copy(update={"mode": "observe"}),
        )
    except (ValidationError, KeyError, TypeError, ValueError) as exc:
        raise ManualQualityUnavailableError(
            "Saved research data is incomplete or incompatible with the current checks. No evaluation was recorded."
        ) from exc

    row = ResearchQualityEvaluation(
        id=uuid4(), run_id=run.id, created_by=actor.id, created_by_name=actor.full_name,
        created_at=datetime.now(timezone.utc), config=snapshot.model_dump(mode="json"),
        status=decision.status, findings=[finding.model_dump(mode="json") for finding in decision.findings],
    )
    db.add(row)
    db.commit()
    return QualityEvaluationRead.model_validate(row)


def evaluation_history(db: Session, *, run: DigestRun, offset: int, limit: int) -> QualityEvaluationHistory:
    scope = ResearchQualityEvaluation.run_id == run.id
    rows = db.scalars(select(ResearchQualityEvaluation).where(scope)
        .order_by(ResearchQualityEvaluation.created_at.desc(), ResearchQualityEvaluation.id.desc())
        .offset(offset).limit(limit))
    total = db.scalar(select(func.count()).select_from(ResearchQualityEvaluation).where(scope)) or 0
    return QualityEvaluationHistory(items=[QualityEvaluationRead.model_validate(row) for row in rows],
        total=total, offset=offset, limit=limit)
