"""Subscriber contracts. Internal provider identifiers stay out of plan details."""

from typing import Literal
from uuid import UUID

from pydantic import BaseModel

from app.schemas.api_common import EntitlementsRead, RemainingRead, Timestamp, UsageRead


class PublicPlanRead(EntitlementsRead):
    code: str
    revision: int
    billing_type: Literal["stripe", "free"]
    name: str
    description: str
    currency: str
    monthly_price: str
    annual_price: str | None
    tax_display: str


class PublicPlansRead(BaseModel):
    items: list[PublicPlanRead]
    sandbox: bool


class BillingAttemptRead(BaseModel):
    plan_name: str
    code: str
    revision: int
    interval: str
    checkout_status: str
    subscription_status: str | None


class BillingStatusRead(BaseModel):
    sandbox: bool
    checkout_allowed: bool
    resume_allowed: bool
    portal_allowed: bool
    cancel_allowed: bool
    cancel_at_period_end: bool
    period_end: Timestamp | None
    reason: str
    attempt: BillingAttemptRead | None


class AccessPlanRead(BaseModel):
    id: int
    name: str
    configuration: EntitlementsRead


class AccessRead(BaseModel):
    mode: Literal["complimentary", "sandbox"]
    version: int
    allowed: bool
    reason: str
    status: str | None
    plan: AccessPlanRead | None
    checkout_id: UUID | None
    period_start: Timestamp | None
    period_end: Timestamp | None
    grace_until: Timestamp | None
    access_until: Timestamp | None
    observed_at: Timestamp | None
    cancel_at_period_end: bool
    billing_type: Literal["free", "stripe"] | None
    payment_status: str = ""
    paid_through: Timestamp | None = None
    payment_issue: str | None = None
    fallback_eligible: bool = False
    fallback: bool = False
    fallback_since: Timestamp | None = None
    active_digest_ids: list[UUID] = []
    retained_digest_count: int
    digest_count: int
    usage: UsageRead
    remaining: RemainingRead
    create_allowed: bool
    create_reasons: list[str]
    schedule_allowed: bool
    schedule_reasons: list[str]
    paper_limit: int
    research_warning: str | None
    run_allowed: bool = False
    run_reasons: list[str] = []
    retry_allowed: bool = False
    retry_reasons: list[str] = []


class AccessHistoryRead(BaseModel):
    version: int
    mode: str
    created_by: UUID | None
    created_at: Timestamp
    change_note: str


class AdminAccessRead(AccessRead):
    email: str
    history: list[AccessHistoryRead]


class AccessPolicyRead(BaseModel):
    version: int
    mode: Literal["complimentary", "sandbox"]


class DigestChoiceRead(BaseModel):
    id: UUID
    topic: str


class FreeDigestChoiceRead(DigestChoiceRead):
    schedule_paused: bool


class ActiveDigestsRead(BaseModel):
    available: bool
    items: list[DigestChoiceRead]
    selected_ids: list[UUID]
    limit: int


class FreeDigestsRead(BaseModel):
    plan_name: str = ""
    available: bool
    effective: bool
    limit: int
    selected_ids: list[UUID]
    items: list[FreeDigestChoiceRead]


class ChangeOptionRead(EntitlementsRead):
    code: str
    revision: int
    name: str
    interval: str
    price: str
    currency: str


class ChangeRead(BaseModel):
    id: UUID
    state: str
    plan_name: str
    interval: str
    price: str
    currency: str
    effective_at: Timestamp
    error: str | None
    undo_allowed: bool
    retry_allowed: bool


class ChangeOptionsRead(BaseModel):
    items: list[ChangeOptionRead]
    change: ChangeRead | None
    digests: list[DigestChoiceRead]
    effective_at: Timestamp | None = None
    reason: str


class NotificationRead(BaseModel):
    id: str
    subject: str
    text: str
    email_status: str
    created_at: Timestamp


class NotificationsRead(BaseModel):
    items: list[NotificationRead]


class UpgradeOptionRead(BaseModel):
    code: str
    revision: int
    name: str
    interval: str
    currency: str
    price: str


class UpgradeRead(BaseModel):
    id: UUID
    state: str
    plan_name: str
    interval: str
    recurring_price: str
    currency: str
    amount_due: int
    credit: int
    charge: int
    proration_at: Timestamp
    period_end: Timestamp
    expires_at: Timestamp
    pending_until: Timestamp | None
    error: str | None
    confirm_allowed: bool
    retry_allowed: bool
    payment_allowed: bool
    limits: EntitlementsRead


class UpgradeOptionsRead(BaseModel):
    items: list[UpgradeOptionRead]
    upgrade: UpgradeRead | None
    reason: str
