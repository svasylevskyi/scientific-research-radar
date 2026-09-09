"""Admin-only accounting. No generated text or prompts are stored here."""
from decimal import Decimal
from sqlalchemy import select
from app.models.radar_request import RadarRequest


def estimate(request):
    p, u = request.pricing, request.usage
    if not p or not u or request.service_tier not in {None, "default"}:
        return None
    if u["input_tokens"] > p["max_input_tokens"] or request.web_search_calls is None:
        return None
    if u.get("cache_write_tokens", 0):
        return None
    if not 0 <= u["cached_input_tokens"] <= u["input_tokens"]:
        return None
    # Reasoning is already included in output_tokens, cached tokens in input_tokens.
    return (
        Decimal(u["input_tokens"] - u["cached_input_tokens"]) * Decimal(p["input_per_million"])
        + Decimal(u["cached_input_tokens"]) * Decimal(p["cached_input_per_million"])
        + Decimal(u["output_tokens"]) * Decimal(p["output_per_million"])
    ) / Decimal(1000000) + request.web_search_calls * Decimal(p["web_search_per_call"])


def run_costs(db, run):
    requests = list(db.scalars(select(RadarRequest).where(RadarRequest.run_id == run.id).order_by(RadarRequest.created_at, RadarRequest.id)))
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
            "pricing": request.pricing, "estimated_usd": str(cost) if cost is not None else None,
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
