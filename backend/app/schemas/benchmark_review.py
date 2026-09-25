"""Browser review contracts reuse the offline benchmark and label formats."""

from datetime import datetime, timezone
from typing import Literal, Self
from uuid import UUID

from pydantic import Field, StrictBool, field_validator, model_validator

from app.evaluation.models import Benchmark, Case, Contract, Criteria, Reviews, Source, Text, Verdict

ReviewState = Literal["pending", "draft", "approved", "excluded", "disputed"]


class BenchmarkReviewWrite(Contract):
    expected_version: int = Field(ge=0)
    state: Literal["draft", "approved", "excluded", "disputed"]
    verdict: Verdict | None = None
    evidence_passage_ids: list[str] = Field(default_factory=list, max_length=50)
    rationale: str = Field(default="", max_length=5000)
    human_reviewed: StrictBool = False
    permissions_checked: StrictBool = False
    resolve_dispute: StrictBool = False


class BenchmarkReviewRead(Contract):
    version: int
    state: ReviewState
    verdict: Verdict | None
    evidence_passage_ids: list[str]
    rationale: str
    human_reviewed: bool
    permissions_checked: bool
    reviewer_id: UUID | None
    reviewer_name: str
    reviewed_at: datetime
    imported: bool = False

    @field_validator("reviewed_at")
    @classmethod
    def utc_time(cls, value: datetime) -> datetime:
        return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


class BenchmarkCaseSummary(Contract):
    id: str
    split: str
    scope: str
    claim: str
    state: ReviewState
    version: int


class BenchmarkCaseRead(Contract):
    case: Case
    sources: list[Source]
    review: BenchmarkReviewRead | None
    history: list[BenchmarkReviewRead]
    history_total: int


class BenchmarkSummary(Contract):
    id: UUID
    name: str
    version: str
    fingerprint: str
    revision: int
    total: int
    counts: dict[str, int]
    latest_publication: int | None
    unpublished_changes: bool


class BenchmarkDetail(Contract):
    summary: BenchmarkSummary
    description: str
    criteria: Criteria
    cases: list[BenchmarkCaseSummary]


class BenchmarkCriteriaWrite(Contract):
    expected_revision: int = Field(ge=0)
    status: Literal["draft", "approved"]
    reason: Text = Field(max_length=2000)
    minimum_reviewed_cases: int = Field(ge=1, le=10000)
    minimum_source_families: int = Field(ge=1, le=500)
    minimum_prediction_coverage: float = Field(ge=0, le=1)
    minimum_accuracy: float = Field(ge=0, le=1)
    maximum_false_acceptance_rate: float = Field(ge=0, le=1)
    maximum_regressions: int = Field(ge=0, le=10000)


class BenchmarkPublishWrite(Contract):
    expected_revision: int = Field(ge=0)
    reason: Text = Field(max_length=2000)


class BenchmarkPublicationRead(Contract):
    number: int
    source_revision: int
    fingerprint: str
    reason: str
    created_by_name: str
    created_at: datetime

    @field_validator("created_at")
    @classmethod
    def utc_time(cls, value: datetime) -> datetime:
        return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


class BenchmarkCriteriaRead(Contract):
    revision: int
    criteria: Criteria
    created_by_name: str
    created_at: datetime

    @field_validator("created_at")
    @classmethod
    def utc_time(cls, value: datetime) -> datetime:
        return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


class BenchmarkAuditRead(Contract):
    publications: list[BenchmarkPublicationRead]
    criteria: list[BenchmarkCriteriaRead]


class BenchmarkImportWrite(Contract):
    benchmark: Benchmark
    permissions_checked: StrictBool

    @model_validator(mode="after")
    def bounded_import(self) -> Self:
        if not self.permissions_checked:
            raise ValueError("Confirm source permissions before importing benchmark content")
        if len(self.benchmark.cases) > 500 or len(self.benchmark.model_dump_json().encode()) > 2 * 1024 * 1024:
            raise ValueError("Browser benchmarks are limited to 500 cases and 2 MiB")
        return self


class BenchmarkReviewImportWrite(Contract):
    expected_revision: int = Field(ge=0)
    reviews: Reviews


class BenchmarkExport(Contract):
    benchmark: Benchmark
    reviews: Reviews
    criteria: Criteria
    publication: BenchmarkPublicationRead | None
