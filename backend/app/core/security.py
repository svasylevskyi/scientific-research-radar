from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
import hashlib
import secrets
from typing import Any, Literal
from uuid import UUID, uuid4

import jwt
from jwt import InvalidTokenError
from pwdlib import PasswordHash

from app.core.config import Settings

password_hash = PasswordHash.recommended()
DUMMY_PASSWORD_HASH = password_hash.hash("not-a-real-user-password")


class TokenError(ValueError):
    pass


@dataclass(frozen=True)
class TokenClaims:
    subject: UUID
    token_type: Literal["access", "refresh"]
    jwt_id: UUID
    session_id: UUID | None
    expires_at: datetime


def hash_password(password: str) -> str:
    return password_hash.hash(password)


def verify_password(password: str, encoded_hash: str) -> bool:
    return password_hash.verify(password, encoded_hash)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def token_hash_matches(token: str, expected_hash: str) -> bool:
    return secrets.compare_digest(hash_token(token), expected_hash)


def create_access_token(user_id: UUID, settings: Settings) -> tuple[str, datetime]:
    expires_at = datetime.now(UTC) + timedelta(minutes=settings.access_token_minutes)
    token = _encode_token(
        user_id=user_id,
        token_type="access",
        expires_at=expires_at,
        settings=settings,
    )
    return token, expires_at


def create_refresh_token(
    user_id: UUID,
    session_id: UUID,
    settings: Settings,
) -> tuple[str, datetime]:
    expires_at = datetime.now(UTC) + timedelta(days=settings.refresh_token_days)
    token = _encode_token(
        user_id=user_id,
        token_type="refresh",
        expires_at=expires_at,
        settings=settings,
        session_id=session_id,
    )
    return token, expires_at


def _encode_token(
    *,
    user_id: UUID,
    token_type: Literal["access", "refresh"],
    expires_at: datetime,
    settings: Settings,
    session_id: UUID | None = None,
) -> str:
    now = datetime.now(UTC)
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "typ": token_type,
        "jti": str(uuid4()),
        "iat": now,
        "nbf": now,
        "exp": expires_at,
        "iss": settings.jwt_issuer,
        "aud": settings.jwt_audience,
    }
    if session_id is not None:
        payload["sid"] = str(session_id)
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(
    token: str,
    *,
    expected_type: Literal["access", "refresh"],
    settings: Settings,
) -> TokenClaims:
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
            audience=settings.jwt_audience,
            issuer=settings.jwt_issuer,
            options={"require": ["sub", "typ", "jti", "iat", "nbf", "exp"]},
        )
        if payload["typ"] != expected_type:
            raise TokenError("Unexpected token type")
        session_id = UUID(payload["sid"]) if payload.get("sid") else None
        if expected_type == "refresh" and session_id is None:
            raise TokenError("Refresh token has no session")
        return TokenClaims(
            subject=UUID(payload["sub"]),
            token_type=expected_type,
            jwt_id=UUID(payload["jti"]),
            session_id=session_id,
            expires_at=datetime.fromtimestamp(payload["exp"], tz=UTC),
        )
    except (InvalidTokenError, KeyError, TypeError, ValueError) as exc:
        raise TokenError("Invalid or expired token") from exc
