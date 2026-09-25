"""Manual AI observations: no delivery decisions or human approvals."""
from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.evaluation.models import Candidate, Prediction, Split


from app.schemas.claim_review_config import ClaimReviewConfig


class ClaimReviewStart(BaseModel):
    model_config = ConfigDict(extra="forbid")
    request_id: UUID
    expected_settings_version: int = Field(ge=0)
    digest_id: UUID | None = None
    run_id: UUID | None = None
    benchmark_id: UUID | None = None
    publication: int | None = Field(default=None, ge=1)
    split: Split = "development"

    @model_validator(mode="after")
    def target(self) -> "ClaimReviewStart":
        run = self.digest_id is not None and self.run_id is not None and self.benchmark_id is None and self.publication is None
        benchmark = self.benchmark_id is not None and self.publication is not None and self.digest_id is None and self.run_id is None
        if not (run or benchmark):
            raise ValueError("Choose one completed run or one published benchmark revision.")
        return self


class ReviewerVerdict(BaseModel):
    model_config = ConfigDict(extra="forbid")
    verdict: Prediction
    evidence_passage_ids: list[str]
    rationale: str


class ClaimReviewCaseRead(BaseModel):
    case_id: str
    scope: str
    claim: str
    paper_id: str | None = None
    verdict: Prediction | None = None
    evidence_passage_ids: list[str] = Field(default_factory=list)
    rationale: str | None = None
    status: str
    estimated_usd: str | None = None
    latency_seconds: float | None = None
    # Attribution and only permission-checked excerpts actually sent to the model.
    sources: list[dict[str, Any]] = Field(default_factory=list)


class ClaimReviewRead(BaseModel):
    id: UUID
    kind: Literal["run", "benchmark"]
    status: str
    created_at: datetime
    finished_at: datetime | None
    created_by_name: str
    settings_version: int
    model: str
    prompt_version: str
    input_sha256: str
    total_claims: int
    selected_claims: int
    completed_claims: int
    reserved_usd: str
    known_estimated_usd: str
    unknown_requests: int
    error: str | None
    cases: list[ClaimReviewCaseRead]
    report: dict[str, Any] | None
    publication: int | None
    split: Split | None


class ClaimReviewHistory(BaseModel):
    items: list[ClaimReviewRead]
    total: int
    offset: int
    limit: int


class ClaimReviewExport(BaseModel):
    review: ClaimReviewRead
    candidate: Candidate | None
