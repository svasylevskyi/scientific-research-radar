from uuid import UUID

from fastapi import APIRouter, Query

from app.api.dependencies import CurrentAdmin, DbSession
from app.core.config import get_settings
from app.schemas.claim_review import ClaimReviewExport, ClaimReviewHistory, ClaimReviewRead, ClaimReviewStart
from app.services import claim_review_service as service

router = APIRouter()


@router.post("", status_code=202, response_model=ClaimReviewRead)
def start(payload: ClaimReviewStart, actor: CurrentAdmin, db: DbSession):
    job = service.start_review(db, actor=actor, payload=payload, settings=get_settings())
    return service.read_review(db, job)


@router.get("", response_model=ClaimReviewHistory)
def history(actor: CurrentAdmin, db: DbSession, digest_id: UUID | None = None, run_id: UUID | None = None,
            benchmark_id: UUID | None = None, offset: int = Query(0, ge=0), limit: int = Query(5, ge=1, le=20)):
    return service.history(db, actor=actor, digest_id=digest_id, run_id=run_id, benchmark_id=benchmark_id, offset=offset, limit=limit)


@router.get("/{review_id}", response_model=ClaimReviewRead)
def read(review_id: UUID, actor: CurrentAdmin, db: DbSession):
    return service.read_review(db, service.get_review(db, review_id, actor))


@router.get("/{review_id}/export", response_model=ClaimReviewExport)
def export(review_id: UUID, actor: CurrentAdmin, db: DbSession):
    job = service.get_review(db, review_id, actor)
    return ClaimReviewExport(review=service.read_review(db, job), candidate=service.candidate_for(job, service.requests_for(db, job)))
