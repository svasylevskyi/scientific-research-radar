from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from sqlalchemy import update
from sqlalchemy.orm import Session
from app.models.auth_session import AuthSession

from app.core.config import Settings
from app.core.security import (
    DUMMY_PASSWORD_HASH,
    TokenError,
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_token,
    token_hash_matches,
    verify_password,
)
from app.models.user import User
from app.repositories.auth_session_repository import AuthSessionRepository
from app.repositories.user_repository import UserRepository


class AuthenticationError(ValueError):
    pass


class RefreshConflict(AuthenticationError):
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

        now = datetime.now(UTC)
        auth_session = self.sessions.get_by_id(claims.session_id)
        user = self.users.get_by_id(claims.subject)
        if (auth_session is None or auth_session.revoked_at is not None
                or _as_utc(auth_session.expires_at) <= now
                or _as_utc(auth_session.created_at) + timedelta(days=self.settings.session_absolute_days) <= now
                or user is None or not user.is_active or user.id != auth_session.user_id
                or user.auth_version != claims.auth_version):
            if auth_session is not None:
                self.sessions.revoke(auth_session)
            self.db.commit()  # Revocation must survive the error response.
            raise AuthenticationError("Your session has expired. Please sign in again.")

        if not token_hash_matches(raw_refresh_token, auth_session.token_hash):
            if (auth_session.previous_token_hash
                    and token_hash_matches(raw_refresh_token, auth_session.previous_token_hash)
                    and auth_session.rotated_at
                    and now < _as_utc(auth_session.rotated_at) + timedelta(seconds=self.settings.refresh_race_grace_seconds)):
                self.db.rollback()
                # Never issue tokens or clear the winning request's cookie on a race.
                raise RefreshConflict("Your session is being renewed in another tab. Please retry.")
            self.sessions.revoke(auth_session)
            self.db.commit()
            raise AuthenticationError("Your session has expired. Please sign in again.")

        expires_at = min(now + timedelta(days=self.settings.refresh_token_days),
                         _as_utc(auth_session.created_at) + timedelta(days=self.settings.session_absolute_days))
        access_token, _ = create_access_token(user.id, self.settings, user.auth_version, auth_session.id)
        refresh_token, refresh_expires_at = create_refresh_token(
            user.id, auth_session.id, self.settings, user.auth_version, expires_at=expires_at)
        rotated = self.db.execute(update(AuthSession).where(
            AuthSession.id == auth_session.id, AuthSession.token_hash == hash_token(raw_refresh_token),
            AuthSession.revoked_at.is_(None), AuthSession.expires_at > now
        ).values(token_hash=hash_token(refresh_token), previous_token_hash=hash_token(raw_refresh_token),
                 rotated_at=now, expires_at=refresh_expires_at), execution_options={"synchronize_session": False})
        if rotated.rowcount != 1:
            self.db.rollback()
            raise RefreshConflict("Your session is being renewed in another tab. Please retry.")
        self.db.commit()
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
        access_token, _ = create_access_token(user.id, self.settings, user.auth_version, session_id)
        refresh_token, refresh_expires_at = create_refresh_token(
            user.id, session_id, self.settings, user.auth_version,
            expires_at=datetime.now(UTC) + timedelta(days=min(self.settings.refresh_token_days, self.settings.session_absolute_days))
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
