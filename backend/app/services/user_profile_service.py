from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import hash_password, verify_password
from app.models.user import User
from app.repositories.auth_session_repository import AuthSessionRepository
from app.repositories.user_repository import UserRepository
from app.schemas.user import UserProfileUpdate


class ProfileEmailConflictError(ValueError):
    pass


class CurrentPasswordInvalidError(ValueError):
    pass


class PasswordReuseError(ValueError):
    pass


class UserProfileService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.users = UserRepository(db)
        self.sessions = AuthSessionRepository(db)

    def update_profile(self, *, user: User, changes: UserProfileUpdate) -> User:
        values = changes.model_dump(exclude_unset=True, exclude_none=True)
        email = values.get("email")
        if email is not None and email != user.email:
            existing = self.users.get_by_email(email)
            if existing is not None and existing.id != user.id:
                raise ProfileEmailConflictError("An account with this email already exists")

        for field, value in values.items():
            setattr(user, field, value)

        try:
            self.db.commit()
        except IntegrityError as exc:
            self.db.rollback()
            raise ProfileEmailConflictError("An account with this email already exists") from exc
        self.db.refresh(user)
        return user

    def change_password(self, *, user: User, current_password: str, new_password: str) -> None:
        if not verify_password(current_password, user.password_hash):
            raise CurrentPasswordInvalidError("Current password is incorrect")
        if verify_password(new_password, user.password_hash):
            raise PasswordReuseError("New password must be different from the current password")

        user.password_hash = hash_password(new_password)
        self.sessions.revoke_all_for_user(user.id)
        self.db.commit()
