"""Admission, immutable input snapshots and admin read models for AI observations."""
from datetime import datetime, timezone
from decimal import Decimal, ROUND_CEILING
from typing import Any, Literal, cast
from uuid import UUID

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, defer

from app.core.config import Settings
from app.evaluation.models import Candidate, Judgment, fingerprint
from app.models.benchmark_review import BenchmarkPublication
from app.models.claim_review import ClaimReview, ClaimReviewBudget, ClaimReviewRequest
from app.models.digest_run import DigestRun
from app.models.user import User
from app.schemas.claim_review import ClaimReviewCaseRead, ClaimReviewConfig, ClaimReviewHistory, ClaimReviewRead, ClaimReviewStart
from app.schemas.radar_pricing import RadarPricing
from app.services.benchmark_review_service import export_bundle
from app.services.claim_review_inputs import benchmark_inputs, run_inputs
from app.services.claim_review_provider import PROMPT_VERSION, input_token_ceiling
from app.services.digest_run_service import DigestRunHistoryService, DigestRunNotFoundError
from app.services.digest_service import DigestNotFoundError
from app.services.radar_cost_service import estimate
from app.services.radar_pricing_service import current_price
from app.services.research_quality_settings import current_settings


def utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def accessible_run(db: Session, actor: User, digest_id: UUID, run_id: UUID) -> DigestRun:
    try:
        return DigestRunHistoryService(db).get_for_admin(actor=actor, digest_id=digest_id, run_id=run_id)
    except (DigestNotFoundError, DigestRunNotFoundError) as exc:
        raise HTTPException(404, "Digest run not found") from exc


def get_review(db: Session, review_id: UUID, actor: User) -> ClaimReview:
    job = db.get(ClaimReview, review_id)
    if job is None:
        raise HTTPException(404, "AI review not found")
    if job.kind == "run":
        run = db.get(DigestRun, job.run_id)
        if run is None:
            raise HTTPException(404, "Digest run not found")
        accessible_run(db, actor, run.digest_id, run.id)
    return job


def reserve_ceiling(cases: list[dict[str, Any]], config: ClaimReviewConfig, pricing: RadarPricing) -> Decimal:
    input_rate = max(pricing.input_per_million, pricing.cached_input_per_million, pricing.cache_write_per_million or Decimal(0))
    if input_rate <= 0 or pricing.output_per_million <= 0:
        raise HTTPException(409, "Publish nonzero input and output pricing for the reviewer model before enabling paid reviews.")
    total = Decimal(0)
    for case in cases:
        try:
            tokens = input_token_ceiling(case)
        except ValueError as exc:
            raise HTTPException(409, str(exc)) from exc
        if tokens > pricing.max_input_tokens:
            raise HTTPException(409, "Review input exceeds the configured tariff limit. Publish appropriate pricing before reviewing.")
        total += (tokens * input_rate + config.max_output_tokens * pricing.output_per_million) / Decimal(1_000_000)
    return total.quantize(Decimal("0.000001"), rounding=ROUND_CEILING)


