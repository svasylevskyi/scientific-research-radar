"""Auditable metadata evidence, separate from full-text or claim verification."""
from datetime import datetime, timezone
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.schemas.research_quality import QualityFinding, QualitySnapshot


class SourceMetadata(BaseModel):
    identifier: str
    title: str = ""
    authors: list[str] = Field(default_factory=list)
    dates: list[str] = Field(default_factory=list)
    doi: str | None = None
    url: str | None = None
    abstract: str | None = None
    full_text_links: list[str] = Field(default_factory=list)
    updated: str | None = None


class MetadataLookup(BaseModel):
    provider: Literal["crossref", "arxiv"]
    identifier: str
    request_url: str
    retrieved_at: datetime
    metadata: SourceMetadata | None = None
    reason: str | None = None
    cached: bool = False

    @model_validator(mode="after")
    def discard_unlicensed_abstract(self):
        if self.provider == "crossref" and self.metadata and self.metadata.abstract:
            self.metadata = self.metadata.model_copy(update={"abstract": None})
        return self


class FieldComparison(BaseModel):
    field: str
    status: Literal["match", "conflict", "unverified"]
    message: str


class PaperVerification(BaseModel):
    external_id: str
    title: str
    claimed: SourceMetadata
    status: Literal["verified", "conflict", "unverified"]
    checks: list[FieldComparison] = Field(default_factory=list)
    evidence: MetadataLookup | None = None
    notes: list[str] = Field(default_factory=list)


class SourceVerificationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    run_id: UUID
    trigger: Literal["automatic", "manual"]
    created_by: UUID | None
    created_by_name: str
    created_at: datetime
    engine_version: str
    config: QualitySnapshot
    papers: list[PaperVerification]
    findings: list[QualityFinding]

    @field_validator("created_at")
    @classmethod
    def utc_timestamp(cls, value: datetime) -> datetime:
        return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


class SourceVerificationHistory(BaseModel):
    items: list[SourceVerificationRead]
    total: int
    offset: int
    limit: int
