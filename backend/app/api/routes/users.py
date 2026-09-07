from typing import Annotated
from uuid import UUID
from datetime import UTC, datetime
from pydantic import BaseModel, EmailStr, field_validator
from sqlalchemy import select

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.dependencies import CurrentUser, DbSession, AppSettings
from app.models.email_verification import EmailVerification
from app.schemas.email_verification import VerificationRead, VerificationCode
from app.services.email_verification_service import EmailVerificationService
from app.schemas.auth import MessageResponse
from app.schemas.user import UserPasswordUpdate, UserProfileUpdate, UserRead
from app.services.user_profile_service import (
    CurrentPasswordInvalidError,
    PasswordReuseError,
    ProfileEmailConflictError,
    UserProfileService,
)

router = APIRouter()


class EmailChangeRequest(BaseModel):
    email: EmailStr

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, value):
        return value.strip().lower() if isinstance(value, str) else value


@router.get("/me/email-verification", response_model=VerificationRead | None)
def pending_email(current_user: CurrentUser, db: DbSession):
    return db.scalar(select(EmailVerification).where(
        EmailVerification.user_id == current_user.id,
        EmailVerification.expires_at > datetime.now(UTC),
    ))


@router.post("/me/email-verification", response_model=VerificationRead, status_code=202)
def start_email_change(payload: EmailChangeRequest, current_user: CurrentUser,
                       db: DbSession, settings: AppSettings):
    return EmailVerificationService(db, settings).start(email=str(payload.email), user=current_user)


@router.post("/me/email-verification/{challenge_id}/resend", response_model=VerificationRead)
def resend_email_change(challenge_id: UUID, current_user: CurrentUser,
                        db: DbSession, settings: AppSettings):
    return EmailVerificationService(db, settings).resend(challenge_id, current_user)


@router.post("/me/email-verification/{challenge_id}/confirm", response_model=UserRead)
def confirm_email_change(challenge_id: UUID, payload: VerificationCode,
                         current_user: CurrentUser, db: DbSession, settings: AppSettings):
    return EmailVerificationService(db, settings).confirm(challenge_id, payload.code, current_user)


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
