"""Versioned public-site content with optimistic concurrency."""
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.public_content import PublicContentRevision
from app.models.user import User
from app.schemas.public_content import PublicContentRead, PublicContentSlug, PublicContentUpdate


def current_content(db: Session, slug: PublicContentSlug) -> PublicContentRevision | None:
    return db.scalar(
        select(PublicContentRevision)
        .where(PublicContentRevision.slug == slug)
        .order_by(PublicContentRevision.revision.desc())
        .limit(1)
    )


def serialize(row: PublicContentRevision) -> PublicContentRead:
    return PublicContentRead(
        slug=row.slug,
        revision=row.revision,
        title=row.title,
        body_markdown=row.body_markdown,
        change_note=row.change_note,
        created_by_name=row.created_by_name,
        created_at=row.created_at,
    )


def publish_content(
    db: Session,
    *,
    slug: PublicContentSlug,
    payload: PublicContentUpdate,
    actor: User,
) -> PublicContentRevision:
    current = current_content(db, slug)
    current_revision = current.revision if current else 0
    if current_revision != payload.expected_revision:
        raise ValueError("Content changed. Reload before publishing.")

    row = PublicContentRevision(
        slug=slug,
        revision=current_revision + 1,
        title=payload.title,
        body_markdown=payload.body_markdown,
        change_note=payload.change_note,
        created_by=actor.id,
        created_by_name=actor.full_name,
    )
    db.add(row)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ValueError("Content changed. Reload before publishing.") from exc
    db.refresh(row)
    return row


def content_history(db: Session, slug: PublicContentSlug, *, offset: int, limit: int):
    items = list(db.scalars(
        select(PublicContentRevision)
        .where(PublicContentRevision.slug == slug)
        .order_by(PublicContentRevision.revision.desc())
        .offset(offset)
        .limit(limit)
    ))
    total = db.scalar(
        select(func.count()).select_from(PublicContentRevision).where(PublicContentRevision.slug == slug)
    ) or 0
    return items, total
