from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from app.api.dependencies import CurrentAdmin, DbSession
from app.schemas.digest import (
    AdminDigestListResponse,
    AdminDigestRead,
    DigestUpdate,
)
from app.services.digest_service import (
    DigestNotFoundError,
    DigestService,
    DigestValidationError,
)

router = APIRouter()


def get_digest_service(db: DbSession) -> DigestService:
    return DigestService(db)


DigestServiceDep = Annotated[DigestService, Depends(get_digest_service)]


@router.get("", response_model=AdminDigestListResponse)
def list_digests(
    current_admin: CurrentAdmin,
    service: DigestServiceDep,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=25, ge=1, le=100),
    owner_id: UUID | None = Query(default=None),
) -> AdminDigestListResponse:
    digests, total = service.list_for_admin(
        actor=current_admin,
        offset=offset,
        limit=limit,
        owner_id=owner_id,
    )
    return AdminDigestListResponse(
        items=digests, total=total, offset=offset, limit=limit
    )


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
