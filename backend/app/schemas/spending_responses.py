"""Pricing and spending keep decimal amounts as strings, never JSON floats."""

from datetime import date
from uuid import UUID

from pydantic import BaseModel

from app.schemas.api_common import Timestamp


class RadarPriceRead(BaseModel):
    id: int
    model_name: str
    version: str
    input_per_million: str
    cached_input_per_million: str
    cache_write_per_million: str | None = None
    output_per_million: str
    web_search_per_call: str
    max_input_tokens: int
    created_at: Timestamp
    created_by: UUID | None


class RadarPriceDetailRead(RadarPriceRead):
    is_current: bool


class RadarPricesRead(BaseModel):
    items: list[RadarPriceDetailRead]
    total: int
    offset: int
    limit: int


class SpendingDayRead(BaseModel):
    date: date
    reported_usd: str | None
    known_estimated_usd: str
    requests: int
    unknown_requests: int


class SpendingChargeRead(BaseModel):
    line_item: str
    reported_usd: str


class SpendingReportRead(BaseModel):
    fetched_at: str
    project_id: str
    reported_usd: str
    charges: list[SpendingChargeRead]
    from_date: date
    to_date: date
    currency: str
    known_estimated_usd: str
    legacy_runs: int
    unknown_requests: int
    daily: list[SpendingDayRead]
