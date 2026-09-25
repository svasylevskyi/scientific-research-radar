from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from app.api.dependencies import CurrentAdmin, DbSession
from app.schemas.digest import (
    AdminDigestListResponse,
    AdminDigestRead,
    DigestUpdate,
)
from app.schemas.digest_run import DigestRunDetailRead, DigestRunListResponse
from app.schemas.research_quality import QualityEvaluationHistory, QualityEvaluationRead, QualityEvaluationRequest
from app.schemas.source_verification import SourceVerificationHistory, SourceVerificationRead
from app.schemas.source_content import RunContentRead
from app.services.source_content_service import stored_documents
from app.radar.contracts import PaperSummariesOutput
from app.radar.evidence import inspect_summary
from app.services.source_verification_service import source_history, verify_manually
from app.services.manual_quality_service import ManualQualityUnavailableError, evaluate_manually, evaluation_history
from app.services.digest_service import (
    DigestNotFoundError,
    DigestRunActiveError,
    DigestService,
    DigestValidationError,
)
from app.services.digest_run_service import DigestRunHistoryService, DigestRunNotFoundError

router = APIRouter()


def get_digest_service(db: DbSession) -> DigestService:
    return DigestService(db)


DigestServiceDep = Annotated[DigestService, Depends(get_digest_service)]


def get_run_history_service(db: DbSession) -> DigestRunHistoryService:
    return DigestRunHistoryService(db)


RunHistoryServiceDep = Annotated[
    DigestRunHistoryService, Depends(get_run_history_service)
]


@router.get("", response_model=AdminDigestListResponse)
def list_digests(
    current_admin: CurrentAdmin,
    service: DigestServiceDep,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=25, ge=1, le=100),
    owner_id: UUID | None = Query(default=None),
    owner_query: str | None = Query(default=None, max_length=120),
) -> AdminDigestListResponse:
    digests, total = service.list_for_admin(
        actor=current_admin,
        offset=offset,
        limit=limit,
        owner_id=owner_id,
        owner_query=owner_query,
    )
    return AdminDigestListResponse(
        items=digests, total=total, offset=offset, limit=limit
    )


@router.get("/{digest_id}/runs", response_model=DigestRunListResponse)
def list_digest_runs(
    digest_id: UUID,
    current_admin: CurrentAdmin,
    service: RunHistoryServiceDep,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=25, ge=1, le=100),
) -> DigestRunListResponse:
    try:
        runs, total = service.list_for_admin(
            actor=current_admin, digest_id=digest_id, offset=offset, limit=limit
        )
    except DigestNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return DigestRunListResponse(items=runs, total=total, offset=offset, limit=limit)


@router.get("/{digest_id}/runs/{run_id}", response_model=DigestRunDetailRead)
def get_digest_run(
    digest_id: UUID,
    run_id: UUID,
    current_admin: CurrentAdmin,
    service: RunHistoryServiceDep,
) -> DigestRunDetailRead:
    try:
        return DigestRunDetailRead.model_validate(
            service.get_for_admin(
                actor=current_admin, digest_id=digest_id, run_id=run_id
            )
        )
    except (DigestNotFoundError, DigestRunNotFoundError) as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.get("/{digest_id}/runs/{run_id}/quality-evaluations", response_model=QualityEvaluationHistory)
def list_quality_evaluations(
    digest_id: UUID, run_id: UUID, current_admin: CurrentAdmin,
    service: RunHistoryServiceDep, db: DbSession,
    offset: int = Query(0, ge=0), limit: int = Query(20, ge=1, le=100),
) -> QualityEvaluationHistory:
    try:
        run = service.get_for_admin(actor=current_admin, digest_id=digest_id, run_id=run_id)
        return evaluation_history(db, run=run, offset=offset, limit=limit)
    except (DigestNotFoundError, DigestRunNotFoundError) as exc:
        raise HTTPException(404, str(exc)) from exc


@router.post("/{digest_id}/runs/{run_id}/quality-evaluations", status_code=201, response_model=QualityEvaluationRead)
def evaluate_run_quality(
    digest_id: UUID, run_id: UUID, payload: QualityEvaluationRequest,
    current_admin: CurrentAdmin, service: RunHistoryServiceDep, db: DbSession,
) -> QualityEvaluationRead:
    try:
        run = service.get_for_admin(actor=current_admin, digest_id=digest_id, run_id=run_id)
        return evaluate_manually(db, run=run, actor=current_admin,
            expected_settings_version=payload.expected_settings_version)
    except (DigestNotFoundError, DigestRunNotFoundError) as exc:
        raise HTTPException(404, str(exc)) from exc
    except ManualQualityUnavailableError as exc:
        raise HTTPException(409, str(exc)) from exc


