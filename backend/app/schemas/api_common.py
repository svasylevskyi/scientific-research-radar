"""Shared response values. Output schemas describe saved data, not write policy."""

from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, PlainSerializer

# Keep the existing ISO spelling (+00:00 rather than Z), including naive dates
# in older pricing records. TypeScript sees an ISO date-time string.
Timestamp = Annotated[
    datetime, PlainSerializer(lambda value: value.isoformat(), return_type=str)
]
Frequency = Literal["daily", "weekly", "monthly", "quarterly"]


class EntitlementsRead(BaseModel):
    max_digests: int
    max_papers_per_run: int
    papers_per_month: int
    runs_per_month: int
    manual_runs_per_month: int
    schedule_frequencies: list[Frequency]
    email_delivery: bool


class StripeMappingRead(BaseModel):
    product_id: str
    monthly_price_id: str
    annual_price_id: str | None = None


class PlanConfigurationRead(EntitlementsRead):
    """Historical revisions may predate billing/publication fields.

    Do not reapply today's publishing validators or inject defaults on reads.
    Monetary values retain the decimal strings stored in the revision.
    """

    name: str
    description: str
    state: str
    currency: str
    monthly_price: str
    annual_price: str | None
    tax_display: str
    trial_days: int
    display_order: int = 0
    stripe_sandbox: StripeMappingRead | None = None
    billing_type: Literal["stripe", "free"] = "stripe"
    subscriber_visible: bool = False


class RemainingRead(BaseModel):
    runs: int | None
    manual_runs: int | None
    papers: int | None
    digests: int | None


class UsageRead(BaseModel):
    completed_runs: int
    reserved_runs: int
    manual_runs: int
    completed_papers: int
    reserved_papers: int


class RedirectRead(BaseModel):
    url: str


class QueuedRead(BaseModel):
    queued: bool


class WebhookReceiptRead(BaseModel):
    received: bool
    ignored: bool = False
    queued: bool = False
