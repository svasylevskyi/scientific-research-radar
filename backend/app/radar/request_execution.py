"""Provider execution and durable accounting callbacks for one stage request."""

from sqlalchemy import select
from sqlalchemy.orm import Session
from app.models.user import User
from app.radar.client import RadarClientError

from app.models.digest_run import DigestRun, DigestRunStage
from app.radar.client import OutputT, RadarClient, RadarClientResult
from app.radar.lease import RunLease
from app.radar.prompt_builder import RadarPrompt
from app.radar.request_accounting import RequestAccounting


class StageRequestExecutor:
    def __init__(self, db: Session, *, client: RadarClient, lease: RunLease) -> None:
        self.db = db
        self.client = client
        self.lease = lease

    def execute(
        self,
        *,
        run: DigestRun,
        stage: DigestRunStage,
        prompt: RadarPrompt,
        response_format: type[OutputT],
        use_web_search: bool,
        reasoning_effort: str,
    ) -> RadarClientResult[OutputT]:
        if self.db.scalar(select(User.closure_requested_at).where(User.id == run.owner_id)) is not None:
            raise RadarClientError("Account closure stopped further research requests.")
        accounting = RequestAccounting(
            self.db,
            run=run,
            stage=stage,
            model_name=self.client.model_name,
            reasoning_effort=reasoning_effort,
            lease=self.lease,
        )
        return self.client.execute(
            prompt,
            response_format=response_format,
            use_web_search=use_web_search,
            reasoning_effort=reasoning_effort,
            existing_response_id=stage.active_response_id,
            on_response_started=accounting.persist_response_id,
            on_response_lost=accounting.clear_lost_response,
            on_poll=lambda: self.lease.poll(run),
            on_usage=accounting.observe,
        )
