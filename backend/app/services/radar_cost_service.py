"""Admin-only accounting. No generated text or prompts are stored here."""
from decimal import Decimal
from sqlalchemy import select
from app.models.radar_request import RadarRequest


def unknown_cost_reason(request):
    p, u = request.pricing, request.usage
    if not p:
        return "No pricing snapshot was saved for this request (missing pricing at submission or discarded by an older release)."
    if u is None:
        return "OpenAI did not provide token usage for this request."
    if request.service_tier not in {None, "default"}:
        return f"Service tier '{request.service_tier}' is not supported by the configured standard tariff."
    required = ("input_tokens", "cached_input_tokens", "output_tokens")
    if any(not isinstance(u.get(key), int) or isinstance(u.get(key), bool) or u[key] < 0 for key in required):
        return "Token usage is missing required counters or contains invalid values."
    writes = u.get("cache_write_tokens", 0)
    if not isinstance(writes, int) or isinstance(writes, bool) or writes < 0:
        return "Cache-write token usage is invalid."
    if u["cached_input_tokens"] + writes > u["input_tokens"]:
        return "Cached input and cache-write tokens exceed total input tokens."
    if u["input_tokens"] > p["max_input_tokens"]:
        return f"Input tokens ({u['input_tokens']}) exceed the tariff limit ({p['max_input_tokens']})."
    if request.web_search_calls is None:
        return "The web-search call count is not available yet."
    if writes and p.get("cache_write_per_million") is None:
        return "The saved tariff has no cache-write rate. Publish a version with that rate for future requests."
    return None


def estimate(request):
    if unknown_cost_reason(request):
        return None
    p, u = request.pricing, request.usage
    # Reasoning is already included in output_tokens, cached tokens in input_tokens.
    return (
        Decimal(u["input_tokens"] - u["cached_input_tokens"] - u.get("cache_write_tokens", 0)) * Decimal(p["input_per_million"])
        + Decimal(u["cached_input_tokens"]) * Decimal(p["cached_input_per_million"])
        + Decimal(u.get("cache_write_tokens", 0)) * Decimal(p.get("cache_write_per_million") or "0")
        + Decimal(u["output_tokens"]) * Decimal(p["output_per_million"])
    ) / Decimal(1000000) + request.web_search_calls * Decimal(p["web_search_per_call"])


def run_costs(db, run, requests=None):
    requests = requests if requests is not None else list(db.scalars(select(RadarRequest).where(RadarRequest.run_id == run.id).order_by(RadarRequest.created_at, RadarRequest.id)))
    rows = []
    total = Decimal(0)
    unknown = 0
    for request in requests:
        cost = estimate(request)
        if cost is None:
            unknown += 1
        else:
            total += cost
        rows.append({
            "id": str(request.id), "stage_id": str(request.stage_id),
            "response_id": request.response_id, "model": request.model_name,
            "reasoning_effort": request.reasoning_effort, "status": request.status,
            "outcome": request.outcome, "usage": request.usage,
            "web_search_calls": request.web_search_calls, "service_tier": request.service_tier,
            "pricing": request.pricing, "unknown_cost_reason": unknown_cost_reason(request), "estimated_usd": str(cost) if cost is not None else None,
            "created_at": request.created_at, "observed_at": request.observed_at,
        })
    # Legacy and mixed runs can contain accepted responses with no ledger entry.
    recorded = {r.response_id for r in requests if r.response_id}
    historical_gap = run.request_count > len(recorded) or any(
        set(stage.response_ids or []) - recorded for stage in run.stages
    )
    stages = []
    for stage in sorted(run.stages, key=lambda s: s.position):
        stage_rows = [row for row in rows if row["stage_id"] == str(stage.id)]
        stages.append({"stage": stage.stage, "requests": stage_rows,
                       "legacy_accepted_usage": stage.usage_data if not stage_rows else None})
    return {"run_id": str(run.id), "currency": "USD", "known_estimated_usd": str(total),
            "complete": not unknown and not historical_gap and run.status in {"completed", "failed"},
            "unknown_requests": unknown, "historical_gap": historical_gap,
            "request_count": len(requests), "stages": stages}


def digest_costs(db, digest_id):
    """Sum every recorded attempt, independent of history pagination or run status."""
    from collections import defaultdict
    from sqlalchemy.orm import load_only, selectinload
    from app.models.digest_run import DigestRun, DigestRunStage
    runs = list(db.scalars(select(DigestRun).where(DigestRun.digest_id == digest_id).options(
        load_only(DigestRun.id, DigestRun.status, DigestRun.request_count),
        selectinload(DigestRun.stages).load_only(DigestRunStage.id, DigestRunStage.position,
            DigestRunStage.stage, DigestRunStage.response_ids, DigestRunStage.usage_data))))
    requests = defaultdict(list)
    for request in db.scalars(select(RadarRequest).join(DigestRun).where(DigestRun.digest_id == digest_id)):
        requests[request.run_id].append(request)
    totals = [run_costs(db, run, requests[run.id]) for run in runs]
    return {"digest_id": str(digest_id), "currency": "USD", "run_count": len(runs),
            "known_estimated_usd": str(sum((Decimal(t["known_estimated_usd"]) for t in totals), Decimal(0))),
            "complete": all(t["complete"] for t in totals),
            "unknown_requests": sum(t["unknown_requests"] for t in totals),
            "incomplete_runs": sum(not t["complete"] for t in totals)}
