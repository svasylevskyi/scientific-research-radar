from uuid import UUID
from fastapi import APIRouter, HTTPException, Request, Response, status

from app.api.dependencies import AppSettings, AuthServiceDep, DbSession
from app.schemas.email_verification import VerificationRead, VerificationCode
from app.services.email_verification_service import EmailVerificationService
from app.schemas.auth import AuthResponse, LoginRequest, MessageResponse, RegisterRequest
from app.services.auth_service import (
    AuthenticationError,
    IssuedTokens,
)

router = APIRouter()


@router.post("/register", response_model=VerificationRead, status_code=status.HTTP_202_ACCEPTED)
def register(
    payload: RegisterRequest,
    db: DbSession,
    settings: AppSettings,
) -> VerificationRead:
    challenge = EmailVerificationService(db, settings).start(
        **payload.model_dump(exclude={"password_confirmation"})
    )
    return VerificationRead.model_validate(challenge)


@router.post("/register/{challenge_id}/resend", response_model=VerificationRead)
def resend_registration(challenge_id: UUID, db: DbSession, settings: AppSettings):
    return EmailVerificationService(db, settings).resend(challenge_id)


@router.post("/register/{challenge_id}/confirm", response_model=AuthResponse, status_code=201)
def confirm_registration(challenge_id: UUID, payload: VerificationCode, response: Response,
                         db: DbSession, settings: AppSettings):
    issued = EmailVerificationService(db, settings).confirm(challenge_id, payload.code)
    _set_refresh_cookie(response, issued, settings)
    return _auth_response(issued)


@router.post("/login", response_model=AuthResponse)
def login(
    payload: LoginRequest,
    response: Response,
    auth: AuthServiceDep,
    settings: AppSettings,
) -> AuthResponse:
    try:
        issued = auth.login(**payload.model_dump())
    except AuthenticationError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc
    _set_refresh_cookie(response, issued, settings)
    return _auth_response(issued)


@router.post("/refresh", response_model=AuthResponse)
def refresh(
    request: Request,
    response: Response,
    auth: AuthServiceDep,
    settings: AppSettings,
) -> AuthResponse:
    refresh_token = request.cookies.get(settings.refresh_cookie_name)
    if not refresh_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No active session")
    try:
        issued = auth.refresh(refresh_token)
    except AuthenticationError as exc:
        _clear_refresh_cookie(response, settings)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc
    _set_refresh_cookie(response, issued, settings)
    return _auth_response(issued)


@router.post("/logout", response_model=MessageResponse)
def logout(
    request: Request,
    response: Response,
    auth: AuthServiceDep,
    settings: AppSettings,
) -> MessageResponse:
    refresh_token = request.cookies.get(settings.refresh_cookie_name)
    auth.logout(refresh_token)
    _clear_refresh_cookie(response, settings)
    return MessageResponse(message="Signed out")


def _auth_response(issued: IssuedTokens) -> AuthResponse:
    return AuthResponse(
        access_token=issued.access_token,
        expires_in=issued.access_expires_in,
        user=issued.user,
    )


def _set_refresh_cookie(response: Response, issued: IssuedTokens, settings: AppSettings) -> None:
    response.set_cookie(
        key=settings.refresh_cookie_name,
        value=issued.refresh_token,
        expires=issued.refresh_expires_at,
        httponly=True,
        secure=settings.refresh_cookie_secure,
        samesite=settings.refresh_cookie_samesite,
        path="/api/v1/auth",
    )


def _clear_refresh_cookie(response: Response, settings: AppSettings) -> None:
    response.delete_cookie(
        key=settings.refresh_cookie_name,
        httponly=True,
        secure=settings.refresh_cookie_secure,
        samesite=settings.refresh_cookie_samesite,
        path="/api/v1/auth",
    )
