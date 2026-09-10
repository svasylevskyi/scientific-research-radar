"""Explicit, offline repricing of finished requests using today's database tariffs."""
import argparse
import json
from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import UUID

from sqlalchemy import select
from app.models.digest_run import DigestRun
from app.models.radar_price import RadarPrice
from app.models.radar_request import RadarRequest
from app.services.radar_cost_service import estimate, unknown_cost_reason


def backfill(db, *, apply=False, run_id=None, reprice_known=False):
    # Read versions once so one invocation uses a consistent tariff selection.
    prices = {}
    for row in db.scalars(select(RadarPrice).order_by(RadarPrice.id)):
        prices[row.model_name] = dict(row.pricing)
    statement = select(RadarRequest).join(DigestRun).where(
        DigestRun.status.in_(["completed", "failed"])
    ).order_by(RadarRequest.id)
    if run_id:
        statement = statement.where(RadarRequest.run_id == run_id)
    if apply:
        statement = statement.with_for_update()
    results = []
    for request in db.scalars(statement):
        before = estimate(request)
        result = {"request_id": str(request.id), "run_id": str(request.run_id),
                  "old_estimated_usd": str(before) if before is not None else None}
        if before is not None and not reprice_known:
            results.append({**result, "action": "unchanged", "reason": "Already priced"})
            continue
        # Prefer the recorded provider model; only fall back to a documented tariff model.
        model = request.model_name
        if model not in prices:
            model = (request.pricing or {}).get("model_name")
        if model not in prices:
            results.append({**result, "action": "skipped", "reason": "No current exact-model tariff"})
            continue
        pricing = {**prices[model], "model_name": model}
        candidate = SimpleNamespace(pricing=pricing, usage=request.usage,
                                    service_tier=request.service_tier, web_search_calls=request.web_search_calls)
        cost = estimate(candidate)
        if cost is None:
            results.append({**result, "action": "skipped", "reason": unknown_cost_reason(candidate)})
            continue
        prior = request.pricing
        # Ignore backfill metadata when checking whether repeat execution changes anything.
        if prior and {k: v for k, v in prior.items() if k != "backfill"} == pricing:
            results.append({**result, "action": "unchanged", "reason": "Current tariff already saved"})
            continue
        if apply:
            pricing["backfill"] = {"applied_at": datetime.now(timezone.utc).isoformat(),
                                   "source": "current_database_pricing", "previous_pricing": prior}
            request.pricing = pricing
        results.append({**result, "action": "updated" if apply else "would_update",
                        "pricing_model": model, "pricing_version": pricing["version"],
                        "estimated_usd": str(cost)})
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Save changes; default is read-only preview")
    parser.add_argument("--run-id", type=UUID, help="Limit to one run")
    parser.add_argument("--reprice-known", action="store_true", help="Also replace existing known estimates")
    args = parser.parse_args()
    from app.db.session import SessionLocal
    with SessionLocal() as db:
        with db.begin():
            results = backfill(db, apply=args.apply, run_id=args.run_id, reprice_known=args.reprice_known)
        print(json.dumps({"mode": "apply" if args.apply else "preview", "requests": results,
                          "counts": {action: sum(r["action"] == action for r in results)
                                     for action in ("updated", "would_update", "skipped", "unchanged")}}, indent=2))


if __name__ == "__main__":
    main()
