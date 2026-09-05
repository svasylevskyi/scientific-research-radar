from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from app.api.dependencies import CurrentUser, DbSession
from app.schemas.digest import DigestCreate, DigestListResponse, DigestRead, DigestUpdate
from app.services.digest_service import (
    DigestNotFoundError,
    DigestService,
    DigestValidationError,
)

router = APIRouter()


def get_digest_service(db: DbSession) -> DigestService:
    return DigestService(db)


DigestServiceDep = Annotated[DigestService, Depends(get_digest_service)]


@router.post("", response_model=DigestRead, status_code=status.HTTP_201_CREATED)
def create_digest(
    payload: DigestCreate,
    current_user: CurrentUser,
    service: DigestServiceDep,
) -> DigestRead:
    return DigestRead.model_validate(service.create(owner=current_user, values=payload))


@router.get("", response_model=DigestListResponse)
def list_digests(
    current_user: CurrentUser,
    service: DigestServiceDep,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=25, ge=1, le=100),
) -> DigestListResponse:
    digests, total = service.list_owned(owner=current_user, offset=offset, limit=limit)
    return DigestListResponse(items=digests, total=total, offset=offset, limit=limit)


@router.get("/{digest_id}", response_model=DigestRead)
def get_digest(
    digest_id: UUID,
    current_user: CurrentUser,
    service: DigestServiceDep,
) -> DigestRead:
    return _run(lambda: service.get_owned(owner=current_user, digest_id=digest_id))


@router.patch("/{digest_id}", response_model=DigestRead)
def update_digest(
    digest_id: UUID,
    payload: DigestUpdate,
    current_user: CurrentUser,
    service: DigestServiceDep,
) -> DigestRead:
    return _run(
        lambda: service.update_owned(
            owner=current_user, digest_id=digest_id, changes=payload
        )
    )


@router.delete("/{digest_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_digest(
    digest_id: UUID,
    current_user: CurrentUser,
    service: DigestServiceDep,
) -> Response:
    _run(lambda: service.delete_owned(owner=current_user, digest_id=digest_id))
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
