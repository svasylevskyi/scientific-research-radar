"""Fenced one-call ticks. An uncertain submission is never automatically repeated."""
import asyncio
import logging
import time
from collections.abc import Callable
from datetime import datetime, timedelta, timezone
from typing import Any, cast
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.engine import CursorResult
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import Settings
from app.evaluation.models import fingerprint
from app.evaluation.scoring import evaluate
from app.models.claim_review import ClaimReview, ClaimReviewRequest
from app.models.user import User, UserRole
from app.schemas.claim_review import ClaimReviewConfig
from app.services.benchmark_review_service import export_bundle
from app.services.claim_review_provider import PROMPT_VERSION, request_review, validate_verdict
from app.services.claim_review_service import candidate_for, get_review, requests_for, utc
from app.services.radar_cost_service import estimate
from app.services.research_quality_settings import current_settings

Provider = Callable[[Settings, ClaimReviewConfig, dict[str, Any]], dict[str, Any]]


def finish(db: Session, job: ClaimReview, *, error: str | None = None) -> None:
    job.status = "failed" if error else "completed"
    job.error, job.active_key, job.lease_token = error, None, None
    job.finished_at = datetime.now(timezone.utc)
    rows = requests_for(db, job)
    candidate = candidate_for(job, rows)
    if candidate is not None:
        request = job.context["request"]
        from uuid import UUID
        bundle = export_bundle(db, UUID(request["benchmark_id"]), job.context["publication"])
        if fingerprint(bundle.benchmark) != job.context["benchmark_sha256"] or not bundle.publication or bundle.publication.fingerprint != job.context["publication_sha256"]:
            job.status, job.error = "failed", "Published benchmark inputs changed; no comparison was accepted."
        else:
            report = evaluate(bundle.benchmark, bundle.reviews, candidate, bundle.criteria, split=job.context["split"])
            report["limitations"] = [line for line in report["limitations"] if not line.startswith(("This compares", "Cost and latency"))]
            report["limitations"].append("Scoring uses saved verdicts from this paid review; all request costs and unknown attempts are shown separately in its ledger.")
            if error and report["decision"] == "pass":
                report["decision"] = "fail"
                report["failures"].append("The AI review did not complete successfully")
            job.report = report
    db.commit()