@router.get("/{digest_id}/runs/{run_id}/source-content", response_model=RunContentRead)
def get_run_source_content(digest_id: UUID, run_id: UUID, current_admin: CurrentAdmin,
                           service: RunHistoryServiceDep, db: DbSession) -> RunContentRead:
    try:
        run = service.get_for_admin(actor=current_admin, digest_id=digest_id, run_id=run_id)
    except (DigestNotFoundError, DigestRunNotFoundError) as exc:
        raise HTTPException(404, str(exc)) from exc
    documents = stored_documents(db, run.id)
    summary_stage = next((stage for stage in run.stages if str(stage.stage) == "paper_summaries"), None)
    summaries = PaperSummariesOutput.model_validate(summary_stage.result_data if summary_stage and summary_stage.result_data else {"paper_summaries": []})
    by_id = {summary.external_id: summary for summary in summaries.paper_summaries}
    return RunContentRead(items=[inspect_summary(document, by_id.get(key)) for key, document in documents.items()],
                          legacy=run.prompt_version < "2026-09-25.1")


@router.get("/{digest_id}/runs/{run_id}/source-verifications", response_model=SourceVerificationHistory)
def list_source_verifications(
    digest_id: UUID, run_id: UUID, current_admin: CurrentAdmin,
    service: RunHistoryServiceDep, db: DbSession,
    offset: int = Query(0, ge=0), limit: int = Query(5, ge=1, le=20),
) -> SourceVerificationHistory:
    try:
        run = service.get_for_admin(actor=current_admin, digest_id=digest_id, run_id=run_id)
        return source_history(db, run=run, offset=offset, limit=limit)
    except (DigestNotFoundError, DigestRunNotFoundError) as exc:
        raise HTTPException(404, str(exc)) from exc


@router.post("/{digest_id}/runs/{run_id}/source-verifications", status_code=201, response_model=SourceVerificationRead)
def verify_run_sources(
    digest_id: UUID, run_id: UUID, payload: QualityEvaluationRequest,
    current_admin: CurrentAdmin, service: RunHistoryServiceDep, db: DbSession,
) -> SourceVerificationRead:
    try:
        run = service.get_for_admin(actor=current_admin, digest_id=digest_id, run_id=run_id)
        return verify_manually(db, run=run, actor=current_admin,
            expected_settings_version=payload.expected_settings_version)
    except (DigestNotFoundError, DigestRunNotFoundError) as exc:
        raise HTTPException(404, str(exc)) from exc
    except ManualQualityUnavailableError as exc:
        raise HTTPException(409, str(exc)) from exc


@router.get("/{digest_id}/runs/{run_id}/costs")
def get_digest_run_costs(
    digest_id: UUID, run_id: UUID, current_admin: CurrentAdmin,
    service: RunHistoryServiceDep, db: DbSession,
):
    from app.services.radar_cost_service import run_costs
    try:
        run = service.get_for_admin(actor=current_admin, digest_id=digest_id, run_id=run_id)
        return run_costs(db, run)
    except (DigestNotFoundError, DigestRunNotFoundError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/{digest_id}/costs")
def get_digest_costs(digest_id: UUID, current_admin: CurrentAdmin,
                     service: DigestServiceDep, db: DbSession):
    from app.services.radar_cost_service import digest_costs
    _run(lambda: service.get_for_admin(actor=current_admin, digest_id=digest_id))
    return digest_costs(db, digest_id)


@router.get("/{digest_id}", response_model=AdminDigestRead)
def get_digest(
    digest_id: UUID,
    current_admin: CurrentAdmin,
    service: DigestServiceDep,
) -> AdminDigestRead:
    return _run(lambda: service.get_for_admin(actor=current_admin, digest_id=digest_id))


@router.patch("/{digest_id}", response_model=AdminDigestRead)
def update_digest(
    digest_id: UUID,
    payload: DigestUpdate,
    current_admin: CurrentAdmin,
    service: DigestServiceDep,
) -> AdminDigestRead:
    return _run(
        lambda: service.update_for_admin(
            actor=current_admin, digest_id=digest_id, changes=payload
        )
    )


@router.delete("/{digest_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_digest(
    digest_id: UUID,
    current_admin: CurrentAdmin,
    service: DigestServiceDep,
) -> Response:
    _run(lambda: service.delete_for_admin(actor=current_admin, digest_id=digest_id))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _run(operation):
    try:
        return operation()
    except DigestNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except DigestValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)
        ) from exc
    except DigestRunActiveError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
