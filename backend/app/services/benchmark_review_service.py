"""Authenticated human labels; no source fetching, model calls or run mutations."""

from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Iterator, cast
from uuid import UUID, uuid4

from fastapi import HTTPException
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.engine import CursorResult
from sqlalchemy.orm import Session

from app.evaluation.models import Benchmark, Case, Criteria, Review, Reviews, fingerprint, unique
from app.evaluation.scoring import validate_bindings
from app.models.benchmark_review import BenchmarkCaseReview, BenchmarkCriteriaHistory, BenchmarkPublication, ResearchBenchmark
from app.models.user import User
from app.schemas.benchmark_review import (
    BenchmarkAuditRead, BenchmarkCaseRead, BenchmarkCaseSummary, BenchmarkCriteriaRead,
    BenchmarkCriteriaWrite, BenchmarkDetail, BenchmarkExport, BenchmarkImportWrite,
    BenchmarkPublicationRead, BenchmarkPublishWrite, BenchmarkReviewImportWrite,
    BenchmarkReviewRead, BenchmarkReviewWrite, BenchmarkSummary,
    ReviewState,
)


@contextmanager
def mutation(db: Session) -> Iterator[None]:
    try:
        yield
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "This benchmark changed or already exists. Reload before continuing.") from exc
    except Exception:
        db.rollback()
        raise


def get_benchmark(db: Session, benchmark_id: UUID) -> ResearchBenchmark:
    row = db.get(ResearchBenchmark, benchmark_id, populate_existing=True)
    if row is None:
        raise HTTPException(404, "Benchmark not found")
    return row


def lock_benchmark(db: Session, benchmark_id: UUID, expected_revision: int | None = None) -> ResearchBenchmark:
    query = update(ResearchBenchmark).where(ResearchBenchmark.id == benchmark_id)
    if expected_revision is not None:
        query = query.where(ResearchBenchmark.revision == expected_revision)
    result = cast(CursorResult, db.execute(query.values(revision=ResearchBenchmark.revision + 1)))
    if result.rowcount != 1:
        get_benchmark(db, benchmark_id)
        raise HTTPException(409, "Benchmark changed. Reload before continuing; your unsaved edits have not been applied.")
    return get_benchmark(db, benchmark_id)


def latest_reviews(db: Session, benchmark_id: UUID) -> dict[str, BenchmarkCaseReview]:
    latest = select(BenchmarkCaseReview.case_id, func.max(BenchmarkCaseReview.version).label("version")).where(
        BenchmarkCaseReview.benchmark_id == benchmark_id).group_by(BenchmarkCaseReview.case_id).subquery()
    rows = db.scalars(select(BenchmarkCaseReview).join(latest,
        (BenchmarkCaseReview.case_id == latest.c.case_id) & (BenchmarkCaseReview.version == latest.c.version)).where(
        BenchmarkCaseReview.benchmark_id == benchmark_id))
    return {row.case_id: row for row in rows}


def read_review(row: BenchmarkCaseReview) -> BenchmarkReviewRead:
    return BenchmarkReviewRead(version=row.version, state=cast(ReviewState, row.state), **row.content,
        reviewer_id=row.created_by, reviewer_name=row.created_by_name, reviewed_at=row.created_at)


def publication_read(row: BenchmarkPublication) -> BenchmarkPublicationRead:
    return BenchmarkPublicationRead(number=row.number, source_revision=row.source_revision,
        fingerprint=row.fingerprint, reason=row.reason, created_by_name=row.created_by_name, created_at=row.created_at)


def latest_publication(db: Session, benchmark_id: UUID) -> BenchmarkPublication | None:
    return db.scalar(select(BenchmarkPublication).where(BenchmarkPublication.benchmark_id == benchmark_id)
                     .order_by(BenchmarkPublication.number.desc()).limit(1))


