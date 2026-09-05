from uuid import UUID, uuid4

from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.models.digest import Digest
from app.models.user import User


class DigestRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def create(self, *, owner_id: UUID, values: dict) -> Digest:
        digest = Digest(id=uuid4(), owner_id=owner_id, **values)
        self.db.add(digest)
        self.db.flush()
        return digest

    def get_for_owner(self, *, digest_id: UUID, owner_id: UUID) -> Digest | None:
        return self.db.scalar(
            select(Digest).where(Digest.id == digest_id, Digest.owner_id == owner_id)
        )

    def list_for_owner(self, *, owner_id: UUID, offset: int, limit: int) -> list[Digest]:
        statement = (
            select(Digest)
            .where(Digest.owner_id == owner_id)
            .order_by(Digest.created_at.desc(), Digest.topic)
            .offset(offset)
            .limit(limit)
        )
        return list(self.db.scalars(statement))

    def count_for_owner(self, *, owner_id: UUID) -> int:
        statement = select(func.count()).select_from(Digest).where(Digest.owner_id == owner_id)
        return self.db.scalar(statement) or 0

    def get_for_admin(
        self, *, digest_id: UUID, include_super_admin: bool
    ) -> Digest | None:
        statement = (
            select(Digest)
            .join(Digest.owner)
            .options(joinedload(Digest.owner))
            .where(Digest.id == digest_id)
        )
        if not include_super_admin:
            statement = statement.where(User.is_super_admin.is_(False))
        return self.db.scalar(statement)

    def list_for_admin(
        self,
        *,
        offset: int,
        limit: int,
        owner_id: UUID | None,
        include_super_admin: bool,
    ) -> list[Digest]:
        statement = (
            select(Digest)
            .join(Digest.owner)
            .options(joinedload(Digest.owner))
            .order_by(Digest.created_at.desc(), Digest.topic)
        )
        if owner_id is not None:
            statement = statement.where(Digest.owner_id == owner_id)
        if not include_super_admin:
            statement = statement.where(User.is_super_admin.is_(False))
        return list(self.db.scalars(statement.offset(offset).limit(limit)))

    def count_for_admin(
        self, *, owner_id: UUID | None, include_super_admin: bool
    ) -> int:
        statement = select(func.count()).select_from(Digest).join(Digest.owner)
        if owner_id is not None:
            statement = statement.where(Digest.owner_id == owner_id)
        if not include_super_admin:
            statement = statement.where(User.is_super_admin.is_(False))
        return self.db.scalar(statement) or 0

    def delete(self, digest: Digest) -> None:
        self.db.delete(digest)
