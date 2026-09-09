from datetime import datetime, timedelta, timezone
import logging
from typing import Any
from uuid import UUID

from app.ops import heartbeat

from sqlalchemy import update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.digest_run import (
    DigestRun,
    DigestRunStage,
    DigestRunStageStatus,
    DigestRunStageType,
    DigestRunStatus,
    DigestRunTrigger,
)
from app.repositories.digest_repository import DigestRepository
from app.repositories.digest_run_repository import DigestRunRepository
from app.radar.client import RadarClient, RadarClientError
from app.radar.contracts import (
    DigestBriefingOutput,
    DiscoveryRelevanceOutput,
    PaperSummariesOutput,
    TrendAnalysisOutput,
)
from app.radar.prompt_builder import RadarPromptBuilder
from app.schemas.digest import DigestRead
from app.core.config import get_settings
from app.services.rate_limit_service import enforce

logger = logging.getLogger(__name__)


class RadarDigestNotFoundError(ValueError):
    pass


class RadarRunAlreadyActiveError(ValueError):
    pass


class RadarRunNotRetryableError(ValueError):
    pass


class RadarOutputValidationError(RadarClientError):
    """A completed response cannot be reused because its output was rejected."""


class RadarRunner:
    def __init__(
        self,
        db: Session,
        *,
        client: RadarClient,
        prompt_builder: RadarPromptBuilder,
        history_limit: int,
        summary_batch_size: int,
        reasoning_efforts: dict[DigestRunStageType, str],
        worker_id: str | None = None,
        lease_seconds: int = 60,
        settings=None,
    ) -> None:
        self.settings = settings or get_settings()
        self.db = db
        self.client = client
        self.prompt_builder = prompt_builder
        self.history_limit = history_limit
        self.summary_batch_size = summary_batch_size
        self.reasoning_efforts = reasoning_efforts
        self.worker_id = worker_id
        self.lease_seconds = lease_seconds
        self.digests = DigestRepository(db)
        self.runs = DigestRunRepository(db)

    def start_digest(self, *, digest_id: UUID, owner_id: UUID,
                     scheduled_for: datetime | None = None, time_zone: str = "UTC",
                     commit: bool = True) -> DigestRun:
        digest = self.digests.get_for_owner(digest_id=digest_id, owner_id=owner_id)
        if digest is None:
            raise RadarDigestNotFoundError("Digest not found")
        if self.runs.has_running_for_owner(owner_id=owner_id):
            raise RadarRunAlreadyActiveError(
                "Another digest run is already in progress for your account. "
                "Wait for it to finish before starting a new run."
            )

        self._reserve_run_budget(owner_id)
        digest_snapshot = DigestRead.model_validate(digest).model_dump(
            mode="json", exclude={"schedule", "schedule_next_at", "schedule_exhausted"}
        )
        if scheduled_for is not None:
            from zoneinfo import ZoneInfo
            end = scheduled_for.astimezone(ZoneInfo(time_zone)).date()
            start = end - (digest.reporting_to - digest.reporting_from)
            digest_snapshot.update(reporting_from=start.isoformat(), reporting_to=end.isoformat())
        history_context = self.runs.build_history_context(
            digest_id=digest.id, limit=self.history_limit
        )
        feedback_context = self.runs.build_feedback_context(digest_id=digest.id)
        first_prompt = self.prompt_builder.build_discovery_relevance(
            digest_snapshot=digest_snapshot,
            history_context=history_context,
            feedback_context=feedback_context,
        )
        run = self.runs.create_running(
            digest_id=digest.id,
            owner_id=owner_id,
            digest_snapshot=digest_snapshot,
            history_context=history_context,
            feedback_context=feedback_context,
            model_name=self.client.model_name,
            prompt_version=first_prompt.version,
        )
        if scheduled_for is not None:
            run.trigger = DigestRunTrigger.SCHEDULED
            run.scheduled_for = scheduled_for
        if not commit:
            return run
        try:
            self.db.commit()
        except IntegrityError as exc:
            self.db.rollback()
            if self.runs.has_running_for_owner(owner_id=owner_id):
                raise RadarRunAlreadyActiveError(
                    "Another digest run is already in progress for your account. "
                    "Wait for it to finish before starting a new run."
                ) from exc
            raise
        return self.runs.get(run.id) or run

    def retry_digest(
        self, *, digest_id: UUID, run_id: UUID, owner_id: UUID
    ) -> DigestRun:
        run = self.runs.get_owned(
            digest_id=digest_id, run_id=run_id, owner_id=owner_id
        )
        if run is None:
            raise RadarDigestNotFoundError("Digest run not found")
        if run.status != DigestRunStatus.FAILED:
            raise RadarRunNotRetryableError("Only a failed radar run can be retried")
        if self.runs.has_running_for_owner(owner_id=owner_id):
            raise RadarRunAlreadyActiveError(
                "Another digest run is already in progress for your account. "
                "Wait for it to finish before retrying this run."
            )
        self._reserve_run_budget(owner_id)
        claimed = self.db.execute(update(DigestRun).where(
            DigestRun.id == run.id, DigestRun.status == DigestRunStatus.FAILED
        ).values(status=DigestRunStatus.QUEUED), execution_options={"synchronize_session": False})
        if claimed.rowcount != 1:
            self.db.rollback()
            raise RadarRunNotRetryableError("This run was already retried. Refresh its progress.")
        self.runs.requeue_failed(run=run)
        try:
            self.db.commit()
        except IntegrityError as exc:
            self.db.rollback()
            raise RadarRunAlreadyActiveError(
                "Another digest run is already in progress for your account."
            ) from exc
        return self.runs.get(run_id) or run

    def _reserve_run_budget(self, owner_id):
        # Count accepted starts/retries atomically with enqueue. Failed enqueue rolls back.
        enforce(self.db, self.settings, "radar-hour", str(owner_id), self.settings.radar_runs_per_hour, 3600, commit=False)
        enforce(self.db, self.settings, "radar-day", str(owner_id), self.settings.radar_runs_per_day, 86400, commit=False)

    def execute_run(self, *, run_id: UUID) -> None:
        run = self.runs.get(run_id)
        if run is None or run.status != DigestRunStatus.RUNNING:
            return

        active_stage: DigestRunStageType | None = None
        try:
            active_stage = DigestRunStageType.DISCOVERY_RELEVANCE
            discovery = self._execute_discovery(run)

            active_stage = DigestRunStageType.PAPER_SUMMARIES
            summaries = self._execute_summaries(run_id=run_id, discovery=discovery)

            active_stage = DigestRunStageType.TREND_ANALYSIS
            trend = self._execute_trends(
                run_id=run_id,
                discovery=discovery,
                summaries=summaries,
            )

            active_stage = DigestRunStageType.DIGEST_BRIEFING
            self._execute_briefing(
                run_id=run_id,
                discovery=discovery,
                summaries=summaries,
                trend=trend,
            )

            completed_run = self._reload(run_id)
            self.runs.mark_completed(run=completed_run)
            self.db.commit()
        except Exception as exc:
            logger.exception("Radar run %s failed during %s", run_id, active_stage)
            self.db.rollback()
            failed_run = self.runs.get(run_id)
            if failed_run is None or active_stage is None:
                return
            if self.worker_id is not None and failed_run.worker_id != self.worker_id:
                logger.warning(
                    "Worker %s no longer owns radar run %s; leaving recovery to its current worker",
                    self.worker_id,
                    run_id,
                )
                return
            failed_stage = self._stage(failed_run, active_stage)
            from sqlalchemy import select
            from app.models.radar_request import RadarRequest
            latest_request = self.db.scalar(select(RadarRequest).where(
                RadarRequest.run_id == run_id,
                RadarRequest.stage_id == failed_stage.id,
                RadarRequest.outcome == "unconfirmed",
            ).order_by(RadarRequest.created_at.desc(), RadarRequest.observed_at.desc()).limit(1))
            if latest_request is not None:
                latest_request.outcome = "rejected" if latest_request.status == "completed" else "interrupted"

            if isinstance(exc, RadarOutputValidationError):
                self.runs.clear_active_response(stage=failed_stage)
            message = f"{self._stage_label(active_stage)} failed: {exc}"
            self.runs.mark_failed(
                run=failed_run,
                stage=failed_stage,
                message=message,
            )
            self.db.commit()

    def _execute_discovery(self, run: DigestRun) -> DiscoveryRelevanceOutput:
        stage = self._stage(run, DigestRunStageType.DISCOVERY_RELEVANCE)
        if stage.status == DigestRunStageStatus.COMPLETED and stage.result_data:
            return DiscoveryRelevanceOutput.model_validate(stage.result_data)

        self.runs.mark_stage_running(stage=stage)
        self.db.commit()
        prompt = self.prompt_builder.build_discovery_relevance(
            digest_snapshot=run.digest_snapshot,
            history_context=run.history_context,
            feedback_context=run.feedback_context,
        )
        result = self._execute_client(
            run=run,
            stage=stage,
            prompt=prompt,
            response_format=DiscoveryRelevanceOutput,
            use_web_search=True,
            reasoning_effort=self.reasoning_efforts[stage.stage],
        )
        maximum_papers = int(run.digest_snapshot["maximum_papers"])
        if len(result.output.search.papers) > maximum_papers:
            raise RadarOutputValidationError(
                "The discovery stage returned more papers than the digest maximum"
            )
        self.runs.save_discovery_relevance(run=run, stage=stage, result=result)
        self.db.commit()
        return result.output

    def _execute_summaries(
        self,
        *,
        run_id: UUID,
        discovery: DiscoveryRelevanceOutput,
    ) -> PaperSummariesOutput:
        run = self._reload(run_id)
        stage = self._stage(run, DigestRunStageType.PAPER_SUMMARIES)
        if stage.status == DigestRunStageStatus.COMPLETED and stage.result_data:
            return PaperSummariesOutput.model_validate(stage.result_data)

        papers = self._summary_input(discovery)
        existing = list((stage.result_data or {}).get("paper_summaries", []))
        completed_ids = {item["external_id"] for item in existing}
        remaining = [paper for paper in papers if paper["external_id"] not in completed_ids]
        self.runs.mark_stage_running(stage=stage, progress_total=len(papers))
        stage.result_data = {"paper_summaries": existing}
        stage.progress_current = len(existing)
        self.db.commit()

        for start in range(0, len(remaining), self.summary_batch_size):
            batch = remaining[start : start + self.summary_batch_size]
            prompt = self.prompt_builder.build_paper_summaries(
                digest_snapshot=run.digest_snapshot,
                feedback_context=run.feedback_context,
                papers=batch,
            )
            result = self._execute_client(
                run=run,
                stage=stage,
                prompt=prompt,
                response_format=PaperSummariesOutput,
                use_web_search=False,
                reasoning_effort=self.reasoning_efforts[stage.stage],
            )
            expected_ids = {paper["external_id"] for paper in batch}
            actual_ids = {
                summary.external_id for summary in result.output.paper_summaries
            }
            if actual_ids != expected_ids:
                raise RadarOutputValidationError(
                    "The summary stage must return exactly one summary for each batch paper"
                )
            self.runs.save_summary_batch(
                run=run,
                stage=stage,
                result=result,
                progress_total=len(papers),
            )
            self.db.commit()

        self.runs.complete_summary_stage(stage=stage, progress_total=len(papers))
        self.db.commit()
        return PaperSummariesOutput.model_validate(stage.result_data)

    def _execute_trends(
        self,
        *,
        run_id: UUID,
        discovery: DiscoveryRelevanceOutput,
        summaries: PaperSummariesOutput,
    ) -> TrendAnalysisOutput:
        run = self._reload(run_id)
        stage = self._stage(run, DigestRunStageType.TREND_ANALYSIS)
        if stage.status == DigestRunStageStatus.COMPLETED and stage.result_data:
            return TrendAnalysisOutput.model_validate(stage.result_data)

        self.runs.mark_stage_running(stage=stage)
        self.db.commit()
        prompt = self.prompt_builder.build_trend_analysis(
            digest_snapshot=run.digest_snapshot,
            history_context=run.history_context,
            feedback_context=run.feedback_context,
            papers=self._trend_input(discovery, summaries),
        )
        result = self._execute_client(
            run=run,
            stage=stage,
            prompt=prompt,
            response_format=TrendAnalysisOutput,
            use_web_search=False,
            reasoning_effort=self.reasoning_efforts[stage.stage],
        )
        self._validate_references(
            referenced_ids=self._trend_references(result.output),
            known_ids={paper.external_id for paper in discovery.search.papers},
            stage="trend analysis",
        )
        self.runs.save_trend_analysis(run=run, stage=stage, result=result)
        self.db.commit()
        return result.output

    def _execute_briefing(
        self,
        *,
        run_id: UUID,
        discovery: DiscoveryRelevanceOutput,
        summaries: PaperSummariesOutput,
        trend: TrendAnalysisOutput,
    ) -> DigestBriefingOutput:
        run = self._reload(run_id)
        stage = self._stage(run, DigestRunStageType.DIGEST_BRIEFING)
        if stage.status == DigestRunStageStatus.COMPLETED and stage.result_data:
            return DigestBriefingOutput.model_validate(stage.result_data)

        self.runs.mark_stage_running(stage=stage)
        self.db.commit()
        prompt = self.prompt_builder.build_digest_briefing(
            digest_snapshot=run.digest_snapshot,
            feedback_context=run.feedback_context,
            papers=self._briefing_input(discovery, summaries),
            trend_analysis=trend.trend_analysis.model_dump(mode="json"),
        )
        result = self._execute_client(
            run=run,
            stage=stage,
            prompt=prompt,
            response_format=DigestBriefingOutput,
            use_web_search=False,
            reasoning_effort=self.reasoning_efforts[stage.stage],
        )
        self._validate_references(
            referenced_ids=self._briefing_references(result.output),
            known_ids={paper.external_id for paper in discovery.search.papers},
            stage="digest briefing",
        )
        self.runs.save_digest_briefing(run=run, stage=stage, result=result)
        self.db.commit()
        return result.output

    def _execute_client(
        self,
        *,
        run: DigestRun,
        stage: DigestRunStage,
        prompt,
        response_format: type,
        use_web_search: bool,
        reasoning_effort: str,
    ):
        from sqlalchemy import select
        from app.models.radar_request import RadarRequest

        current_request = None

        def observe(event: dict) -> None:
            nonlocal current_request
            self._renew_lease(run)
            if event["event"] == "submitted":
                from app.services.radar_pricing_service import current_price
                price = current_price(self.db, self.client.model_name)
                current_request = RadarRequest(
                    run_id=run.id, stage_id=stage.id, model_name=self.client.model_name,
                    reasoning_effort=reasoning_effort,
                    pricing=price,
                )
                self.db.add(current_request)
            else:
                existing = self.db.scalar(select(RadarRequest).where(
                    RadarRequest.response_id == event["response_id"],
                    RadarRequest.run_id == run.id,
                ))
                if existing:
                    current_request = existing
                if current_request is None:
                    # Resuming a pre-ledger job: usage is real, original pricing unknown.
                    current_request = RadarRequest(
                        run_id=run.id, stage_id=stage.id, model_name=event["model_name"],
                        reasoning_effort=reasoning_effort,
                    )
                    self.db.add(current_request)
                current_request.response_id = event["response_id"]
                if current_request.model_name != event["model_name"]:
                    # Never silently apply an alias tariff to a different returned model.
                    current_request.pricing = None
                current_request.model_name = event["model_name"]
                current_request.status = event["status"]
                if event["usage"] is not None:
                    current_request.usage = event["usage"]
                current_request.web_search_calls = event["web_search_calls"]
                current_request.service_tier = event["service_tier"]
                current_request.observed_at = datetime.now(timezone.utc)
            self.db.commit()

        def persist_response_id(response_id: str) -> None:
            self._renew_lease(run)
            self.runs.record_response_started(
                run=run, stage=stage, response_id=response_id
            )
            if current_request is not None:
                current_request.response_id = response_id
            self.db.commit()

        def clear_lost_response() -> None:
            self.runs.clear_active_response(stage=stage)
            self.db.commit()

        return self.client.execute(
            prompt,
            response_format=response_format,
            use_web_search=use_web_search,
            reasoning_effort=reasoning_effort,
            existing_response_id=stage.active_response_id,
            on_response_started=persist_response_id,
            on_response_lost=clear_lost_response,
            on_poll=lambda: self._heartbeat(run),
            on_usage=observe,
        )

    def _heartbeat(self, run: DigestRun) -> None:
        self._renew_lease(run)
        self.db.commit()

    def _renew_lease(self, run: DigestRun) -> None:
        heartbeat()
        if self.worker_id is not None:
            renewed = self.runs.renew_lease(
                run_id=run.id,
                worker_id=self.worker_id,
                lease_expires_at=datetime.now(timezone.utc)
                + timedelta(seconds=self.lease_seconds),
            )
            if not renewed:
                self.db.rollback()
                raise RadarClientError(
                    "This worker lost its radar run lease; another worker may resume it"
                )

    def _reload(self, run_id: UUID) -> DigestRun:
        self.db.expire_all()
        run = self.runs.get(run_id)
        if run is None:
            raise RadarClientError("The radar run could not be reloaded")
        return run

    @staticmethod
    def _stage(run: DigestRun, stage_type: DigestRunStageType) -> DigestRunStage:
        for stage in run.stages:
            if stage.stage == stage_type:
                return stage
        raise RadarClientError(f"Missing persisted stage: {stage_type.value}")

    @staticmethod
    def _stage_label(stage: DigestRunStageType) -> str:
        return stage.value.replace("_", " ").capitalize()

    @staticmethod
    def _summary_input(
        discovery: DiscoveryRelevanceOutput,
    ) -> list[dict[str, Any]]:
        relevance_by_id = {
            item.external_id: item for item in discovery.relevance.assessments
        }
        return [
            {
                **paper.model_dump(mode="json"),
                "relevance": relevance_by_id[paper.external_id].model_dump(
                    mode="json"
                ),
            }
            for paper in discovery.search.papers
            if relevance_by_id[paper.external_id].recommended_status
            in {"summarize", "mention_briefly"}
        ]

    @staticmethod
    def _trend_input(
        discovery: DiscoveryRelevanceOutput,
        summaries: PaperSummariesOutput,
    ) -> list[dict[str, Any]]:
        relevance_by_id = {
            item.external_id: item for item in discovery.relevance.assessments
        }
        summary_by_id = {
            item.external_id: item for item in summaries.paper_summaries
        }
        return [
            {
                "external_id": paper.external_id,
                "title": paper.title,
                "authors": paper.authors,
                "published_date": (
                    paper.published_date.isoformat() if paper.published_date else None
                ),
                "url": paper.url,
                "source_name": paper.source_name,
                "access_status": paper.access_status,
                "relevance": relevance_by_id[paper.external_id].model_dump(
                    mode="json"
                ),
                "summary": summary_by_id[paper.external_id].model_dump(
                    mode="json"
                ),
            }
            for paper in discovery.search.papers
            if paper.external_id in summary_by_id
        ]

    @staticmethod
    def _briefing_input(
        discovery: DiscoveryRelevanceOutput,
        summaries: PaperSummariesOutput,
    ) -> list[dict[str, Any]]:
        relevance_by_id = {
            item.external_id: item for item in discovery.relevance.assessments
        }
        summary_by_id = {
            item.external_id: item for item in summaries.paper_summaries
        }
        return [
            {
                "external_id": paper.external_id,
                "title": paper.title,
                "authors": paper.authors,
                "url": paper.url,
                "relevance_score": relevance_by_id[paper.external_id].score,
                "recommended_status": relevance_by_id[
                    paper.external_id
                ].recommended_status,
                "concise_summary": summary_by_id[paper.external_id].concise_summary,
                "key_findings": summary_by_id[paper.external_id].key_findings,
                "limitations": summary_by_id[paper.external_id].limitations,
                "suggested_digest_bullet": summary_by_id[
                    paper.external_id
                ].suggested_digest_bullet,
                "confidence_score": summary_by_id[
                    paper.external_id
                ].confidence_score,
            }
            for paper in discovery.search.papers
            if paper.external_id in summary_by_id
        ]

    @staticmethod
    def _trend_references(output: TrendAnalysisOutput) -> set[str]:
        trend = output.trend_analysis
        groups = [
            *(item.evidence_external_ids for item in trend.themes),
            *(item.supporting_external_ids for item in trend.emerging_items),
            *(
                item.supporting_external_ids
                for item in trend.repeated_limitations_or_unresolved_problems
            ),
            *(
                item.supporting_external_ids
                for item in trend.contradictions_or_competing_approaches
            ),
            *(item.supporting_external_ids for item in trend.weak_signals),
            *(item.supporting_external_ids for item in trend.changes_vs_previous_digest),
            *(item.supporting_external_ids for item in trend.practical_implications),
        ]
        return {external_id for group in groups for external_id in group}

    @staticmethod
    def _briefing_references(output: DigestBriefingOutput) -> set[str]:
        briefing = output.digest_briefing
        groups = [
            briefing.top_paper_external_ids,
            briefing.secondary_paper_external_ids,
            *(item.related_external_ids for item in briefing.recommendations),
        ]
        if briefing.main_signal is not None:
            groups.append(briefing.main_signal.supporting_external_ids)
        return {external_id for group in groups for external_id in group}

    @staticmethod
    def _validate_references(
        *, referenced_ids: set[str], known_ids: set[str], stage: str
    ) -> None:
        unknown = referenced_ids - known_ids
        if unknown:
            raise RadarOutputValidationError(
                f"The {stage} referenced unknown papers: " + ", ".join(sorted(unknown))
            )
