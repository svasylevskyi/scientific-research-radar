from fastapi import APIRouter, HTTPException, Query, status

from app.api.dependencies import CurrentAdmin, CurrentSuperAdmin, DbSession
from app.schemas.public_content import PublicContentHistory, PublicContentRead, PublicContentSlug, PublicContentUpdate
from app.services.public_content_service import content_history, current_content, publish_content, serialize

router = APIRouter()


@router.get("/{slug}", response_model=PublicContentRead | None)
def get_content(slug: PublicContentSlug, actor: CurrentAdmin, db: DbSession):
    row = current_content(db, slug)
    return serialize(row) if row else None


@router.get("/{slug}/history", response_model=PublicContentHistory)
def get_history(
    slug: PublicContentSlug,
    actor: CurrentAdmin,
    db: DbSession,
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
):
    rows, total = content_history(db, slug, offset=offset, limit=limit)
    return PublicContentHistory(
        items=[serialize(row) for row in rows],
        total=total,
        offset=offset,
        limit=limit,
    )


@router.put("/{slug}", response_model=PublicContentRead)
def update_content(
    slug: PublicContentSlug,
    payload: PublicContentUpdate,
    actor: CurrentSuperAdmin,
    db: DbSession,
):
    try:
        row = publish_content(db, slug=slug, payload=payload, actor=actor)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    return serialize(row)