def tick(factory: sessionmaker[Session], settings: Settings, provider: Provider = request_review) -> bool:
    now = datetime.now(timezone.utc)
    token = str(uuid4())
    with factory() as db:
        candidate = db.execute(select(ClaimReview.id, ClaimReview.lease_until).where(ClaimReview.active_key == "review")).first()
        if candidate is None:
            return False
        if candidate.lease_until is not None and utc(candidate.lease_until) > now:
            return False
        statement = update(ClaimReview).where(ClaimReview.id == candidate.id, ClaimReview.active_key == "review",
            (ClaimReview.lease_until.is_(None) | (ClaimReview.lease_until <= now)))
        claimed = cast(CursorResult, db.execute(statement.values(status="running", lease_token=token, lease_until=now + timedelta(seconds=180)).execution_options(synchronize_session=False)))
        if claimed.rowcount != 1:
            db.rollback()
            return False
        db.commit()
        job = db.get(ClaimReview, candidate.id)
        assert job is not None
        previous = requests_for(db, job)
        if any(row.outcome != "accepted" for row in previous):
            finish(db, job, error="A previous request was interrupted or could not be validated. Its cost may be unknown; it was not retried.")
            return True
        if current_settings(db).config.claim_review.mode != "observe":
            finish(db, job, error="AI claim review was switched Off. No further requests were submitted.")
            return True
        actor = db.get(User, job.created_by) if job.created_by else None
        try:
            if actor is None or not actor.is_active or (actor.role != UserRole.ADMIN and not actor.is_super_admin):
                raise HTTPException(403)
            get_review(db, job.id, actor)
        except HTTPException:
            finish(db, job, error="The requesting administrator no longer has access. Review stopped.")
            return True
        if utc(job.created_at) + timedelta(hours=2) < now or utc(job.created_at).date() != now.date():
            finish(db, job, error="The review reservation expired. Start a new review if still required.")
            return True
        if job.prompt_version != PROMPT_VERSION or fingerprint({"cases": job.inputs}) != job.input_sha256:
            finish(db, job, error="The saved review inputs or prompt version are incompatible. No further requests were made.")
            return True
        done = {row.case_id for row in previous}
        case = next((item for item in job.inputs if item["case_id"] not in done), None)
        if case is None:
            finish(db, job)
            return True
        config = ClaimReviewConfig.model_validate(job.config)
        row = ClaimReviewRequest(review_id=job.id, case_id=case["case_id"], model_name=config.model,
            reasoning_effort="low", pricing=job.pricing, created_at=now, status="submitted", outcome="unconfirmed")
        db.add(row)
        db.commit()  # Persist request intent BEFORE external I/O.
        review_id, request_id = job.id, row.id
    started = time.monotonic()
    observation = None
    try:
        observation = provider(settings, config, case)
    except Exception:
        # Raw upstream errors can contain input text or credentials. Keep a generic
        # audit outcome, with the unknown-cost reservation retained.
        logging.getLogger(__name__).warning("AI claim review request failed (review %s)", review_id)
    elapsed = time.monotonic() - started
    with factory() as db:
        # Acquire the lease row before accepting a response. An expired/reclaimed
        # worker cannot overwrite the new owner's outcome or issue another call.
        locked = cast(CursorResult, db.execute(update(ClaimReview).where(ClaimReview.id == review_id,
            ClaimReview.lease_token == token, ClaimReview.active_key == "review").values(lease_until=datetime.now(timezone.utc))))
        if locked.rowcount != 1:
            db.rollback()
            return True
        job = db.get(ClaimReview, review_id, populate_existing=True)
        saved_request = db.get(ClaimReviewRequest, request_id)
        assert job is not None and saved_request is not None
        row = saved_request
        row.latency_seconds, row.observed_at = elapsed, datetime.now(timezone.utc)
        failure = "The provider request failed or timed out. Billing may be unknown; it was not retried."
        if observation is not None:
            row.response_id = observation.get("response_id")
            row.model_name = observation.get("model_name") or config.model
            row.status = observation.get("status") or "unknown"
            row.service_tier, row.usage = observation.get("service_tier"), observation.get("usage")
            row.web_search_calls = 0
            # Keep the requested alias tariff; this endpoint fixes standard tier
            # and never uses tools. All counters survive invalid model output.
            try:
                if row.status != "completed":
                    raise ValueError("Incomplete provider response")
                result = validate_verdict(observation["text"], case)
                row.result, row.outcome = result.model_dump(), "accepted"
            except (ValueError, KeyError, TypeError):
                row.outcome = "invalid_output"
                failure = "The AI response was incomplete, refused, or had invalid evidence references. It was recorded without an accepted verdict."
        else:
            row.status, row.outcome = "unknown", "unconfirmed"
        db.flush()
        if row.result is None:
            finish(db, job, error=failure)
        elif estimate(row) is None:
            finish(db, job, error="The provider returned no priceable usage. The accepted verdict was retained; further calls stopped.")
        elif sum((estimate(item) or 0 for item in requests_for(db, job))) > job.reserved_usd:
            finish(db, job, error="Measured cost exceeded the configured tariff reservation. Further calls stopped; review pricing before continuing.")
        elif len(previous) + 1 == len(job.inputs):
            finish(db, job)
        else:
            job.lease_token = None
            db.commit()
    return True


async def worker_loop(factory: sessionmaker[Session], settings: Settings) -> None:
    while True:
        try:
            await asyncio.to_thread(tick, factory, settings)
        except Exception:
            logging.getLogger(__name__).error("AI claim review worker tick failed; unfinished submissions will not be repeated")
        await asyncio.sleep(2)
