from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.digest import DigestFrequency, TargetAudience

MAX_KEYWORDS = 20
MAX_KEYWORD_LENGTH = 48


def _normalize_topic(value: str) -> str:
    normalized = " ".join(value.split())
    if not normalized:
        raise ValueError("Digest topic is required")
    return normalized


def _normalize_description(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None


def _normalize_keywords(values: list[str] | None) -> list[str] | None:
    if values is None:
        return None

    normalized: list[str] = []
    seen: set[str] = set()
    for value in values:
        keyword = value.strip()
        if not keyword:
            raise ValueError("Keywords cannot be empty")
        if len(keyword) > MAX_KEYWORD_LENGTH:
            raise ValueError(
                f"Each keyword must contain at most {MAX_KEYWORD_LENGTH} characters"
            )
        lookup = keyword.casefold()
        if lookup not in seen:
            seen.add(lookup)
            normalized.append(keyword)
    return normalized


def _deduplicate_audiences(
    values: list[TargetAudience] | None,
) -> list[TargetAudience] | None:
    if values is None:
        return None
    return list(dict.fromkeys(values))


class DigestCreate(BaseModel):
    topic: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=300)
    include_keywords: list[str] = Field(default_factory=list, max_length=MAX_KEYWORDS)
    exclude_keywords: list[str] = Field(default_factory=list, max_length=MAX_KEYWORDS)
    target_audience: list[TargetAudience] = Field(min_length=1, max_length=5)
    reporting_from: date
    reporting_to: date
    frequency: DigestFrequency = DigestFrequency.WEEKLY
    maximum_papers: int = Field(default=20, ge=1, le=30)

    @field_validator("topic")
    @classmethod
    def normalize_topic(cls, value: str) -> str:
        return _normalize_topic(value)

    @field_validator("description")
    @classmethod
    def normalize_description(cls, value: str | None) -> str | None:
        return _normalize_description(value)

    @field_validator("include_keywords", "exclude_keywords")
    @classmethod
    def normalize_keywords(cls, values: list[str]) -> list[str]:
        return _normalize_keywords(values) or []

    @field_validator("target_audience")
    @classmethod
    def deduplicate_audiences(
        cls, values: list[TargetAudience]
    ) -> list[TargetAudience]:
        return _deduplicate_audiences(values) or []

    @model_validator(mode="after")
    def validate_reporting_period(self) -> "DigestCreate":
        if self.reporting_from > self.reporting_to:
            raise ValueError("Reporting end date must be on or after the start date")
        if self.reporting_to > date.today():
            raise ValueError("Reporting end date cannot be in the future")
        return self


class DigestUpdate(BaseModel):
    topic: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=300)
    include_keywords: list[str] | None = Field(default=None, max_length=MAX_KEYWORDS)
    exclude_keywords: list[str] | None = Field(default=None, max_length=MAX_KEYWORDS)
    target_audience: list[TargetAudience] | None = Field(
        default=None, min_length=1, max_length=5
    )
    reporting_from: date | None = None
    reporting_to: date | None = None
    frequency: DigestFrequency | None = None
    maximum_papers: int | None = Field(default=None, ge=1, le=30)

    @field_validator("topic")
    @classmethod
    def normalize_topic(cls, value: str | None) -> str | None:
        return _normalize_topic(value) if value is not None else None

    @field_validator("description")
    @classmethod
    def normalize_description(cls, value: str | None) -> str | None:
        return _normalize_description(value)

    @field_validator("include_keywords", "exclude_keywords")
    @classmethod
    def normalize_keywords(cls, values: list[str] | None) -> list[str] | None:
        return _normalize_keywords(values)

    @field_validator("target_audience")
    @classmethod
    def deduplicate_audiences(
        cls, values: list[TargetAudience] | None
    ) -> list[TargetAudience] | None:
        return _deduplicate_audiences(values)

    @model_validator(mode="after")
    def require_valid_change(self) -> "DigestUpdate":
        if not self.model_fields_set:
            raise ValueError("At least one digest field is required")
        nullable_fields = {"description"}
        for field_name in self.model_fields_set - nullable_fields:
            if getattr(self, field_name) is None:
                raise ValueError(f"{field_name.replace('_', ' ').capitalize()} cannot be null")
        return self


class DigestRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    owner_id: UUID
    topic: str
    description: str | None
    include_keywords: list[str]
    exclude_keywords: list[str]
    target_audience: list[TargetAudience]
    reporting_from: date
    reporting_to: date
    frequency: DigestFrequency
    maximum_papers: int
    created_at: datetime
    updated_at: datetime


class DigestListResponse(BaseModel):
    items: list[DigestRead]
    total: int
    offset: int
    limit: int


class DigestOwnerRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    full_name: str
    email: str


class AdminDigestRead(DigestRead):
    owner: DigestOwnerRead


class AdminDigestListResponse(BaseModel):
    items: list[AdminDigestRead]
    total: int
    offset: int
    limit: int
