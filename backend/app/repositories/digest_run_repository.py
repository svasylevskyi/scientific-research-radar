from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import func, or_, select, update
from sqlalchemy.orm import Session, joinedload, selectinload

from app.models.digest_run import (
    RADAR_STAGE_ORDER,
    DigestRun,
    DigestRunBriefing,
    DigestRunPaper,
    DigestRunStage,
    DigestRunStageStatus,
    DigestRunStageType,
    DigestRunStatus,
    DigestRunTrendAnalysis,
    DigestRunTrigger,
    Paper,
)
from app.radar.client import RadarClientResult, RadarTokenUsage
from app.radar.contracts import (
    DigestBriefingOutput,
    DiscoveryRelevanceOutput,
    PaperSummariesOutput,
    SearchPaper,
    TrendAnalysisOutput,
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

    def create_running(
        self,
        *,
        digest_id: UUID,
        owner_id: UUID,
        digest_snapshot: dict[str, Any],
        history_context: list[dict[str, Any]],
        model_name: str,
        prompt_version: str,
    ) -> DigestRun:
        run = DigestRun(
            id=uuid4(),
            digest_id=digest_id,
            owner_id=owner_id,
            status=DigestRunStatus.QUEUED,
            trigger=DigestRunTrigger.MANUAL,
            digest_snapshot=digest_snapshot,
            history_context=history_context,
            model_name=model_name,
            prompt_version=prompt_version,
            started_at=datetime.now(timezone.utc),
        )
        run.stages = [
            DigestRunStage(
                id=uuid4(),
                stage=stage_type,
                position=position,
                status=DigestRunStageStatus.PENDING,
                progress_current=0,
                progress_total=1,
                response_ids=[],
                usage_data=self._empty_usage(),
                model_name=model_name,
                prompt_version=prompt_version,
            )
            for position, stage_type in enumerate(RADAR_STAGE_ORDER, start=1)
        ]
        self.db.add(run)
        self.db.flush()
        return run

    def mark_stage_running(
        self,
        *,
        stage: DigestRunStage,
        progress_total: int = 1,
    ) -> None:
        stage.status = DigestRunStageStatus.RUNNING
        stage.progress_current = 0
        stage.progress_total = progress_total
        stage.error_message = None
        stage.started_at = datetime.now(timezone.utc)
        stage.completed_at = None

    def record_response_started(
        self, *, run: DigestRun, stage: DigestRunStage, response_id: str
    ) -> None:
        stage.active_response_id = response_id
        run.request_count += 1

    def clear_active_response(self, *, stage: DigestRunStage) -> None:
        stage.active_response_id = None

    def save_discovery_relevance(
        self,
        *,
        run: DigestRun,
        stage: DigestRunStage,
        result: RadarClientResult[DiscoveryRelevanceOutput],
    ) -> None:
        output = result.output
        relevance_by_id = {
            assessment.external_id: assessment
            for assessment in output.relevance.assessments
        }
        run.search_data = output.search.model_dump(mode="json", exclude={"papers"})
        run.relevance_data = output.relevance.model_dump(
            mode="json", exclude={"assessments"}
        )
        ranked_papers = sorted(
            output.search.papers,
            key=lambda paper: relevance_by_id[paper.external_id].score,
            reverse=True,
        )
        for rank, search_paper in enumerate(ranked_papers, start=1):
            paper = self._upsert_paper(search_paper)
            relevance = relevance_by_id[search_paper.external_id]
            search_data = search_paper.model_dump(mode="json")
            for persisted_column in (
                "source_name",
                "external_id",
                "title",
                "authors",
                "abstract",
                "published_date",
                "url",
                "doi",
            ):
                search_data.pop(persisted_column)
            self.db.add(
                DigestRunPaper(
                    id=uuid4(),
                    run_id=run.id,
                    paper_id=paper.id,
                    rank=rank,
                    relevance_score=relevance.score,
                    search_data=search_data,
                    relevance_data=relevance.model_dump(
                        mode="json", exclude={"external_id", "score"}
                    ),
                    summary_data=None,
                )
            )
        self._complete_stage(
            run=run,
            stage=stage,
            result_data=output.model_dump(mode="json"),
            result=result,
            progress_current=1,
            progress_total=1,
        )

    def save_summary_batch(
        self,
        *,
        run: DigestRun,
        stage: DigestRunStage,
        result: RadarClientResult[PaperSummariesOutput],
        progress_total: int,
    ) -> None:
        summaries = result.output.paper_summaries
        results_by_id = self._paper_results_by_external_id(run_id=run.id)
        for summary in summaries:
            results_by_id[summary.external_id].summary_data = summary.model_dump(
                mode="json", exclude={"external_id"}
            )

        existing = list((stage.result_data or {}).get("paper_summaries", []))
        existing.extend(
            summary.model_dump(mode="json") for summary in summaries
        )
        stage.result_data = {"paper_summaries": existing}
        stage.progress_current = len(existing)
        stage.progress_total = progress_total
        self._record_result_metadata(run=run, stage=stage, result=result)

    def complete_summary_stage(
        self,
        *,
        stage: DigestRunStage,
        progress_total: int,
    ) -> None:
        stage.status = DigestRunStageStatus.COMPLETED
        stage.progress_current = progress_total
        stage.progress_total = progress_total
        stage.completed_at = datetime.now(timezone.utc)
        if stage.result_data is None:
            stage.result_data = {"paper_summaries": []}

    def save_trend_analysis(
        self,
        *,
        run: DigestRun,
        stage: DigestRunStage,
        result: RadarClientResult[TrendAnalysisOutput],
    ) -> None:
        trend = result.output.trend_analysis
        self.db.add(
            DigestRunTrendAnalysis(
                id=uuid4(),
                run_id=run.id,
                overview=trend.overview,
                data=trend.model_dump(mode="json", exclude={"overview"}),
            )
        )
        self._complete_stage(
            run=run,
            stage=stage,
            result_data=result.output.model_dump(mode="json"),
            result=result,
        )

    def save_digest_briefing(
        self,
        *,
        run: DigestRun,
        stage: DigestRunStage,
        result: RadarClientResult[DigestBriefingOutput],
    ) -> None:
        briefing = result.output.digest_briefing
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
        self._complete_stage(
            run=run,
            stage=stage,
            result_data=result.output.model_dump(mode="json"),
            result=result,
        )

    def mark_completed(self, *, run: DigestRun) -> None:
        run.status = DigestRunStatus.COMPLETED
        run.error_message = None
        run.completed_at = datetime.now(timezone.utc)
        run.worker_id = None
        run.lease_expires_at = None

    def mark_failed(
        self,
        *,
        run: DigestRun,
        stage: DigestRunStage,
        message: str,
    ) -> None:
        now = datetime.now(timezone.utc)
        stage.status = DigestRunStageStatus.FAILED
        stage.error_message = message[:2000]
        stage.completed_at = now
        run.status = DigestRunStatus.FAILED
        run.error_message = message[:2000]
        run.completed_at = now
        run.worker_id = None
        run.lease_expires_at = None

    def get(self, run_id: UUID) -> DigestRun | None:
        statement = select(DigestRun).where(DigestRun.id == run_id).options(
            selectinload(DigestRun.stages),
            selectinload(DigestRun.paper_results).joinedload(DigestRunPaper.paper),
            joinedload(DigestRun.trend_analysis),
            joinedload(DigestRun.briefing),
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
            .order_by(DigestRun.created_at.desc())
        )
        return self.db.scalar(statement)

    def list_running(self) -> list[DigestRun]:
        statement = (
            select(DigestRun)
            .where(DigestRun.status.in_((DigestRunStatus.QUEUED, DigestRunStatus.RUNNING)))
            .options(selectinload(DigestRun.stages))
        )
        return list(self.db.scalars(statement))

    def claim_next(self, *, worker_id: str, lease_expires_at: datetime) -> DigestRun | None:
        now = datetime.now(timezone.utc)
        candidate = self.db.scalar(
            select(DigestRun.id)
            .where(
                DigestRun.status.in_((DigestRunStatus.QUEUED, DigestRunStatus.RUNNING)),
                or_(DigestRun.lease_expires_at.is_(None), DigestRun.lease_expires_at < now),
            )
            .order_by(DigestRun.created_at)
            .limit(1)
        )
        if candidate is None:
            return None
        claimed = self.db.execute(
            update(DigestRun)
            .where(
                DigestRun.id == candidate,
                DigestRun.status.in_((DigestRunStatus.QUEUED, DigestRunStatus.RUNNING)),
                or_(DigestRun.lease_expires_at.is_(None), DigestRun.lease_expires_at < now),
            )
            .values(
                status=DigestRunStatus.RUNNING,
                worker_id=worker_id,
                lease_expires_at=lease_expires_at,
            )
        )
        self.db.commit()
        return self.get(candidate) if claimed.rowcount == 1 else None

    def renew_lease(
        self, *, run_id: UUID, worker_id: str, lease_expires_at: datetime
    ) -> bool:
        result = self.db.execute(
            update(DigestRun)
            .where(
                DigestRun.id == run_id,
                DigestRun.worker_id == worker_id,
                DigestRun.status == DigestRunStatus.RUNNING,
            )
            .values(lease_expires_at=lease_expires_at)
            .execution_options(synchronize_session=False)
        )
        return result.rowcount == 1

    def requeue_failed(self, *, run: DigestRun) -> None:
        failed = next(
            (stage for stage in run.stages if stage.status == DigestRunStageStatus.FAILED),
            None,
        )
        if failed is None:
            raise ValueError("This run has no failed stage to retry")
        failed.status = DigestRunStageStatus.PENDING
        failed.error_message = None
        failed.completed_at = None
        run.status = DigestRunStatus.QUEUED
        run.error_message = None
        run.completed_at = None
        run.worker_id = None
        run.lease_expires_at = None

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
            .order_by(DigestRun.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        return list(self.db.scalars(statement))

    def count_owned(self, *, digest_id: UUID, owner_id: UUID) -> int:
        statement = select(func.count()).select_from(DigestRun).where(
            DigestRun.digest_id == digest_id,
            DigestRun.owner_id == owner_id,
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

    def _complete_stage(
        self,
        *,
        run: DigestRun,
        stage: DigestRunStage,
        result_data: dict[str, Any],
        result: RadarClientResult,
        progress_current: int = 1,
        progress_total: int = 1,
    ) -> None:
        stage.result_data = result_data
        stage.progress_current = progress_current
        stage.progress_total = progress_total
        stage.status = DigestRunStageStatus.COMPLETED
        stage.completed_at = datetime.now(timezone.utc)
        self._record_result_metadata(run=run, stage=stage, result=result)

    def _record_result_metadata(
        self,
        *,
        run: DigestRun,
        stage: DigestRunStage,
        result: RadarClientResult,
    ) -> None:
        if result.response_id:
            stage.response_ids = [*stage.response_ids, result.response_id]
            run.openai_response_id = result.response_id
        stage.active_response_id = None
        stage.model_name = result.model_name
        stage.usage_data = self._merge_usage(stage.usage_data, result.usage)
        run.model_name = result.model_name

    def _paper_results_by_external_id(
        self, *, run_id: UUID
    ) -> dict[str, DigestRunPaper]:
        statement = (
            select(DigestRunPaper)
            .join(DigestRunPaper.paper)
            .where(DigestRunPaper.run_id == run_id)
            .options(joinedload(DigestRunPaper.paper))
        )
        return {
            result.paper.external_id: result for result in self.db.scalars(statement)
        }

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
    def _empty_usage() -> dict[str, int]:
        return RadarTokenUsage().as_dict()

    @staticmethod
    def _merge_usage(
        current: dict[str, int], usage: RadarTokenUsage
    ) -> dict[str, int]:
        incoming = usage.as_dict()
        return {
            key: int(current.get(key, 0)) + value
            for key, value in incoming.items()
        }

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
