from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.auth_session import AuthSession


class AuthSessionRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_by_id(self, session_id: UUID) -> AuthSession | None:
        return self.db.get(AuthSession, session_id)

    def create(
        self,
        *,
        session_id: UUID,
        user_id: UUID,
        token_hash: str,
        expires_at: datetime,
    ) -> AuthSession:
        auth_session = AuthSession(
            id=session_id,
            user_id=user_id,
            token_hash=token_hash,
            expires_at=expires_at,
        )
        self.db.add(auth_session)
        return auth_session

    def rotate(self, auth_session: AuthSession, *, token_hash: str, expires_at: datetime) -> None:
        auth_session.token_hash = token_hash
        auth_session.expires_at = expires_at

    def revoke(self, auth_session: AuthSession) -> None:
        if auth_session.revoked_at is None:
            auth_session.revoked_at = datetime.now(UTC)

