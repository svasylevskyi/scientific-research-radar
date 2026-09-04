from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.user import User


class UserRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_by_id(self, user_id: UUID) -> User | None:
        return self.db.get(User, user_id)

    def get_by_email(self, email: str) -> User | None:
        return self.db.scalar(select(User).where(User.email == email))

    def create(self, *, email: str, full_name: str, password_hash: str) -> User:
        user = User(
            id=uuid4(),
            email=email,
            full_name=full_name,
            password_hash=password_hash,
        )
        self.db.add(user)
        self.db.flush()
        self.db.refresh(user)
        return user