def summary(db: Session, row: ResearchBenchmark, current: dict[str, BenchmarkCaseReview] | None = None) -> BenchmarkSummary:
    benchmark = Benchmark.model_validate(row.dataset)
    current = latest_reviews(db, row.id) if current is None else current
    counts = dict.fromkeys(("pending", "draft", "approved", "excluded", "disputed"), 0)
    for case in benchmark.cases:
        review = current.get(case.id)
        counts[review.state if review else "pending"] += 1
    published = latest_publication(db, row.id)
    return BenchmarkSummary(id=row.id, name=benchmark.id, version=benchmark.version, fingerprint=row.fingerprint,
        revision=row.revision, total=len(benchmark.cases), counts=counts,
        latest_publication=published.number if published else None,
        unpublished_changes=not published or published.source_revision != row.revision)


def list_benchmarks(db: Session) -> list[BenchmarkSummary]:
    return [summary(db, row) for row in db.scalars(select(ResearchBenchmark).order_by(ResearchBenchmark.created_at.desc()))]


def detail(db: Session, benchmark_id: UUID) -> BenchmarkDetail:
    row = get_benchmark(db, benchmark_id)
    benchmark = Benchmark.model_validate(row.dataset)
    current = latest_reviews(db, row.id)
    return BenchmarkDetail(summary=summary(db, row, current), description=benchmark.description,
        criteria=Criteria.model_validate(row.criteria), cases=[BenchmarkCaseSummary(id=case.id, split=case.split,
            scope=case.scope, claim=case.claim[:240], state=cast(ReviewState, current[case.id].state) if case.id in current else "pending",
            version=current[case.id].version if case.id in current else 0) for case in benchmark.cases])


def find_case(benchmark: Benchmark, case_id: str) -> Case:
    case = next((case for case in benchmark.cases if case.id == case_id), None)
    if case is None:
        raise HTTPException(404, "Benchmark case not found")
    return case


def case_detail(db: Session, benchmark_id: UUID, case_id: str, *, offset: int = 0) -> BenchmarkCaseRead:
    benchmark = Benchmark.model_validate(get_benchmark(db, benchmark_id).dataset)
    case = find_case(benchmark, case_id)
    scope = (BenchmarkCaseReview.benchmark_id == benchmark_id, BenchmarkCaseReview.case_id == case_id)
    records = list(db.scalars(select(BenchmarkCaseReview).where(*scope)
                             .order_by(BenchmarkCaseReview.version.desc()).offset(offset).limit(20)))
    latest = records[0] if offset == 0 and records else db.scalar(select(BenchmarkCaseReview).where(*scope)
        .order_by(BenchmarkCaseReview.version.desc()).limit(1))
    return BenchmarkCaseRead(case=case, sources=[s for s in benchmark.sources if s.id in case.source_ids],
        review=read_review(latest) if latest else None, history=[read_review(row) for row in records],
        history_total=db.scalar(select(func.count()).select_from(BenchmarkCaseReview).where(*scope)) or 0)


def append_review(db: Session, row: ResearchBenchmark, case: Case, payload: BenchmarkReviewWrite,
                  actor: User, previous: BenchmarkCaseReview | None, *, imported: bool = False) -> None:
    benchmark = Benchmark.model_validate(row.dataset)
    if payload.expected_version != (previous.version if previous else 0):
        raise HTTPException(409, "This case was reviewed by someone else. Reload the case before saving.")
    try:
        unique(payload.evidence_passage_ids, "passage IDs")
        if not set(payload.evidence_passage_ids).issubset(benchmark.passages_for(case)):
            raise ValueError("Evidence must belong to this case")
        if payload.state == "disputed" and not payload.rationale.strip():
            raise ValueError("Explain the dispute")
        if payload.resolve_dispute and not actor.is_super_admin:
            raise HTTPException(403, "Only super-admins can resolve disputes")
        if previous and previous.state == "disputed" and payload.state != "disputed":
            if not actor.is_super_admin or not payload.resolve_dispute or payload.state not in {"approved", "excluded"}:
                raise HTTPException(409, "A super-admin must explicitly resolve this disputed case")
        state = payload.state
        # Saving a draft between two final decisions must not bypass adjudication.
        final_review = db.scalar(select(BenchmarkCaseReview).where(
            BenchmarkCaseReview.benchmark_id == row.id, BenchmarkCaseReview.case_id == case.id,
            BenchmarkCaseReview.state.in_(("approved", "excluded")))
            .order_by(BenchmarkCaseReview.version.desc()).limit(1))
        if final_review and payload.state in {"approved", "excluded"} and not (previous and previous.state == "disputed"):
            if final_review.created_by != actor.id and (final_review.state != payload.state or
                    (payload.state == "approved" and final_review.content["verdict"] != payload.verdict)):
                state = "disputed"
        stamp = datetime.now(timezone.utc)
        # Validate the requested approval even if a disagreement will become disputed.
        Review(case_id=case.id, case_sha256=benchmark.case_hash(case),
               status=payload.state if payload.state in {"approved", "excluded"} else "pending",
               verdict=payload.verdict, evidence_passage_ids=payload.evidence_passage_ids,
               reviewer=actor.full_name, reviewed_at=stamp, rationale=payload.rationale.strip() or None,
               human_reviewed=payload.human_reviewed, permissions_checked=payload.permissions_checked)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    db.add(BenchmarkCaseReview(id=uuid4(), benchmark_id=row.id, case_id=case.id,
        version=payload.expected_version + 1, state=state,
        content=dict(verdict=payload.verdict, evidence_passage_ids=payload.evidence_passage_ids,
                     rationale=payload.rationale.strip(), human_reviewed=payload.human_reviewed,
                     permissions_checked=payload.permissions_checked, imported=imported),
        created_by=actor.id, created_by_name=actor.full_name, created_at=stamp))
    db.flush()


