"""Durable per-request accounting, independent of stage acceptance.

Each executor call gets its own collector. Reusing a background response updates
its existing ledger row; an old pre-ledger response gets unknown original pricing.
"""

from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.models.digest_run import DigestRun, DigestRunStage
from app.models.radar_request import RadarRequest
from app.radar.lease import RunLease
from app.repositories.radar_request_repository import RadarRequestRepository
from app.services.radar_pricing_service import current_price


class RequestAccounting:
    def __init__(
        self,
        db: Session,
        *,
        run: DigestRun,
        stage: DigestRunStage,
        model_name: str,
        reasoning_effort: str,
        lease: RunLease,
    ) -> None:
        self.db = db
        self.run = run
        self.stage = stage
        self.model_name = model_name
        self.reasoning_effort = reasoning_effort
        self.lease = lease
        self.requests = RadarRequestRepository(db)
        self.current_request: RadarRequest | None = None

    def observe(self, event: dict[str, Any]) -> None:
        self.lease.renew(self.run)
        if event["event"] == "submitted":
            price = current_price(self.db, self.model_name)
            self.current_request = RadarRequest(
                run_id=self.run.id,
                stage_id=self.stage.id,
                model_name=self.model_name,
                reasoning_effort=self.reasoning_effort,
                pricing={**price, "model_name": self.model_name} if price else None,
                created_at=datetime.now(timezone.utc),
            )
            self.db.add(self.current_request)
        else:
            existing = self.requests.find_by_response(
                run_id=self.run.id, response_id=event["response_id"]
            )
            if existing:
                self.current_request = existing
            if self.current_request is None:
                # Resuming a pre-ledger job: usage is real, original pricing unknown.
                self.current_request = RadarRequest(
                    run_id=self.run.id,
                    stage_id=self.stage.id,
                    model_name=event["model_name"],
                    reasoning_effort=self.reasoning_effort,
                )
                self.db.add(self.current_request)
            self.current_request.response_id = event["response_id"]
            if self.current_request.model_name != event["model_name"]:
                # Prefer an explicit returned-model tariff that existed at submission.
                # Otherwise retain the tariff for the model actually requested: an
                # alias resolving to a version must not erase that snapshot.
                actual_price = current_price(
                    self.db, event["model_name"], as_of=self.current_request.created_at
                )
                if actual_price:
                    self.current_request.pricing = {
                        **actual_price,
                        "model_name": event["model_name"],
                    }
            self.current_request.model_name = event["model_name"]
            self.current_request.status = event["status"]
            if event["usage"] is not None:
                self.current_request.usage = event["usage"]
            self.current_request.web_search_calls = event["web_search_calls"]
            self.current_request.service_tier = event["service_tier"]
            self.current_request.observed_at = datetime.now(timezone.utc)
        self.db.commit()

    def persist_response_id(self, response_id: str) -> None:
        self.lease.renew(self.run)
        self.requests.record_response_started(
            run=self.run, stage=self.stage, response_id=response_id
        )
        if self.current_request is not None:
            self.current_request.response_id = response_id
        self.db.commit()

    def clear_lost_response(self) -> None:
        self.requests.clear_active_response(stage=self.stage)
        self.db.commit()
