from datetime import date, datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.digest_run import (
    DigestRunStageStatus,
    DigestRunStageType,
    DigestRunStatus,
    DigestRunTrigger,
)


class PaperRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    source_name: str
    external_id: str
    title: str
    authors: list[str]
    abstract: str | None
    published_date: date | None
    url: str
    doi: str | None


class DigestRunPaperRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    rank: int
    relevance_score: float
    search_data: dict[str, Any]
    relevance_data: dict[str, Any]
    summary_data: dict[str, Any] | None
    paper: PaperRead


class DigestRunStageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    stage: DigestRunStageType
    position: int
    status: DigestRunStageStatus
    progress_current: int
    progress_total: int
    result_data: dict[str, Any] | None
    error_message: str | None
    response_ids: list[str]
    usage_data: dict[str, int]
    model_name: str
    prompt_version: str
    started_at: datetime | None
    completed_at: datetime | None


class DigestRunTrendAnalysisRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    overview: str
    data: dict[str, Any]


class DigestRunBriefingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    title: str
    executive_summary: str
    content_markdown: str
    data: dict[str, Any]


class DigestRunSummaryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    digest_id: UUID
    owner_id: UUID
    status: DigestRunStatus
    current_stage: DigestRunStageType | None
    trigger: DigestRunTrigger
    model_name: str
    prompt_version: str
    paper_count: int
    request_count: int
    has_feedback: bool
    error_message: str | None
    started_at: datetime
    completed_at: datetime | None
    created_at: datetime


class DigestEmailDeliveryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    status: str
    attempts: int
    sent_at: datetime | None
    last_error: str | None


class DigestRunDetailRead(DigestRunSummaryRead):
    email_delivery: DigestEmailDeliveryRead | None = None
    scheduled_for: datetime | None = None
    digest_snapshot: dict[str, Any]
    history_context: list[dict[str, Any]]
    feedback_context: list[dict[str, Any]]
    stages: list[DigestRunStageRead]
    search_data: dict[str, Any] | None
    relevance_data: dict[str, Any] | None
    openai_response_id: str | None
    paper_results: list[DigestRunPaperRead]
    trend_analysis: DigestRunTrendAnalysisRead | None
    briefing: DigestRunBriefingRead | None
    feedback_text: str | None
    feedback_created_at: datetime | None
    feedback_updated_at: datetime | None


class DigestRunFeedbackUpdate(BaseModel):
    feedback_text: str = Field(min_length=1, max_length=4000)

    @field_validator("feedback_text")
    @classmethod
    def normalize_feedback(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Feedback cannot be empty")
        return normalized


class DigestRunListResponse(BaseModel):
    items: list[DigestRunSummaryRead]
    total: int
    offset: int
    limit: int