def save_review(db: Session, benchmark_id: UUID, case_id: str, payload: BenchmarkReviewWrite, actor: User) -> BenchmarkCaseRead:
    with mutation(db):
        row = lock_benchmark(db, benchmark_id)
        case = find_case(Benchmark.model_validate(row.dataset), case_id)
        append_review(db, row, case, payload, actor, latest_reviews(db, row.id).get(case_id))
        return case_detail(db, benchmark_id, case_id)


def save_criteria(db: Session, benchmark_id: UUID, payload: BenchmarkCriteriaWrite, actor: User) -> BenchmarkDetail:
    with mutation(db):
        row = lock_benchmark(db, benchmark_id, payload.expected_revision)
        stamp = datetime.now(timezone.utc)
        criteria = Criteria(**payload.model_dump(exclude={"expected_revision", "reason"}),
                            reviewer=actor.full_name, reviewed_at=stamp, rationale=payload.reason.strip())
        row.criteria = criteria.model_dump(mode="json")
        db.add(BenchmarkCriteriaHistory(id=uuid4(), benchmark_id=row.id, revision=row.revision,
            criteria=row.criteria, created_by=actor.id, created_by_name=actor.full_name, created_at=stamp))
        db.flush()
        return detail(db, row.id)


def export_reviews(db: Session, row: ResearchBenchmark) -> Reviews:
    benchmark = Benchmark.model_validate(row.dataset)
    current = latest_reviews(db, row.id)
    records = []
    for case in benchmark.cases:
        value = read_review(current[case.id]) if case.id in current else None
        records.append(Review(case_id=case.id, case_sha256=benchmark.case_hash(case),
            status=value.state if value and value.state in {"approved", "excluded"} else "pending",
            verdict=value.verdict if value else None, evidence_passage_ids=value.evidence_passage_ids if value else [],
            rationale=value.rationale or None if value else None, reviewer=value.reviewer_name if value else None,
            reviewed_at=value.reviewed_at if value else None, human_reviewed=value.human_reviewed if value else False,
            permissions_checked=value.permissions_checked if value else False))
    result = Reviews(benchmark_sha256=row.fingerprint, records=records)
    validate_bindings(benchmark, result)
    return result


def export_bundle(db: Session, benchmark_id: UUID, publication: int | None = None) -> BenchmarkExport:
    row = get_benchmark(db, benchmark_id)
    published = None
    if publication is not None:
        published = db.scalar(select(BenchmarkPublication).where(BenchmarkPublication.benchmark_id == row.id,
                                                                 BenchmarkPublication.number == publication))
        if published is None:
            raise HTTPException(404, "Published revision not found")
    return BenchmarkExport(benchmark=Benchmark.model_validate(row.dataset),
        reviews=Reviews.model_validate(published.reviews) if published else export_reviews(db, row),
        criteria=Criteria.model_validate(published.criteria if published else row.criteria),
        publication=publication_read(published) if published else None)


