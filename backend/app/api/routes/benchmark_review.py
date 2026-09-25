from uuid import UUID

from fastapi import APIRouter, Query

from app.api.dependencies import CurrentAdmin, CurrentSuperAdmin, DbSession
from app.schemas.benchmark_review import (
    BenchmarkAuditRead, BenchmarkCaseRead, BenchmarkCriteriaWrite, BenchmarkDetail, BenchmarkExport,
    BenchmarkImportWrite, BenchmarkPublicationRead, BenchmarkPublishWrite, BenchmarkReviewImportWrite,
    BenchmarkReviewWrite, BenchmarkSummary,
)
from app.services import benchmark_review_service as service

router = APIRouter()


@router.get("", response_model=list[BenchmarkSummary])
def list_benchmarks(actor: CurrentAdmin, db: DbSession):
    return service.list_benchmarks(db)


@router.post("", response_model=BenchmarkDetail, status_code=201)
def import_benchmark(payload: BenchmarkImportWrite, actor: CurrentSuperAdmin, db: DbSession):
    return service.import_benchmark(db, payload, actor)


@router.get("/{benchmark_id}", response_model=BenchmarkDetail)
def read_benchmark(benchmark_id: UUID, actor: CurrentAdmin, db: DbSession):
    return service.detail(db, benchmark_id)


@router.get("/{benchmark_id}/cases/{case_id}", response_model=BenchmarkCaseRead)
def read_case(benchmark_id: UUID, case_id: str, actor: CurrentAdmin, db: DbSession,
              offset: int = Query(0, ge=0)):
    return service.case_detail(db, benchmark_id, case_id, offset=offset)


@router.post("/{benchmark_id}/cases/{case_id}", response_model=BenchmarkCaseRead, status_code=201)
def save_review(benchmark_id: UUID, case_id: str, payload: BenchmarkReviewWrite, actor: CurrentAdmin, db: DbSession):
    return service.save_review(db, benchmark_id, case_id, payload, actor)


@router.post("/{benchmark_id}/criteria", response_model=BenchmarkDetail, status_code=201)
def save_criteria(benchmark_id: UUID, payload: BenchmarkCriteriaWrite, actor: CurrentSuperAdmin, db: DbSession):
    return service.save_criteria(db, benchmark_id, payload, actor)


@router.post("/{benchmark_id}/publications", response_model=BenchmarkPublicationRead, status_code=201)
def publish(benchmark_id: UUID, payload: BenchmarkPublishWrite, actor: CurrentSuperAdmin, db: DbSession):
    return service.publish(db, benchmark_id, payload, actor)


@router.get("/{benchmark_id}/export", response_model=BenchmarkExport)
def export(benchmark_id: UUID, actor: CurrentAdmin, db: DbSession,
           publication: int | None = Query(None, ge=1)):
    return service.export_bundle(db, benchmark_id, publication)


@router.post("/{benchmark_id}/review-imports", response_model=BenchmarkDetail, status_code=201)
def import_reviews(benchmark_id: UUID, payload: BenchmarkReviewImportWrite, actor: CurrentSuperAdmin, db: DbSession):
    return service.import_reviews(db, benchmark_id, payload, actor)


@router.get("/{benchmark_id}/history", response_model=BenchmarkAuditRead)
def history(benchmark_id: UUID, actor: CurrentAdmin, db: DbSession, offset: int = Query(0, ge=0)):
    return service.audit(db, benchmark_id, offset=offset)
