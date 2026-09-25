"""Permission evidence and immutable excerpts used by one research run."""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class SourcePassage(BaseModel):
    id: str
    section: str
    text: str


class SourceDocument(BaseModel):
    external_id: str
    title: str
    authors: list[str] = Field(default_factory=list)
    status: Literal["available", "unavailable", "rights_unconfirmed"]
    basis: Literal["abstract_only", "extracted_sections", "metadata_only"] = "metadata_only"
    source_url: str | None = None
    request_url: str | None = None
    retrieved_at: datetime
    source_version: str | None = None
    content_sha256: str | None = None
    license_url: str | None = None
    permission_source: str | None = None
    rights_notice: str | None = None
    policy_version: str = "1"
    cached: bool = False
    passages: list[SourcePassage] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


class EvidenceStatement(BaseModel):
    text: str
    passage_ids: list[str]
    references_valid: bool


class PaperContentRead(BaseModel):
    document: SourceDocument
    statements: list[EvidenceStatement]
    warnings: list[str]


class RunContentRead(BaseModel):
    items: list[PaperContentRead]
    legacy: bool
