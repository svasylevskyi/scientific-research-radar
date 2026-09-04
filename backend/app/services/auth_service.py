from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID, uuid4

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.security import (
    DUMMY_PASSWORD_HASH,
    TokenError,
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    hash_token,
    token_hash_matches,
    verify_password,
)
from app.models.user import User
from app.repositories.auth_session_repository import AuthSessionRepository
from app.repositories.user_repository import UserRepository


class AuthenticationError(ValueError):
    pass


class EmailAlreadyRegisteredError(ValueError):
    pass


@dataclass(frozen=True)
class IssuedTokens:
    access_token: str
    access_expires_in: int
    refresh_token: str
    refresh_expires_at: datetime
    user: User


class AuthService:
    def __init__(self, db: Session, settings: Settings) -> None:
        self.db = db
        self.settings = settings
        self.users = UserRepository(db)
        self.sessions = AuthSessionRepository(db)

    def register(self, *, email: str, full_name: str, password: str) -> IssuedTokens:
        try:
            with self.db.begin():
                if self.users.get_by_email(email) is not None:
                    raise EmailAlreadyRegisteredError("An account with this email already exists")
                user = self.users.create(
                    email=email,
                    full_name=full_name,
                    password_hash=hash_password(password),
                )
                return self._start_session(user)
        except IntegrityError as exc:
            raise EmailAlreadyRegisteredError("An account with this email already exists") from exc

    def login(self, *, email: str, password: str) -> IssuedTokens:
        with self.db.begin():
            user = self.users.get_by_email(email)
            if user is None:
                verify_password(password, DUMMY_PASSWORD_HASH)
                raise AuthenticationError("Email or password is incorrect")
            if not verify_password(password, user.password_hash):
                raise AuthenticationError("Email or password is incorrect")
            if not user.is_active:
                raise AuthenticationError("This account is inactive")
            return self._start_session(user)

    def refresh(self, raw_refresh_token: str) -> IssuedTokens:
        try:
            claims = decode_token(
                raw_refresh_token,
                expected_type="refresh",
                settings=self.settings,
            )
        except TokenError as exc:
            raise AuthenticationError("Your session has expired. Please sign in again.") from exc

        with self.db.begin():
            auth_session = self.sessions.get_by_id(claims.session_id)  # type: ignore[arg-type]
            if (
                auth_session is None
                or auth_session.revoked_at is not None
                or _as_utc(auth_session.expires_at) <= datetime.now(UTC)
                or not token_hash_matches(raw_refresh_token, auth_session.token_hash)
            ):
                if auth_session is not None:
                    self.sessions.revoke(auth_session)
                raise AuthenticationError("Your session has expired. Please sign in again.")

            user = self.users.get_by_id(claims.subject)
            if user is None or not user.is_active or user.id != auth_session.user_id:
                self.sessions.revoke(auth_session)
                raise AuthenticationError("Your session has expired. Please sign in again.")

            access_token, _ = create_access_token(user.id, self.settings)
            refresh_token, refresh_expires_at = create_refresh_token(
                user.id, auth_session.id, self.settings
            )
            self.sessions.rotate(
                auth_session,
                token_hash=hash_token(refresh_token),
                expires_at=refresh_expires_at,
            )
            return self._issued_tokens(user, access_token, refresh_token, refresh_expires_at)

    def logout(self, raw_refresh_token: str | None) -> None:
        if raw_refresh_token is None:
            return
        try:
            claims = decode_token(
                raw_refresh_token,
                expected_type="refresh",
                settings=self.settings,
            )
        except TokenError:
            return
        with self.db.begin():
            auth_session = self.sessions.get_by_id(claims.session_id)  # type: ignore[arg-type]
            if auth_session is not None:
                self.sessions.revoke(auth_session)

    def _start_session(self, user: User) -> IssuedTokens:
        session_id = uuid4()
        access_token, _ = create_access_token(user.id, self.settings)
        refresh_token, refresh_expires_at = create_refresh_token(
            user.id, session_id, self.settings
        )
        self.sessions.create(
            session_id=session_id,
            user_id=user.id,
            token_hash=hash_token(refresh_token),
            expires_at=refresh_expires_at,
        )
        return self._issued_tokens(user, access_token, refresh_token, refresh_expires_at)

    def _issued_tokens(
        self,
        user: User,
        access_token: str,
        refresh_token: str,
        refresh_expires_at: datetime,
    ) -> IssuedTokens:
        return IssuedTokens(
            access_token=access_token,
            access_expires_in=self.settings.access_token_minutes * 60,
            refresh_token=refresh_token,
            refresh_expires_at=refresh_expires_at,
            user=user,
        )


def _as_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)
