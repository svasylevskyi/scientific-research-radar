"""Erase structured administrator attribution from shared review history.

Scientific findings remain shared records. Publication hashes change on privacy
redaction; existing AI comparisons are invalidated rather than silently rebound.
"""
from copy import deepcopy
from datetime import datetime, timezone

from sqlalchemy import select, update

from app.db.base import Base
from app.evaluation.models import fingerprint
from app.models.benchmark_review import BenchmarkPublication, ResearchBenchmark
from app.models.claim_review import ClaimReview


def redact_reviewers(value, names):
    if isinstance(value, list):
        return [redact_reviewers(item, names) for item in value]
    if not isinstance(value, dict):
        return value
    return {key: "Former administrator" if key in {"reviewer", "created_by_name", "reviewer_name"} and isinstance(item, str) and item in names
            else redact_reviewers(item, names) for key, item in value.items()}


def redact_admin_history(db, uid):
    names = set()
    for table in Base.metadata.sorted_tables:
        if "created_by" in table.c and "created_by_name" in table.c:
            names.update(db.scalars(select(table.c.created_by_name).where(table.c.created_by == uid)))
            db.execute(update(table).where(table.c.created_by == uid).values(created_by_name="Former administrator"))
    if not names:
        return
    for model in (ResearchBenchmark, BenchmarkPublication):
        for row in db.scalars(select(model)):
            before = deepcopy(row.criteria)
            row.criteria = redact_reviewers(row.criteria, names)
            changed = before != row.criteria
            if isinstance(row, BenchmarkPublication):
                reviews = redact_reviewers(row.reviews, names)
                changed |= reviews != row.reviews
                row.reviews = reviews
                if changed:
                    benchmark = db.get(ResearchBenchmark, row.benchmark_id)
                    row.fingerprint = fingerprint({"benchmark": benchmark.fingerprint, "reviews": row.reviews, "criteria": row.criteria})
                    db.execute(update(ClaimReview).where(ClaimReview.publication_id == row.id).values(
                        status="failed", report=None, active_key=None, lease_token=None,
                        error="Benchmark attribution was redacted for account closure. Run a new comparison against the updated publication.",
                        finished_at=datetime.now(timezone.utc)))
    history = Base.metadata.tables["benchmark_criteria_history"]
    for item in db.execute(select(history.c.id, history.c.criteria)):
        redacted = redact_reviewers(item.criteria, names)
        if redacted != item.criteria:
            db.execute(update(history).where(history.c.id == item.id).values(criteria=redacted))
    # An admin's queued shared benchmark review must not continue after erasure.
    db.execute(update(ClaimReview).where(ClaimReview.created_by == uid, ClaimReview.active_key.is_not(None)).values(
        status="failed", active_key=None, lease_token=None, finished_at=datetime.now(timezone.utc),
        error="The requesting administrator closed their account."))
