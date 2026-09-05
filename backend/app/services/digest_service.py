from uuid import UUID

from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.models.digest import Digest
from app.models.user import User
from app.repositories.digest_repository import DigestRepository
from app.schemas.digest import DigestCreate, DigestUpdate


class DigestNotFoundError(ValueError):
    pass


class DigestValidationError(ValueError):
    pass


class DigestService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.digests = DigestRepository(db)

    def create(self, *, owner: User, values: DigestCreate) -> Digest:
        digest = self.digests.create(owner_id=owner.id, values=values.model_dump())
        return self._commit(digest)

    def list_owned(
        self, *, owner: User, offset: int, limit: int
    ) -> tuple[list[Digest], int]:
        return (
            self.digests.list_for_owner(owner_id=owner.id, offset=offset, limit=limit),
            self.digests.count_for_owner(owner_id=owner.id),
        )

    def get_owned(self, *, owner: User, digest_id: UUID) -> Digest:
        digest = self.digests.get_for_owner(digest_id=digest_id, owner_id=owner.id)
        if digest is None:
            raise DigestNotFoundError("Digest not found")
        return digest

    def update_owned(
        self, *, owner: User, digest_id: UUID, changes: DigestUpdate
    ) -> Digest:
        return self._update(self.get_owned(owner=owner, digest_id=digest_id), changes)

    def delete_owned(self, *, owner: User, digest_id: UUID) -> None:
        self._delete(self.get_owned(owner=owner, digest_id=digest_id))

    def list_for_admin(
        self,
        *,
        actor: User,
        offset: int,
        limit: int,
        owner_id: UUID | None,
    ) -> tuple[list[Digest], int]:
        include_super_admin = actor.is_super_admin
        return (
            self.digests.list_for_admin(
                offset=offset,
                limit=limit,
                owner_id=owner_id,
                include_super_admin=include_super_admin,
            ),
            self.digests.count_for_admin(
                owner_id=owner_id,
                include_super_admin=include_super_admin,
            ),
        )

    def get_for_admin(self, *, actor: User, digest_id: UUID) -> Digest:
        digest = self.digests.get_for_admin(
            digest_id=digest_id,
            include_super_admin=actor.is_super_admin,
        )
        if digest is None:
            raise DigestNotFoundError("Digest not found")
        return digest

    def update_for_admin(
        self, *, actor: User, digest_id: UUID, changes: DigestUpdate
    ) -> Digest:
        return self._update(
            self.get_for_admin(actor=actor, digest_id=digest_id), changes
        )

    def delete_for_admin(self, *, actor: User, digest_id: UUID) -> None:
        self._delete(self.get_for_admin(actor=actor, digest_id=digest_id))

    def _update(self, digest: Digest, changes: DigestUpdate) -> Digest:
        current_values = {
            "topic": digest.topic,
            "description": digest.description,
            "include_keywords": digest.include_keywords,
            "exclude_keywords": digest.exclude_keywords,
            "target_audience": digest.target_audience,
            "reporting_from": digest.reporting_from,
            "reporting_to": digest.reporting_to,
            "frequency": digest.frequency,
            "maximum_papers": digest.maximum_papers,
        }
        try:
            validated = DigestCreate.model_validate(
                current_values | changes.model_dump(exclude_unset=True)
            )
        except ValidationError as exc:
            first_error = exc.errors()[0]
            message = str(first_error.get("msg", "Invalid digest details"))
            if message.startswith("Value error, "):
                message = message.removeprefix("Value error, ")
            raise DigestValidationError(message) from exc

        for field, value in validated.model_dump().items():
            setattr(digest, field, value)
        return self._commit(digest)

    def _delete(self, digest: Digest) -> None:
        self.digests.delete(digest)
        self.db.commit()

    def _commit(self, digest: Digest) -> Digest:
        self.db.commit()
        self.db.refresh(digest)
        return digest
