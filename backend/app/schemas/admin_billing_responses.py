"""Admin billing contracts, including the secondary diagnostic views."""

from datetime import date
from uuid import UUID

from pydantic import BaseModel

from app.schemas.api_common import (
    PlanConfigurationRead,
    RemainingRead,
    Timestamp,
    UsageRead,
)


class PlanRevisionRead(BaseModel):
    id: int
    code: str
    revision: int
    configuration: PlanConfigurationRead
    change_note: str
    created_by: UUID | None
    created_at: Timestamp


class SavedPlanRead(PlanRevisionRead):
    warnings: list[str]


class PlanListRead(BaseModel):
    items: list[PlanRevisionRead]
    total: int


class PriceWarningsRead(BaseModel):
    warnings: list[str]


class StripePriceRead(BaseModel):
    id: str
    currency: str
    amount: str
    interval: str


class StripeProductRead(BaseModel):
    id: str
    name: str
    prices: list[StripePriceRead]
    mapped_plan_codes: list[str]


class StripeProductsRead(BaseModel):
    items: list[StripeProductRead]


class StripePriceCheckRead(BaseModel):
    interval: str
    price_id: str
    tax_behavior: str | None
    currency: str | None
    unit_amount: int | None


class StripeMappingCheckRead(BaseModel):
    code: str
    revision: int
    matches: bool
    issues: list[str]
    prices: list[StripePriceCheckRead]
    checked_at: Timestamp
    environment: str


class SandboxPlanRead(BaseModel):
    revision: int
    configuration: PlanConfigurationRead


class SandboxAttemptRead(BaseModel):
    id: UUID
    plan_revision_id: int
    revision: int
    interval: str
    checkout_status: str
    subscription_status: str | None
    cancel_at_period_end: bool
    price_matches: bool
    period_end: Timestamp | None
    observed_at: Timestamp | None
    created_at: Timestamp


class SandboxOverviewRead(BaseModel):
    enabled: bool
    plan: SandboxPlanRead | None
    attempts: list[SandboxAttemptRead]
    portal_available: bool


class BillingJobRead(BaseModel):
    id: str
    checkout_id: UUID
    user_id: UUID
    email: str
    kind: str
    event_type: str | None
    state: str
    attempts: int
    failures: int
    manual_retries: int
    retried_by: UUID | None
    retried_at: Timestamp | None
    next_attempt_at: Timestamp | None
    lease_expires_at: Timestamp | None
    last_error: str | None
    last_attempt_at: Timestamp | None
    last_success_at: Timestamp | None
    created_at: Timestamp
    provider_observed_at: Timestamp | None
    subscription_status: str | None
    price_matches: bool


class BillingSyncRead(BaseModel):
    mode: str
    counts: dict[str, int]
    worker_last_seen_at: Timestamp | None
    worker_healthy: bool
    total: int
    items: list[BillingJobRead]


class InvoiceRead(BaseModel):
    id: str
    status: str
    currency: str
    amount_due: int
    amount_paid: int
    amount_remaining: int
    attempt_count: int
    billing_reason: str | None
    period_start: Timestamp | None
    period_end: Timestamp | None
    paid_at: Timestamp | None
    next_payment_attempt: Timestamp | None
    issue: str | None
    created_at: Timestamp
    observed_at: Timestamp


class PaymentAssessmentRead(BaseModel):
    status: str
    paid_through: Timestamp | None
    grace_until: Timestamp | None
    covered: bool
    issue: str | None


class AccountAccessRead(BaseModel):
    mode: str
    allowed: bool
    reason: str


class InvoiceReviewRead(BaseModel):
    items: list[InvoiceRead]
    total: int
    latest_invoice_id: str | None
    checked_at: Timestamp | None
    history_complete: bool
    discrepancies: list[str]
    payment: PaymentAssessmentRead
    account_access: AccountAccessRead


class ObservationPlanRead(BaseModel):
    id: int
    code: str
    revision: int
    configuration: PlanConfigurationRead


class AssignmentRead(BaseModel):
    id: int | None
    version: int
    mode: str
    plan: ObservationPlanRead | None
    created_by: UUID | None
    change_note: str
    created_at: Timestamp | None


class AssignmentListRead(BaseModel):
    items: list[AssignmentRead]
    total: int


class ObservationContextRead(BaseModel):
    frequency: str | None
    email: bool


class ObservationAssessmentRead(BaseModel):
    # Stored ISO strings keep their original spelling.
    at: str
    reasons: list[str]
    would_block: bool
    request_context: ObservationContextRead


class ObservationEntryRead(BaseModel):
    run_key: UUID
    run_id: UUID | None
    digest_id: UUID | None
    topic: str
    state: str
    trigger: str
    requested_papers: int
    actual_papers: int
    attempts: int
    assignment_id: int | None
    assessments: list[ObservationAssessmentRead]
    created_at: Timestamp
    updated_at: Timestamp


class ObservationUserRead(BaseModel):
    id: UUID
    email: str
    full_name: str


class ObservationUsageRead(UsageRead):
    released_runs: int


class ObservationOverviewRead(BaseModel):
    user: ObservationUserRead
    mode: str
    access: str
    tracking_since: Timestamp | None
    period_start: date
    period_end: date
    assignment: AssignmentRead
    usage: ObservationUsageRead
    digest_count: int
    remaining: RemainingRead
    total: int
    items: list[ObservationEntryRead]