def publish(db: Session, benchmark_id: UUID, payload: BenchmarkPublishWrite, actor: User) -> BenchmarkPublicationRead:
    with mutation(db):
        row = lock_benchmark(db, benchmark_id, payload.expected_revision)
        reviews = export_reviews(db, row)
        if any(review.status == "pending" for review in reviews.records):
            raise HTTPException(409, "Review every case and resolve disputes before publishing")
        if not any(review.status == "approved" for review in reviews.records):
            raise HTTPException(409, "At least one approved case is required")
        if Criteria.model_validate(row.criteria).status != "approved":
            raise HTTPException(409, "Approve the evaluation criteria before publishing")
        content_hash = fingerprint({"benchmark": row.fingerprint, "reviews": reviews.model_dump(mode="json"), "criteria": row.criteria})
        previous = latest_publication(db, row.id)
        if previous and previous.fingerprint == content_hash:
            raise HTTPException(409, "These reviews and criteria have already been published")
        publication = BenchmarkPublication(id=uuid4(), benchmark_id=row.id, number=previous.number + 1 if previous else 1,
            source_revision=row.revision, reviews=reviews.model_dump(mode="json"), criteria=row.criteria,
            fingerprint=content_hash, reason=payload.reason.strip(), created_by=actor.id,
            created_by_name=actor.full_name, created_at=datetime.now(timezone.utc))
        db.add(publication)
        db.flush()
        return publication_read(publication)


def import_benchmark(db: Session, payload: BenchmarkImportWrite, actor: User) -> BenchmarkDetail:
    with mutation(db):
        row = ResearchBenchmark(id=uuid4(), fingerprint=fingerprint(payload.benchmark),
            dataset=payload.benchmark.model_dump(mode="json"), criteria=Criteria().model_dump(mode="json"), revision=0,
            created_by=actor.id, created_by_name=actor.full_name, created_at=datetime.now(timezone.utc))
        db.add(row)
        db.flush()
        return detail(db, row.id)


def import_reviews(db: Session, benchmark_id: UUID, payload: BenchmarkReviewImportWrite, actor: User) -> BenchmarkDetail:
    with mutation(db):
        row = lock_benchmark(db, benchmark_id, payload.expected_revision)
        benchmark = Benchmark.model_validate(row.dataset)
        try:
            validate_bindings(benchmark, payload.reviews)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        current = latest_reviews(db, row.id)
        imported_count = 0
        for record in payload.reviews.records:
            if not record.verdict and not record.rationale and not record.evidence_passage_ids:
                continue
            existing = current.get(record.case_id)
            if existing is not None:
                raise HTTPException(409, "Imports cannot overwrite reviewed cases or drafts. Review those cases in the form.")
            proposal = BenchmarkReviewWrite(expected_version=0, state="draft", verdict=record.verdict,
                rationale=(record.rationale or "")[:5000], evidence_passage_ids=record.evidence_passage_ids)
            append_review(db, row, find_case(benchmark, record.case_id), proposal, actor, None, imported=True)
            imported_count += 1
        if not imported_count:
            raise HTTPException(422, "The import contains no review proposals")
        return detail(db, row.id)


def audit(db: Session, benchmark_id: UUID, *, offset: int) -> BenchmarkAuditRead:
    get_benchmark(db, benchmark_id)
    publications = db.scalars(select(BenchmarkPublication).where(BenchmarkPublication.benchmark_id == benchmark_id)
        .order_by(BenchmarkPublication.number.desc()).offset(offset).limit(20))
    criteria = db.scalars(select(BenchmarkCriteriaHistory).where(BenchmarkCriteriaHistory.benchmark_id == benchmark_id)
        .order_by(BenchmarkCriteriaHistory.revision.desc()).offset(offset).limit(20))
    return BenchmarkAuditRead(publications=[publication_read(row) for row in publications],
        criteria=[BenchmarkCriteriaRead(revision=row.revision, criteria=Criteria.model_validate(row.criteria),
            created_by_name=row.created_by_name, created_at=row.created_at) for row in criteria])
