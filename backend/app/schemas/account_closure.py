from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ClosureRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    confirmation: Literal["CLOSE"]


class ClosureIssue(BaseModel):
    kind: str
    reference: str
    attempt_id: UUID | None = None


class ClosureRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    user_id: UUID
    state: Literal["pending", "waiting", "needs_review", "completed"]
    requested_at: datetime
    attempts: int
    next_attempt_at: datetime | None
    last_error: str | None
    billing_resolved_at: datetime | None
    data_removed_at: datetime | None
    completed_at: datetime | None
    billing_issues: list[ClosureIssue]
    notice_state: str
    acknowledgement_sent_at: datetime | None
    completion_sent_at: datetime | None


class CheckoutRecovery(BaseModel):
    attempt_id: UUID
    checkout_id: str = Field(pattern=r"^cs_(test|live)_[A-Za-z0-9_]{1,230}$")


class ContactClosureDecision(BaseModel):
    decision: Literal["delete", "unrelated"]
