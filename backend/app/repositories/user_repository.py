from uuid import UUID, uuid4

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models.user import User, UserRole


class UserRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_by_id(self, user_id: UUID) -> User | None:
        return self.db.get(User, user_id)

    def get_by_email(self, email: str) -> User | None:
        return self.db.scalar(select(User).where(User.email == email))

    def get_super_admin(self) -> User | None:
        return self.db.scalar(select(User).where(User.is_super_admin.is_(True)))

    def list(
        self,
        *,
        offset: int,
        limit: int,
        query: str | None = None,
        include_super_admin: bool = True,
    ) -> list[User]:
        statement = select(User).order_by(User.created_at.desc(), User.email)
        if not include_super_admin:
            statement = statement.where(User.is_super_admin.is_(False))
        if query:
            pattern = f"%{query.lower()}%"
            statement = statement.where(
                or_(func.lower(User.email).like(pattern), func.lower(User.full_name).like(pattern))
            )
        return list(self.db.scalars(statement.offset(offset).limit(limit)))

    def count(self, *, query: str | None = None, include_super_admin: bool = True) -> int:
        statement = select(func.count()).select_from(User)
        if not include_super_admin:
            statement = statement.where(User.is_super_admin.is_(False))
        if query:
            pattern = f"%{query.lower()}%"
            statement = statement.where(
                or_(func.lower(User.email).like(pattern), func.lower(User.full_name).like(pattern))
            )
        return self.db.scalar(statement) or 0

    def create(
        self,
        *,
        email: str,
        full_name: str,
        password_hash: str,
        role: UserRole = UserRole.USER,
        is_super_admin: bool = False,
    ) -> User:
        user = User(
            id=uuid4(),
            email=email,
            full_name=full_name,
            password_hash=password_hash,
            role=role,
            is_super_admin=is_super_admin,
        )
        self.db.add(user)
        self.db.flush()
        self.db.refresh(user)
        return user

    def delete(self, user: User) -> None:
        self.db.delete(user)
