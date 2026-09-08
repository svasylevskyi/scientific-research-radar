from typing import Annotated
from datetime import UTC, datetime, timedelta
from app.models.auth_session import AuthSession
from app.services.auth_service import _as_utc

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.security import TokenError, decode_token
from app.db.session import get_db
from app.models.user import User, UserRole
from app.repositories.user_repository import UserRepository
from app.services.auth_service import AuthService

bearer_scheme = HTTPBearer(auto_error=False)
DbSession = Annotated[Session, Depends(get_db)]
AppSettings = Annotated[Settings, Depends(get_settings)]


def get_auth_service(db: DbSession, settings: AppSettings) -> AuthService:
    return AuthService(db, settings)


AuthServiceDep = Annotated[AuthService, Depends(get_auth_service)]


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    db: DbSession,
    settings: AppSettings,
) -> User:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication required",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise unauthorized
    try:
        claims = decode_token(
            credentials.credentials,
            expected_type="access",
            settings=settings,
        )
    except TokenError as exc:
        raise unauthorized from exc

    user = UserRepository(db).get_by_id(claims.subject)
    if user is None or not user.is_active or user.auth_version != claims.auth_version:
        raise unauthorized
    session = db.get(AuthSession, claims.session_id) if claims.session_id else None
    if (session is None or session.user_id != user.id or session.revoked_at is not None
            or _as_utc(session.expires_at) <= datetime.now(UTC)
            or _as_utc(session.created_at) + timedelta(days=settings.session_absolute_days) <= datetime.now(UTC)):
        raise unauthorized
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_admin(current_user: CurrentUser) -> User:
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator access required",
        )
    return current_user


CurrentAdmin = Annotated[User, Depends(require_admin)]
