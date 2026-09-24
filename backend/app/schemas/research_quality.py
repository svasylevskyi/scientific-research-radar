"""Versioned deterministic quality settings and public run decisions."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

QualityMode = Literal["off", "observe", "enforce"]
QualityStatus = Literal["not_evaluated", "pass", "warning", "hold"]


class QualityConfig(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    mode: QualityMode = "observe"
    check_reporting_dates: bool = True
    check_duplicates: bool = True
    check_source_access: bool = True
    sparse_paper_threshold: int = Field(default=3, ge=0, le=30)


class QualitySettingsUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expected_version: int = Field(ge=0)
    config: QualityConfig
    change_reason: str = Field(min_length=1, max_length=500)

    @field_validator("change_reason")
    @classmethod
    def meaningful_reason(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Explain why these settings are changing.")
        return value.strip()


class QualitySettingsRead(BaseModel):
    version: int
    config: QualityConfig
    created_at: datetime | None
    created_by_name: str | None
    change_reason: str


class QualitySettingsHistory(BaseModel):
    items: list[QualitySettingsRead]
    total: int
    offset: int
    limit: int


class QualitySnapshot(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: int
    engine_version: str
    config: QualityConfig


class QualityFinding(BaseModel):
    code: str
    severity: Literal["warning", "hold"]
    message: str
    paper_ids: list[str] = Field(default_factory=list)


class QualityDecision(BaseModel):
    status: QualityStatus
    findings: list[QualityFinding] = Field(default_factory=list)