def start_review(db: Session, *, actor: User, payload: ClaimReviewStart, settings: Settings) -> ClaimReview:
    existing = db.get(ClaimReview, payload.request_id)
    request_data = payload.model_dump(mode="json")
    if existing is not None:
        if existing.created_by != actor.id or existing.context["request"] != request_data:
            raise HTTPException(409, "This request ID is already used for a different review.")
        return get_review(db, existing.id, actor)
    policy = current_settings(db)
    config = policy.config.claim_review
    if policy.version != payload.expected_settings_version:
        raise HTTPException(409, "Quality settings changed. Reload before starting a paid review.")
    if config.mode != "observe":
        raise HTTPException(409, "AI claim review is Off. A super-admin can enable Observe mode.")
    if settings.openai_api_key is None:
        raise HTTPException(503, "Configure OPENAI_API_KEY before starting AI reviews.")
    context: dict[str, Any] = {"request": request_data}
    publication_id = None
    if payload.run_id is not None and payload.digest_id is not None:
        try:
            cases = run_inputs(db, accessible_run(db, actor, payload.digest_id, payload.run_id))
        except ValidationError as exc:
            raise HTTPException(409, "Saved summaries or evidence use an incompatible format. No AI request was made.") from exc
        kind = "run"
    else:
        assert payload.benchmark_id is not None and payload.publication is not None
        bundle = export_bundle(db, payload.benchmark_id, payload.publication)
        approved_ids = {review.case_id for review in bundle.reviews.records if review.status == "approved"}
        cases = [case for case in benchmark_inputs(bundle.benchmark, payload.split) if case["case_id"] in approved_ids]
        if not cases or len(cases) > config.max_claims:
            raise HTTPException(409, "All approved cases in the benchmark split must fit the configured claim limit; excluded cases are never submitted.")
        publication = db.scalar(select(BenchmarkPublication).where(BenchmarkPublication.benchmark_id == payload.benchmark_id,
            BenchmarkPublication.number == payload.publication))
        assert publication is not None
        publication_id = publication.id
        context.update(benchmark_sha256=fingerprint(bundle.benchmark), publication_sha256=publication.fingerprint,
                       split=payload.split, publication=payload.publication)
        kind = "benchmark"
    total_claims = len(cases)
    cases = cases[:config.max_claims]
    raw_price = current_price(db, config.model)
    if raw_price is None:
        raise HTTPException(409, "Publish pricing for the selected reviewer model in Admin Pricing first.")
    ceiling = reserve_ceiling(cases, config, RadarPricing.model_validate(raw_price))
    if ceiling > config.max_review_usd:
        raise HTTPException(409, f"This review needs a conservative ${ceiling} reservation, above its ${config.max_review_usd} limit. Adjust the claim limit or budget before trying again.")
    now = datetime.now(timezone.utc)
    try:
        # The singleton serial update is the cross-process admission lock on
        # PostgreSQL. Reservations survive deletions and uncertain costs.
        if db.get(ClaimReviewBudget, 1) is None:
            with db.begin_nested():
                db.add(ClaimReviewBudget(id=1, day=now.date(), serial=0, reserved_usd=0, reserved_calls=0))
                db.flush()
        db.execute(update(ClaimReviewBudget).where(ClaimReviewBudget.id == 1).values(serial=ClaimReviewBudget.serial + 1))
        budget = db.get(ClaimReviewBudget, 1, populate_existing=True)
        assert budget is not None
        # Recheck policy after obtaining the admission lock.
        if current_settings(db).version != policy.version:
            raise HTTPException(409, "Quality settings changed. Reload before starting a paid review.")
        if budget.day != now.date():
            budget.day, budget.reserved_usd, budget.reserved_calls = now.date(), Decimal(0), 0
        if budget.reserved_usd + ceiling > config.daily_budget_usd or budget.reserved_calls + len(cases) > config.daily_call_limit:
            raise HTTPException(409, "The daily AI review reservation budget is exhausted. Try after the next UTC day or ask a super-admin to review the limits.")
        if db.scalar(select(ClaimReview.id).where(ClaimReview.active_key == "review")) is not None:
            raise HTTPException(409, "An AI review is already in progress. Wait for it to finish before starting another.")
        budget.reserved_usd += ceiling
        budget.reserved_calls += len(cases)
        job = ClaimReview(id=payload.request_id, kind=kind, run_id=payload.run_id, publication_id=publication_id,
            active_key="review", status="queued", created_by=actor.id, created_by_name=actor.full_name, created_at=now,
            settings_version=policy.version, config=config.model_dump(mode="json"), pricing={**raw_price, "model_name": config.model},
            prompt_version=PROMPT_VERSION, input_sha256=fingerprint({"cases": cases}), inputs=cases,
            total_claims=total_claims, reserved_usd=ceiling, context=context)
        db.add(job)
        db.commit()
        return job
    except IntegrityError as exc:
        db.rollback()
        existing = db.get(ClaimReview, payload.request_id)
        if existing and existing.created_by == actor.id and existing.context["request"] == request_data:
            return get_review(db, existing.id, actor)
        raise HTTPException(409, "Review admission changed. Reload before trying again.") from exc
    except Exception:
        db.rollback()
        raise


