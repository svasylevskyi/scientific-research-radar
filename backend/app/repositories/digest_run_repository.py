"""Read/history queries and owner feedback; execution writes live separately."""

from datetime import datetime, timezone
from typing import Any, cast
from uuid import UUID

from sqlalchemy import and_, exists, func, or_, select, update
from sqlalchemy.engine import CursorResult
from sqlalchemy.orm import Session, aliased, joinedload, selectinload

from app.models.digest_run import (
    DigestRun,
    DigestRunPaper,
    DigestRunStatus,
)


class DigestRunRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def has_running_for_owner(self, *, owner_id: UUID) -> bool:
        statement = select(DigestRun.id).where(
            DigestRun.owner_id == owner_id,
            DigestRun.status.in_((DigestRunStatus.QUEUED, DigestRunStatus.RUNNING)),
        )
        return self.db.scalar(statement) is not None

    def has_running_for_digest(self, *, digest_id: UUID) -> bool:
        statement = select(DigestRun.id).where(
            DigestRun.digest_id == digest_id,
            DigestRun.status.in_((DigestRunStatus.QUEUED, DigestRunStatus.RUNNING)),
        )
        return self.db.scalar(statement) is not None

    def get(self, run_id: UUID) -> DigestRun | None:
        statement = (
            select(DigestRun)
            .where(DigestRun.id == run_id)
            .options(
                selectinload(DigestRun.stages),
                selectinload(DigestRun.paper_results).joinedload(DigestRunPaper.paper),
                joinedload(DigestRun.trend_analysis),
                joinedload(DigestRun.briefing),
            )
        )
        return self.db.scalar(statement)

    def get_owned(
        self, *, digest_id: UUID, run_id: UUID, owner_id: UUID
    ) -> DigestRun | None:
        statement = (
            select(DigestRun)
            .where(
                DigestRun.id == run_id,
                DigestRun.digest_id == digest_id,
                DigestRun.owner_id == owner_id,
            )
            .options(
                selectinload(DigestRun.stages),
                selectinload(DigestRun.paper_results).joinedload(DigestRunPaper.paper),
                joinedload(DigestRun.trend_analysis),
                joinedload(DigestRun.briefing),
            )
        )
        return self.db.scalar(statement)

    def get_active_owned(self, *, owner_id: UUID) -> DigestRun | None:
        statement = (
            select(DigestRun)
            .where(
                DigestRun.owner_id == owner_id,
                DigestRun.status.in_((DigestRunStatus.QUEUED, DigestRunStatus.RUNNING)),
            )
            .options(
                selectinload(DigestRun.stages),
                selectinload(DigestRun.paper_results).joinedload(DigestRunPaper.paper),
                joinedload(DigestRun.trend_analysis),
                joinedload(DigestRun.briefing),
            )
            .order_by(DigestRun.started_at.desc(), DigestRun.id.desc())
        )
        return self.db.scalar(statement)

    def list_running(self) -> list[DigestRun]:
        statement = (
            select(DigestRun)
            .where(
                DigestRun.status.in_((DigestRunStatus.QUEUED, DigestRunStatus.RUNNING))
            )
            .options(selectinload(DigestRun.stages))
        )
        return list(self.db.scalars(statement))

    def list_owned(
        self, *, digest_id: UUID, owner_id: UUID, offset: int, limit: int
    ) -> list[DigestRun]:
        statement = (
            select(DigestRun)
            .where(DigestRun.digest_id == digest_id, DigestRun.owner_id == owner_id)
            .options(
                selectinload(DigestRun.stages),
                selectinload(DigestRun.paper_results),
            )
            .order_by(DigestRun.started_at.desc(), DigestRun.id.desc())
            .offset(offset)
            .limit(limit)
        )
        return list(self.db.scalars(statement))

    def count_owned(self, *, digest_id: UUID, owner_id: UUID) -> int:
        statement = (
            select(func.count())
            .select_from(DigestRun)
            .where(
                DigestRun.digest_id == digest_id,
                DigestRun.owner_id == owner_id,
            )
        )
        return self.db.scalar(statement) or 0

    def save_feedback_if_latest(self, *, run: DigestRun, feedback_text: str) -> bool:
        now = datetime.now(timezone.utc)
        newer = aliased(DigestRun)
        newer_run_exists = exists(
            select(newer.id).where(
                newer.digest_id == run.digest_id,
                or_(
                    newer.started_at > run.started_at,
                    and_(newer.started_at == run.started_at, newer.id > run.id),
                ),
            )
        )
        result = self.db.execute(
            update(DigestRun)
            .where(
                DigestRun.id == run.id,
                DigestRun.status == DigestRunStatus.COMPLETED,
                ~newer_run_exists,
            )
            .values(
                feedback_text=feedback_text,
                feedback_created_at=run.feedback_created_at or now,
                feedback_updated_at=now,
            )
            .execution_options(synchronize_session=False)
        )
        return cast(CursorResult[Any], result).rowcount == 1

    def build_history_context(
        self, *, digest_id: UUID, limit: int
    ) -> list[dict[str, Any]]:
        if limit == 0:
            return []
        statement = (
            select(DigestRun)
            .where(
                DigestRun.digest_id == digest_id,
                DigestRun.status == DigestRunStatus.COMPLETED,
                DigestRun.quality_delivery_blocked.is_(False),
            )
            .options(
                selectinload(DigestRun.paper_results).joinedload(DigestRunPaper.paper),
                joinedload(DigestRun.trend_analysis),
                joinedload(DigestRun.briefing),
            )
            .order_by(DigestRun.started_at.desc(), DigestRun.id.desc())
            .limit(limit)
        )
        runs = list(self.db.scalars(statement))
        return [self._history_item(run) for run in reversed(runs)]

    def build_feedback_context(
        self, *, digest_id: UUID, limit: int = 3
    ) -> list[dict[str, Any]]:
        statement = (
            select(DigestRun)
            .where(
                DigestRun.digest_id == digest_id,
                DigestRun.status == DigestRunStatus.COMPLETED,
                DigestRun.feedback_text.is_not(None),
                DigestRun.quality_delivery_blocked.is_(False),
            )
            .order_by(DigestRun.started_at.desc(), DigestRun.id.desc())
            .limit(limit)
        )
        runs = list(self.db.scalars(statement))
        return [
            {
                "run_id": str(run.id),
                "completed_at": (
                    run.completed_at.isoformat() if run.completed_at else None
                ),
                "user_feedback": run.feedback_text,
            }
            for run in reversed(runs)
        ]

    @staticmethod
    def _history_item(run: DigestRun) -> dict[str, Any]:
        return {
            "run_id": str(run.id),
            "completed_at": run.completed_at.isoformat() if run.completed_at else None,
            "reporting_period": {
                "from": run.digest_snapshot.get("reporting_from"),
                "to": run.digest_snapshot.get("reporting_to"),
            },
            "briefing": {
                "title": run.briefing.title if run.briefing else None,
                "executive_summary": (
                    run.briefing.executive_summary if run.briefing else None
                ),
                "highlights": run.briefing.data.get("highlights", [])
                if run.briefing
                else [],
            },
            "trend_analysis": {
                "overview": run.trend_analysis.overview if run.trend_analysis else None,
                "themes": run.trend_analysis.data.get("themes", [])
                if run.trend_analysis
                else [],
            },
            "papers": [
                {
                    "external_id": result.paper.external_id,
                    "title": result.paper.title,
                    "relevance_score": result.relevance_score,
                }
                for result in run.paper_results
            ],
        }
