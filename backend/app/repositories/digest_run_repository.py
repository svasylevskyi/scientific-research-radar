from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.models.digest import Digest
from app.models.digest_run import (
    DigestRun,
    DigestRunBriefing,
    DigestRunPaper,
    DigestRunStatus,
    DigestRunTrendAnalysis,
    DigestRunTrigger,
    Paper,
)
from app.radar.contracts import RadarOutput, SearchPaper


class DigestRunRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def has_running(self, *, digest_id: UUID) -> bool:
        statement = select(DigestRun.id).where(
            DigestRun.digest_id == digest_id,
            DigestRun.status == DigestRunStatus.RUNNING,
        )
        return self.db.scalar(statement) is not None

    def create_running(
        self,
        *,
        digest_id: UUID,
        digest_snapshot: dict[str, Any],
        history_context: list[dict[str, Any]],
        model_name: str,
        prompt_version: str,
    ) -> DigestRun:
        run = DigestRun(
            id=uuid4(),
            digest_id=digest_id,
            status=DigestRunStatus.RUNNING,
            trigger=DigestRunTrigger.MANUAL,
            digest_snapshot=digest_snapshot,
            history_context=history_context,
            model_name=model_name,
            prompt_version=prompt_version,
            started_at=datetime.now(timezone.utc),
        )
        self.db.add(run)
        self.db.flush()
        return run

    def save_output(
        self,
        *,
        run: DigestRun,
        output: RadarOutput,
        response_id: str | None,
        model_name: str,
    ) -> None:
        relevance_by_id = {
            assessment.external_id: assessment
            for assessment in output.relevance.assessments
        }
        summary_by_id = {
            summary.external_id: summary for summary in output.paper_summaries
        }

        run.search_data = output.search.model_dump(mode="json", exclude={"papers"})
        run.relevance_data = output.relevance.model_dump(
            mode="json", exclude={"assessments"}
        )
        run.openai_response_id = response_id
        run.model_name = model_name

        ranked_papers = sorted(
            output.search.papers,
            key=lambda paper: relevance_by_id[paper.external_id].score,
            reverse=True,
        )
        for rank, search_paper in enumerate(ranked_papers, start=1):
            paper = self._upsert_paper(search_paper)
            relevance = relevance_by_id[search_paper.external_id]
            summary = summary_by_id[search_paper.external_id]
            self.db.add(
                DigestRunPaper(
                    id=uuid4(),
                    run_id=run.id,
                    paper_id=paper.id,
                    rank=rank,
                    relevance_score=relevance.score,
                    search_data=search_paper.model_dump(
                        mode="json",
                        include={"discovery_reason", "matched_keywords", "citations"},
                    ),
                    relevance_data=relevance.model_dump(
                        mode="json", exclude={"external_id", "score"}
                    ),
                    summary_data=summary.model_dump(
                        mode="json", exclude={"external_id"}
                    ),
                )
            )

        trend = output.trend_analysis
        self.db.add(
            DigestRunTrendAnalysis(
                id=uuid4(),
                run_id=run.id,
                overview=trend.overview,
                data=trend.model_dump(mode="json", exclude={"overview"}),
            )
        )
        briefing = output.digest_briefing
        self.db.add(
            DigestRunBriefing(
                id=uuid4(),
                run_id=run.id,
                title=briefing.title,
                executive_summary=briefing.executive_summary,
                content_markdown=briefing.content_markdown,
                data=briefing.model_dump(
                    mode="json",
                    exclude={"title", "executive_summary", "content_markdown"},
                ),
            )
        )
        run.status = DigestRunStatus.COMPLETED
        run.completed_at = datetime.now(timezone.utc)

    def mark_failed(self, *, run: DigestRun, message: str) -> None:
        run.status = DigestRunStatus.FAILED
        run.error_message = message[:2000]
        run.completed_at = datetime.now(timezone.utc)

    def get(self, run_id: UUID) -> DigestRun | None:
        return self.db.get(DigestRun, run_id)

    def get_owned(
        self, *, digest_id: UUID, run_id: UUID, owner_id: UUID
    ) -> DigestRun | None:
        statement = (
            select(DigestRun)
            .join(DigestRun.digest)
            .where(
                DigestRun.id == run_id,
                DigestRun.digest_id == digest_id,
                Digest.owner_id == owner_id,
            )
            .options(
                selectinload(DigestRun.paper_results).joinedload(DigestRunPaper.paper),
                joinedload(DigestRun.trend_analysis),
                joinedload(DigestRun.briefing),
            )
        )
        return self.db.scalar(statement)

    def list_owned(
        self, *, digest_id: UUID, owner_id: UUID, offset: int, limit: int
    ) -> list[DigestRun]:
        statement = (
            select(DigestRun)
            .join(DigestRun.digest)
            .where(DigestRun.digest_id == digest_id, Digest.owner_id == owner_id)
            .options(selectinload(DigestRun.paper_results))
            .order_by(DigestRun.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        return list(self.db.scalars(statement))

    def count_owned(self, *, digest_id: UUID, owner_id: UUID) -> int:
        statement = (
            select(func.count())
            .select_from(DigestRun)
            .join(DigestRun.digest)
            .where(DigestRun.digest_id == digest_id, Digest.owner_id == owner_id)
        )
        return self.db.scalar(statement) or 0

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
            )
            .options(
                selectinload(DigestRun.paper_results).joinedload(DigestRunPaper.paper),
                joinedload(DigestRun.trend_analysis),
                joinedload(DigestRun.briefing),
            )
            .order_by(DigestRun.created_at.desc())
            .limit(limit)
        )
        runs = list(self.db.scalars(statement))
        return [self._history_item(run) for run in reversed(runs)]

    def _upsert_paper(self, values: SearchPaper) -> Paper:
        statement = select(Paper).where(
            Paper.source_name == values.source_name,
            Paper.external_id == values.external_id,
        )
        paper = self.db.scalar(statement)
        if paper is None:
            paper = Paper(
                id=uuid4(),
                source_name=values.source_name,
                external_id=values.external_id,
                title=values.title,
                authors=values.authors,
                abstract=values.abstract,
                published_date=values.published_date,
                url=values.url,
                doi=values.doi,
            )
            self.db.add(paper)
            self.db.flush()
            return paper

        paper.title = values.title
        paper.authors = values.authors
        paper.abstract = values.abstract
        paper.published_date = values.published_date
        paper.url = values.url
        paper.doi = values.doi
        return paper

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
                "highlights": run.briefing.data.get("highlights", []) if run.briefing else [],
            },
            "trend_analysis": {
                "overview": run.trend_analysis.overview if run.trend_analysis else None,
                "themes": run.trend_analysis.data.get("themes", []) if run.trend_analysis else [],
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
