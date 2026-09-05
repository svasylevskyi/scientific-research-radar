import logging
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.digest_run import DigestRun
from app.repositories.digest_repository import DigestRepository
from app.repositories.digest_run_repository import DigestRunRepository
from app.radar.client import RadarClient, RadarClientError
from app.radar.prompt_builder import RadarPromptBuilder
from app.schemas.digest import DigestRead

logger = logging.getLogger(__name__)


class RadarDigestNotFoundError(ValueError):
    pass


class RadarRunAlreadyActiveError(ValueError):
    pass


class RadarExecutionError(RuntimeError):
    pass


class RadarRunner:
    def __init__(
        self,
        db: Session,
        *,
        client: RadarClient,
        prompt_builder: RadarPromptBuilder,
        history_limit: int,
    ) -> None:
        self.db = db
        self.client = client
        self.prompt_builder = prompt_builder
        self.history_limit = history_limit
        self.digests = DigestRepository(db)
        self.runs = DigestRunRepository(db)

    def run_digest(self, *, digest_id: UUID, owner_id: UUID) -> DigestRun:
        digest = self.digests.get_for_owner(digest_id=digest_id, owner_id=owner_id)
        if digest is None:
            raise RadarDigestNotFoundError("Digest not found")
        if self.runs.has_running(digest_id=digest.id):
            raise RadarRunAlreadyActiveError("A radar run is already in progress")

        digest_snapshot = DigestRead.model_validate(digest).model_dump(mode="json")
        history_context = self.runs.build_history_context(
            digest_id=digest.id, limit=self.history_limit
        )
        prompt = self.prompt_builder.build(
            digest_snapshot=digest_snapshot,
            history_context=history_context,
        )
        run = self.runs.create_running(
            digest_id=digest.id,
            digest_snapshot=digest_snapshot,
            history_context=history_context,
            model_name=self.client.model_name,
            prompt_version=prompt.version,
        )
        self.db.commit()
        run_id = run.id

        try:
            result = self.client.execute(prompt)
            if len(result.output.search.papers) > digest.maximum_papers:
                raise RadarClientError(
                    "The radar returned more papers than the digest maximum"
                )
            current_run = self.runs.get(run_id)
            if current_run is None:
                raise RadarClientError("The radar run could not be reloaded")
            self.runs.save_output(
                run=current_run,
                output=result.output,
                response_id=result.response_id,
                model_name=result.model_name,
            )
            self.db.commit()
        except Exception as exc:
            logger.exception(
                "Radar run %s failed for digest %s",
                run_id,
                digest.id,
            )
            self.db.rollback()
            failed_run = self.runs.get(run_id)
            if failed_run is not None:
                self.runs.mark_failed(run=failed_run, message=str(exc))
                self.db.commit()
            raise RadarExecutionError("The radar run failed") from exc

        completed = self.runs.get_owned(
            digest_id=digest.id, run_id=run_id, owner_id=owner_id
        )
        if completed is None:
            raise RadarExecutionError("The completed radar run could not be loaded")
        return completed
