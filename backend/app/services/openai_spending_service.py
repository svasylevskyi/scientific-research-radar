"""Read-only provider spending; credentials and provider errors never reach the UI."""
from collections import OrderedDict
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
import hashlib
import json
import threading
import time as clock

import httpx
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from app.models.digest_run import DigestRun
from app.models.radar_request import RadarRequest
from app.services.radar_cost_service import estimate


class SpendingError(Exception):
    def __init__(self, message, status_code=502):
        self.status_code = status_code
        super().__init__(message)


class Amount(BaseModel):
    value: Decimal = Field(allow_inf_nan=False)
    currency: str


class CostLine(BaseModel):
    amount: Amount
    project_id: str | None = None
    line_item: str | None = None


class Bucket(BaseModel):
    start_time: int
    end_time: int
    results: list[CostLine]


class CostPage(BaseModel):
    data: list[Bucket]
    has_more: bool
    next_page: str | None = None


_cache = OrderedDict()
_lock = threading.Lock()


def bounds(start: date, end: date):
    if end < start or (end - start).days >= 93 or end > datetime.now(timezone.utc).date():
        raise SpendingError("Choose a date range of up to 93 days ending no later than today (UTC).", 422)
    return (datetime.combine(start, time.min, timezone.utc),
            datetime.combine(end + timedelta(days=1), time.min, timezone.utc))


def provider_costs(settings, start, end):
    if not settings.openai_admin_api_key or not settings.openai_costs_project_id:
        raise SpendingError("Configure OPENAI_ADMIN_API_KEY and OPENAI_COSTS_PROJECT_ID on the server to view OpenAI spending.", 503)
    key = settings.openai_admin_api_key.get_secret_value()
    project = settings.openai_costs_project_id
    cache_key = (hashlib.sha256(key.encode()).hexdigest(), project, start, end)
    # A bounded per-process cache also coalesces concurrent duplicate refreshes.
    with _lock:
        cached = _cache.get(cache_key)
        if cached and clock.monotonic() - cached[0] < 300:
            return cached[1]
        result = fetch_costs(key, project, start, end)
        _cache[cache_key] = (clock.monotonic(), result)
        _cache.move_to_end(cache_key)
        while len(_cache) > 16:
            _cache.popitem(last=False)
        return result


def fetch_costs(key, project, start, end):
    params = [("start_time", int(start.timestamp())), ("end_time", int(end.timestamp())),
              ("bucket_width", "1d"), ("limit", 93), ("project_ids[]", project),
              ("group_by[]", "project_id"), ("group_by[]", "line_item")]
    daily, lines = {}, {}
    seen = set()
    cursor = None
    deadline = clock.monotonic() + 45
    try:
        with httpx.Client(timeout=15, follow_redirects=False) as client:
            for _ in range(20):
                remaining = deadline - clock.monotonic()
                if remaining <= 0:
                    raise SpendingError("OpenAI spending retrieval timed out. Please try again.")
                response = client.get("https://api.openai.com/v1/organization/costs",
                    headers={"Authorization": f"Bearer {key}"},
                    params=params + ([("page", cursor)] if cursor else []), timeout=min(15, remaining))
                if response.status_code in (401, 403):
                    raise SpendingError("OpenAI denied billing access. Check the server admin key and its permissions.")
                if response.status_code == 429:
                    raise SpendingError("OpenAI spending is temporarily rate limited. Please try again later.", 503)
                response.raise_for_status()
                page = CostPage.model_validate(json.loads(response.text, parse_float=Decimal))
                for bucket in page.data:
                    if not start.timestamp() <= bucket.start_time < bucket.end_time <= end.timestamp():
                        raise ValueError("Unexpected bucket bounds")
                    day = datetime.fromtimestamp(bucket.start_time, timezone.utc).date().isoformat()
                    daily.setdefault(day, Decimal(0))
                    for line in bucket.results:
                        if line.project_id != project or line.amount.currency.lower() != "usd":
                            raise ValueError("Unexpected project or currency")
                        daily[day] += line.amount.value
                        label = line.line_item or "Unspecified charge"
                        lines[label] = lines.get(label, Decimal(0)) + line.amount.value
                if not page.has_more:
                    return {"fetched_at": datetime.now(timezone.utc).isoformat(), "project_id": project,
                            "reported_usd": str(sum(daily.values(), Decimal(0))),
                            "daily": {day: str(value) for day, value in daily.items()},
                            "charges": [{"line_item": label, "reported_usd": str(value)} for label, value in sorted(lines.items())]}
                if not page.next_page or page.next_page in seen:
                    raise ValueError("Invalid pagination")
                cursor = page.next_page
                seen.add(cursor)
            raise ValueError("Pagination limit exceeded")
    except SpendingError:
        raise
    except Exception:
        # Do not return upstream bodies, credentials, or partial totals.
        raise SpendingError("Could not retrieve complete OpenAI spending data. Please try again later.") from None


def spending_report(db, settings, start_date, end_date):
    start, end = bounds(start_date, end_date)
    provider = provider_costs(settings, start, end)
    days = {}
    for i in range((end_date - start_date).days + 1):
        day = (start_date + timedelta(days=i)).isoformat()
        days[day] = {"date": day, "reported_usd": provider["daily"].get(day),
                     "known_estimated_usd": Decimal(0), "requests": 0, "unknown_requests": 0}
    for request in db.scalars(select(RadarRequest).where(
        RadarRequest.created_at >= start, RadarRequest.created_at < end).execution_options(yield_per=500)):
        timestamp = request.created_at
        day = timestamp.replace(tzinfo=timezone.utc).date().isoformat() if timestamp.tzinfo is None else timestamp.astimezone(timezone.utc).date().isoformat()
        row = days[day]
        row["requests"] += 1
        cost = estimate(request)
        if cost is None:
            row["unknown_requests"] += 1
        else:
            row["known_estimated_usd"] += cost
    ledger_count = select(func.count(RadarRequest.id)).where(RadarRequest.run_id == DigestRun.id).correlate(DigestRun).scalar_subquery()
    legacy_runs = db.scalar(select(func.count()).select_from(DigestRun).where(
        DigestRun.started_at >= start, DigestRun.started_at < end, DigestRun.request_count > ledger_count))
    total = sum((row["known_estimated_usd"] for row in days.values()), Decimal(0))
    return {**{k: v for k, v in provider.items() if k != "daily"},
            "from_date": start_date, "to_date": end_date, "currency": "USD",
            "known_estimated_usd": str(total), "legacy_runs": legacy_runs,
            "unknown_requests": sum(row["unknown_requests"] for row in days.values()),
            "daily": [{**row, "known_estimated_usd": str(row["known_estimated_usd"])} for row in days.values()]}
