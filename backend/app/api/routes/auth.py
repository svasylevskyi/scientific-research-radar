from fastapi import APIRouter, HTTPException, Request, Response, status

from app.api.dependencies import AppSettings, AuthServiceDep
from app.schemas.auth import AuthResponse, LoginRequest, MessageResponse, RegisterRequest
from app.services.auth_service import (
    AuthenticationError,
    EmailAlreadyRegisteredError,
    IssuedTokens,
)

router = APIRouter()


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def register(
    payload: RegisterRequest,
    response: Response,
    auth: AuthServiceDep,
    settings: AppSettings,
) -> AuthResponse:
    try:
        issued = auth.register(**payload.model_dump())
    except EmailAlreadyRegisteredError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
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
