from fastapi import APIRouter

from app.api.dependencies import DbSession
from app.schemas.public_content import PublicContentRead, PublicContentSlug
from app.services.public_content_service import current_content, serialize

router = APIRouter()


@router.get("/{slug}", response_model=PublicContentRead | None)
def get_public_content(slug: PublicContentSlug, db: DbSession):
    row = current_content(db, slug)
    return serialize(row) if row else None
