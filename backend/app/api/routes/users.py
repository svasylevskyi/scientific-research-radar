from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.dependencies import CurrentUser, DbSession
from app.schemas.auth import MessageResponse
from app.schemas.user import UserPasswordUpdate, UserProfileUpdate, UserRead
from app.services.user_profile_service import (
    CurrentPasswordInvalidError,
    PasswordReuseError,
    ProfileEmailConflictError,
    UserProfileService,
)

router = APIRouter()


def get_user_profile_service(db: DbSession) -> UserProfileService:
    return UserProfileService(db)


UserProfileServiceDep = Annotated[UserProfileService, Depends(get_user_profile_service)]


@router.get("/me", response_model=UserRead)
def get_me(current_user: CurrentUser) -> UserRead:
    return UserRead.model_validate(current_user)


@router.patch("/me", response_model=UserRead)
def update_me(
    payload: UserProfileUpdate,
    current_user: CurrentUser,
    service: UserProfileServiceDep,
) -> UserRead:
    try:
        user = service.update_profile(user=current_user, changes=payload)
    except ProfileEmailConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    return UserRead.model_validate(user)


@router.put("/me/password", response_model=MessageResponse)
def update_my_password(
    payload: UserPasswordUpdate,
    current_user: CurrentUser,
    service: UserProfileServiceDep,
) -> MessageResponse:
    try:
        service.change_password(
            user=current_user,
            current_password=payload.current_password,
            new_password=payload.new_password,
        )
    except (CurrentPasswordInvalidError, PasswordReuseError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return MessageResponse(message="Password changed. Please sign in again.")
