from datetime import UTC, datetime, timedelta
import hashlib
import hmac
import secrets
from uuid import UUID, uuid4

from sqlalchemy import delete, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.security import hash_password, verify_password
from app.models.email_verification import EmailVerification
from app.models.user import User
from app.repositories.user_repository import UserRepository
from app.services.auth_service import AuthService, _as_utc
from app.services.email_service import EmailService, OutgoingEmail


class VerificationError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.status_code = status_code


def cleanup_expired(db: Session) -> None:
    db.execute(delete(EmailVerification).where(EmailVerification.expires_at <= datetime.now(UTC)))
    db.commit()


class EmailVerificationService:
    def __init__(self, db: Session, settings: Settings):
        self.db = db
        self.settings = settings
        self.users = UserRepository(db)

    def _hash(self, challenge_id: UUID, code: str) -> str:
        return hmac.new(self.settings.jwt_secret.encode(), f"{challenge_id}:{code}".encode(), hashlib.sha256).hexdigest()

    def _send(self, challenge: EmailVerification) -> None:
        now = datetime.now(UTC)
        code = f"{secrets.randbelow(1_000_000):06d}"
        challenge.code_hash = self._hash(challenge.id, code)
        challenge.sent_at = now
        challenge.code_expires_at = now + timedelta(hours=24)
        self.db.flush()
        deadline = _as_utc(challenge.expires_at).strftime("%Y-%m-%d %H:%M UTC")
        EmailService(self.settings).send(OutgoingEmail(
            recipient=challenge.email,
            subject="Verify your email — Scientific Research Radar",
            text=(f"Your verification code is: {code}\n\n"
                  "Enter this 6-digit code in Scientific Research Radar. The code expires in 24 hours. "
                  f"This verification attempt must be completed by {deadline}. "
                  "Resending a code does not extend that deadline. Only the newest code works.\n\n"
                  "You can request another code after 1 minute. Do not share this code. "
                  "If you did not request this, you can ignore this message."),
        ))

    def start(self, *, email: str, full_name: str | None = None, password: str | None = None,
              user: User | None = None) -> EmailVerification:
        # Also releases expired email reservations when the periodic cleaner is offline.
        cleanup_expired(self.db)
        existing_user = self.users.get_by_email(email)
        if existing_user:
            raise VerificationError("An account with this email already exists", 409)
        pending = self.db.scalar(select(EmailVerification).where(EmailVerification.email == email))
        if pending:
            same_owner = user is not None and pending.user_id == user.id
            same_registration = (user is None and pending.user_id is None and password is not None
                                 and verify_password(password, pending.password_hash))
            if same_owner or same_registration:
                return pending
            raise VerificationError("This email has a pending verification. Complete it or try again after 24 hours.", 409)
        now = datetime.now(UTC)
        if user:
            previous = self.db.scalar(select(EmailVerification).where(EmailVerification.user_id == user.id))
            if previous:
                if now < _as_utc(previous.sent_at) + timedelta(minutes=1):
                    raise VerificationError("Please wait 1 minute before requesting another code.", 429)
                self.db.delete(previous)
                self.db.flush()
        challenge = EmailVerification(
            id=uuid4(), email=email, user_id=user.id if user else None,
            full_name=full_name, password_hash=hash_password(password) if password else None,
            code_hash="", sent_at=now, code_expires_at=now + timedelta(hours=24),
            expires_at=now + timedelta(hours=24), attempts=0,
        )
        self.db.add(challenge)
        try:
            self._send(challenge)
            self.db.commit()
        except IntegrityError as exc:
            self.db.rollback()
            raise VerificationError("This email already has an account or pending verification.", 409) from exc
        except Exception:
            self.db.rollback()
            raise
        return challenge

    def _lock(self, challenge_id: UUID, user: User | None, *, consume_attempt=False) -> EmailVerification:
        now = datetime.now(UTC)
        condition = [EmailVerification.id == challenge_id,
                     EmailVerification.user_id == (user.id if user else None),
                     EmailVerification.expires_at > now]
        if consume_attempt:
            condition.append(EmailVerification.attempts < 50)
        # A database write serializes concurrent confirmation/resend requests on SQLite
        # as well as PostgreSQL. Re-read after obtaining the lock.
        result = self.db.execute(update(EmailVerification).where(*condition).values(
            attempts=EmailVerification.attempts + (1 if consume_attempt else 0)
        ))
        if result.rowcount != 1:
            self.db.rollback()
            cleanup_expired(self.db)
            raise VerificationError("Verification expired, was completed, or has too many attempts. Start again after expiry.", 410)
        return self.db.scalar(select(EmailVerification).where(EmailVerification.id == challenge_id)
                              .execution_options(populate_existing=True))

    def resend(self, challenge_id: UUID, user: User | None = None) -> EmailVerification:
        challenge = self._lock(challenge_id, user)
        try:
            if challenge.attempts >= 50:
                raise VerificationError("Too many incorrect codes. Start again after this attempt expires.", 429)
            if datetime.now(UTC) < _as_utc(challenge.sent_at) + timedelta(minutes=1):
                raise VerificationError("Please wait 1 minute before requesting another code.", 429)
            self._send(challenge)
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise
        return challenge

    def confirm(self, challenge_id: UUID, code: str, user: User | None = None):
        challenge = self._lock(challenge_id, user, consume_attempt=True)
        if (datetime.now(UTC) >= _as_utc(challenge.code_expires_at)
                or not hmac.compare_digest(challenge.code_hash, self._hash(challenge.id, code))):
            self.db.commit()  # Persist the failed attempt even though the API returns an error.
            raise VerificationError("The code is incorrect or expired. Use the latest code sent to your email.")
        try:
            if self.users.get_by_email(challenge.email):
                raise VerificationError("An account with this email already exists", 409)
            if user:
                user.email = challenge.email
                result = user
            else:
                created = self.users.create(email=challenge.email, full_name=challenge.full_name,
                                            password_hash=challenge.password_hash)
                result = AuthService(self.db, self.settings)._start_session(created)
            self.db.delete(challenge)
            self.db.commit()
            return result
        except IntegrityError as exc:
            self.db.rollback()
            raise VerificationError("An account with this email already exists", 409) from exc
        except Exception:
            self.db.rollback()
            raise
