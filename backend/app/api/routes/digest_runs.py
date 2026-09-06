from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api.dependencies import AppSettings, CurrentUser, DbSession
from app.models.digest_run import DigestRunStageType
from app.radar.client import RadarNotConfiguredError, build_radar_client
from app.radar.prompt_builder import RadarPromptBuilder
from app.radar.runner import (
    RadarDigestNotFoundError,
    RadarRunAlreadyActiveError,
    RadarRunNotRetryableError,
    RadarRunner,
)
from app.schemas.digest_run import (
    DigestRunDetailRead,
    DigestRunListResponse,
)
from app.services.digest_run_service import (
    DigestRunHistoryService,
    DigestRunNotFoundError,
)

router = APIRouter()
active_router = APIRouter()


def get_radar_runner(db: DbSession, settings: AppSettings) -> RadarRunner:
    try:
        client = build_radar_client(settings)
    except RadarNotConfiguredError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc
    return RadarRunner(
        db,
        client=client,
        prompt_builder=RadarPromptBuilder(),
        history_limit=settings.radar_history_runs,
        summary_batch_size=settings.openai_radar_summary_batch_size,
        reasoning_efforts={
            DigestRunStageType.DISCOVERY_RELEVANCE: settings.openai_radar_discovery_reasoning_effort,
            DigestRunStageType.PAPER_SUMMARIES: settings.openai_radar_summary_reasoning_effort,
            DigestRunStageType.TREND_ANALYSIS: settings.openai_radar_trend_reasoning_effort,
            DigestRunStageType.DIGEST_BRIEFING: settings.openai_radar_briefing_reasoning_effort,
        },
    )


def get_history_service(db: DbSession) -> DigestRunHistoryService:
    return DigestRunHistoryService(db)


RadarRunnerDep = Annotated[RadarRunner, Depends(get_radar_runner)]
DigestRunHistoryServiceDep = Annotated[
    DigestRunHistoryService, Depends(get_history_service)
]


@router.post("", response_model=DigestRunDetailRead, status_code=status.HTTP_202_ACCEPTED)
def run_digest_now(
    digest_id: UUID,
    current_user: CurrentUser,
    runner: RadarRunnerDep,
) -> DigestRunDetailRead:
    try:
        run = runner.start_digest(digest_id=digest_id, owner_id=current_user.id)
    except RadarDigestNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except RadarRunAlreadyActiveError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    return DigestRunDetailRead.model_validate(run)


@router.post(
    "/{run_id}/retry",
    response_model=DigestRunDetailRead,
    status_code=status.HTTP_202_ACCEPTED,
)
def retry_digest_run(
    digest_id: UUID,
    run_id: UUID,
    current_user: CurrentUser,
    runner: RadarRunnerDep,
) -> DigestRunDetailRead:
    try:
        run = runner.retry_digest(
            digest_id=digest_id, run_id=run_id, owner_id=current_user.id
        )
    except RadarDigestNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except RadarRunAlreadyActiveError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except RadarRunNotRetryableError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)
        ) from exc
    return DigestRunDetailRead.model_validate(run)


@active_router.get("/active", response_model=DigestRunDetailRead | None)
def get_active_digest_run(
    current_user: CurrentUser,
    service: DigestRunHistoryServiceDep,
) -> DigestRunDetailRead | None:
    run = service.get_active(owner=current_user)
    return DigestRunDetailRead.model_validate(run) if run is not None else None


@router.get("", response_model=DigestRunListResponse)
def list_digest_runs(
    digest_id: UUID,
    current_user: CurrentUser,
    service: DigestRunHistoryServiceDep,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=25, ge=1, le=100),
) -> DigestRunListResponse:
    try:
        runs, total = service.list_owned(
            owner=current_user,
            digest_id=digest_id,
            offset=offset,
            limit=limit,
        )
    except DigestRunNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return DigestRunListResponse(items=runs, total=total, offset=offset, limit=limit)


@router.get("/{run_id}", response_model=DigestRunDetailRead)
def get_digest_run(
    digest_id: UUID,
    run_id: UUID,
    current_user: CurrentUser,
    service: DigestRunHistoryServiceDep,
) -> DigestRunDetailRead:
    try:
        run = service.get_owned(owner=current_user, digest_id=digest_id, run_id=run_id)
    except DigestRunNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return DigestRunDetailRead.model_validate(run)