def requests_for(db: Session, job: ClaimReview) -> list[ClaimReviewRequest]:
    return list(db.scalars(select(ClaimReviewRequest).where(ClaimReviewRequest.review_id == job.id).order_by(ClaimReviewRequest.created_at)))


def candidate_for(job: ClaimReview, requests: list[ClaimReviewRequest]) -> Candidate | None:
    if job.kind != "benchmark":
        return None
    cases = {case["case_id"]: case for case in job.inputs}
    return Candidate(benchmark_sha256=job.context["benchmark_sha256"], candidate_id=str(job.id),
        method="saved_model_output", model=job.config["model"], prompt_version=job.prompt_version, evaluator_version="1",
        judgments=[Judgment(case_id=row.case_id, case_sha256=cases[row.case_id]["case_sha256"], **row.result,
            cost_usd=float(estimate(row)) if estimate(row) is not None else None, latency_seconds=row.latency_seconds)
            for row in requests if row.result is not None])


def read_review(db: Session, job: ClaimReview, *, include_cases: bool = True) -> ClaimReviewRead:
    requests = requests_for(db, job)
    by_case = {row.case_id: row for row in requests}
    costs = [estimate(row) for row in requests]
    cases = []
    for case in job.inputs if include_cases else []:
        row = by_case.get(case["case_id"])
        cost = estimate(row) if row else None
        cases.append(ClaimReviewCaseRead(case_id=case["case_id"], scope=case["scope"], claim=case["claim"],
            paper_id=case.get("paper_id"), sources=case["sources"], **(row.result or {} if row else {}),
            status=row.outcome if row else "not_reviewed", estimated_usd=str(cost) if cost is not None else None,
            latency_seconds=row.latency_seconds if row else None))
    return ClaimReviewRead(id=job.id, kind=cast(Literal["run", "benchmark"], job.kind), status=job.status, created_at=utc(job.created_at),
        finished_at=utc(job.finished_at) if job.finished_at else None, created_by_name=job.created_by_name,
        settings_version=job.settings_version, model=job.config["model"], prompt_version=job.prompt_version,
        input_sha256=job.input_sha256, total_claims=job.total_claims, selected_claims=min(job.total_claims, job.config["max_claims"]),
        completed_claims=sum(row.result is not None for row in requests), reserved_usd=str(job.reserved_usd),
        known_estimated_usd=str(sum((cost for cost in costs if cost is not None), Decimal(0))),
        unknown_requests=sum(cost is None for cost in costs), error=job.error, cases=cases, report=job.report,
        publication=job.context.get("publication"), split=job.context.get("split"))


def history(db: Session, *, actor: User, digest_id: UUID | None, run_id: UUID | None,
            benchmark_id: UUID | None, offset: int, limit: int) -> ClaimReviewHistory:
    statement = select(ClaimReview)
    if digest_id is not None and run_id is not None and benchmark_id is None:
        accessible_run(db, actor, digest_id, run_id)
        statement = statement.where(ClaimReview.run_id == run_id)
    elif benchmark_id is not None and digest_id is None and run_id is None:
        statement = statement.join(BenchmarkPublication).where(BenchmarkPublication.benchmark_id == benchmark_id)
    else:
        raise HTTPException(422, "Choose one run or one benchmark.")
    total = db.scalar(select(func.count()).select_from(statement.subquery())) or 0
    rows = db.scalars(statement.options(defer(ClaimReview.inputs)).order_by(ClaimReview.created_at.desc(), ClaimReview.id).offset(offset).limit(limit))
    return ClaimReviewHistory(items=[read_review(db, row, include_cases=False) for row in rows], total=total, offset=offset, limit=limit)
