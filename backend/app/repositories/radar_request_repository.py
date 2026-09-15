"""Request evidence and accepted usage metadata; no provider or tariff calls."""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.digest_run import (
    DigestRun,
    DigestRunStage,
)
from app.models.radar_request import RadarRequest
from app.radar.client import RadarClientResult, RadarTokenUsage


class RadarRequestRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def record_response_started(
        self, *, run: DigestRun, stage: DigestRunStage, response_id: str
    ) -> None:
        stage.active_response_id = response_id
        run.request_count += 1

    def clear_active_response(self, *, stage: DigestRunStage) -> None:
        stage.active_response_id = None

    def record_result_metadata(
        self,
        *,
        run: DigestRun,
        stage: DigestRunStage,
        result: RadarClientResult,
    ) -> None:
        if result.response_id:
            request = self.db.scalar(
                select(RadarRequest).where(
                    RadarRequest.response_id == result.response_id,
                    RadarRequest.run_id == run.id,
                )
            )
            if request is not None:
                request.outcome = "accepted"
            stage.response_ids = [*stage.response_ids, result.response_id]
            run.openai_response_id = result.response_id
        stage.active_response_id = None
        stage.model_name = result.model_name
        stage.usage_data = self._merge_usage(stage.usage_data, result.usage)
        run.model_name = result.model_name

    @staticmethod
    def _merge_usage(current: dict[str, int], usage: RadarTokenUsage) -> dict[str, int]:
        incoming = usage.as_dict()
        return {
            key: int(current.get(key, 0)) + value for key, value in incoming.items()
        }

    def reject_latest(self, *, run_id: UUID, stage_id: UUID) -> None:

        latest_request = self.db.scalar(
            select(RadarRequest)
            .where(
                RadarRequest.run_id == run_id,
                RadarRequest.stage_id == stage_id,
                RadarRequest.outcome == "unconfirmed",
            )
            .order_by(RadarRequest.created_at.desc(), RadarRequest.observed_at.desc())
            .limit(1)
        )
        if latest_request is not None:
            latest_request.outcome = (
                "rejected" if latest_request.status == "completed" else "interrupted"
            )

    def find_by_response(
        self, *, run_id: UUID, response_id: str
    ) -> RadarRequest | None:
        return self.db.scalar(
            select(RadarRequest).where(
                RadarRequest.response_id == response_id,
                RadarRequest.run_id == run_id,
            )
        )
