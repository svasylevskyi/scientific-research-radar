"""Persist accepted research output; callers own the transaction."""

from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models.digest_run import (
    DigestRun,
    DigestRunBriefing,
    DigestRunPaper,
    DigestRunStage,
    DigestRunStageStatus,
    DigestRunTrendAnalysis,
    Paper,
)
from app.radar.client import RadarClientResult
from app.radar.contracts import (
    DigestBriefingOutput,
    DiscoveryRelevanceOutput,
    PaperSummariesOutput,
    SearchPaper,
    TrendAnalysisOutput,
)
from app.repositories.radar_request_repository import RadarRequestRepository


class RunResultRepository:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.requests = RadarRequestRepository(db)

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
        existing.extend(summary.model_dump(mode="json") for summary in summaries)
        stage.result_data = {"paper_summaries": existing}
        stage.progress_current = len(existing)
        stage.progress_total = progress_total
        self.requests.record_result_metadata(run=run, stage=stage, result=result)

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
        self.requests.record_result_metadata(run=run, stage=stage, result=result)

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
