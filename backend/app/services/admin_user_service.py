from uuid import UUID

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.user import User, UserRole
from app.repositories.auth_session_repository import AuthSessionRepository
from app.repositories.user_repository import UserRepository
from app.schemas.user import AdminUserUpdate


class UserNotFoundError(ValueError):
    pass


class AdminActionForbiddenError(ValueError):
    pass


class UserEmailConflictError(ValueError):
    pass


class AdminUserService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.users = UserRepository(db)
        self.sessions = AuthSessionRepository(db)

    def list_users(
        self, *, offset: int, limit: int, query: str | None
    ) -> tuple[list[User], int]:
        normalized_query = query.strip() if query else None
        return (
            self.users.list(offset=offset, limit=limit, query=normalized_query),
            self.users.count(query=normalized_query),
        )

    def get_user(self, *, actor: User, user_id: UUID) -> User:
        user = self._get_user(user_id)
        self._require_management_access(actor=actor, target=user)
        return user

    def _get_user(self, user_id: UUID) -> User:
        user = self.users.get_by_id(user_id)
        if user is None:
            raise UserNotFoundError("User not found")
        return user

    def update_user(self, *, actor: User, user_id: UUID, changes: AdminUserUpdate) -> User:
        target = self.get_user(actor=actor, user_id=user_id)
        values = changes.model_dump(exclude_unset=True, exclude_none=True)

        if values.get("is_active") is False:
            if target.is_super_admin:
                raise AdminActionForbiddenError("The super-admin cannot be deactivated")
            if target.id == actor.id:
                raise AdminActionForbiddenError("Administrators cannot deactivate their own account")

        email = values.get("email")
        if email is not None and email != target.email:
            existing = self.users.get_by_email(email)
            if existing is not None and existing.id != target.id:
                raise UserEmailConflictError("An account with this email already exists")

        for field, value in values.items():
            setattr(target, field, value)
        if values.get("is_active") is False:
            self.sessions.revoke_all_for_user(target.id)

        return self._commit(target)

    def set_role(self, *, actor: User, user_id: UUID, role: UserRole) -> User:
        target = self.get_user(actor=actor, user_id=user_id)
        if role != UserRole.ADMIN and target.is_super_admin:
            raise AdminActionForbiddenError("The super-admin cannot be demoted")
        if role != UserRole.ADMIN and target.id == actor.id:
            raise AdminActionForbiddenError("Administrators cannot demote their own account")
        target.role = role
        return self._commit(target)

    def delete_user(self, *, actor: User, user_id: UUID) -> None:
        target = self.get_user(actor=actor, user_id=user_id)
        if target.is_super_admin:
            raise AdminActionForbiddenError("The super-admin cannot be deleted")
        if target.id == actor.id:
            raise AdminActionForbiddenError("Administrators cannot delete their own account")
        self.users.delete(target)
        self.db.commit()

    def _require_management_access(self, *, actor: User, target: User) -> None:
        if target.is_super_admin and not actor.is_super_admin:
            raise AdminActionForbiddenError(
                "Only the super-admin can manage the super-admin account"
            )

    def _commit(self, user: User) -> User:
        try:
            self.db.commit()
        except IntegrityError as exc:
            self.db.rollback()
            raise UserEmailConflictError("An account with this email already exists") from exc
        self.db.refresh(user)
        return user
