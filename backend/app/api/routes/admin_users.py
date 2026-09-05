from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from app.api.dependencies import CurrentAdmin, DbSession
from app.models.user import UserRole
from app.schemas.user import AdminUserUpdate, UserListResponse, UserRead, UserRoleUpdate
from app.services.admin_user_service import (
    AdminActionForbiddenError,
    AdminUserService,
    UserEmailConflictError,
    UserNotFoundError,
)

router = APIRouter()


def get_admin_user_service(db: DbSession) -> AdminUserService:
    return AdminUserService(db)


AdminUserServiceDep = Annotated[AdminUserService, Depends(get_admin_user_service)]


@router.get("", response_model=UserListResponse)
def list_users(
    current_admin: CurrentAdmin,
    service: AdminUserServiceDep,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=25, ge=1, le=100),
    q: str | None = Query(default=None, max_length=120),
) -> UserListResponse:
    users, total = service.list_users(
        actor=current_admin,
        offset=offset,
        limit=limit,
        query=q,
    )
    return UserListResponse(items=users, total=total, offset=offset, limit=limit)


@router.get("/{user_id}", response_model=UserRead)
def get_user(
    user_id: UUID,
    current_admin: CurrentAdmin,
    service: AdminUserServiceDep,
) -> UserRead:
    return _run(lambda: service.get_user(actor=current_admin, user_id=user_id))


@router.patch("/{user_id}", response_model=UserRead)
def update_user(
    user_id: UUID,
    payload: AdminUserUpdate,
    current_admin: CurrentAdmin,
    service: AdminUserServiceDep,
) -> UserRead:
    return _run(
        lambda: service.update_user(actor=current_admin, user_id=user_id, changes=payload)
    )


@router.put("/{user_id}/role", response_model=UserRead)
def update_user_role(
    user_id: UUID,
    payload: UserRoleUpdate,
    current_admin: CurrentAdmin,
    service: AdminUserServiceDep,
) -> UserRead:
    return _run(
        lambda: service.set_role(actor=current_admin, user_id=user_id, role=payload.role)
    )


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: UUID,
    current_admin: CurrentAdmin,
    service: AdminUserServiceDep,
) -> Response:
    _run(lambda: service.delete_user(actor=current_admin, user_id=user_id))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _run(operation):
    try:
        return operation()
    except UserNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except UserEmailConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except AdminActionForbiddenError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
