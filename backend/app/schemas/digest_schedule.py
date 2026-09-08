from datetime import datetime, timezone
from typing import Literal
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.digest import DigestFrequency


class DigestSchedule(BaseModel):
    """Saved preferences only. No scheduler or execution state is created."""

    model_config = ConfigDict(extra="forbid")

    frequency: DigestFrequency
    send_email: bool = True
    starts_at: AwareDatetime
    ends_at: AwareDatetime | None = None
    time_zone: str = Field(min_length=1, max_length=100)

    @field_validator("time_zone")
    @classmethod
    def valid_time_zone(cls, value: str) -> str:
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise ValueError("Choose a valid IANA time zone") from exc
        return value

    @field_validator("starts_at", "ends_at")
    @classmethod
    def normalize_datetime(cls, value):
        return value.astimezone(timezone.utc) if value is not None else None

    @model_validator(mode="after")
    def ordered_dates(self) -> "DigestSchedule":
        if self.ends_at is not None and self.ends_at <= self.starts_at:
            raise ValueError("Schedule end must be after the first digest date and time")
        return self


class SchedulePreviewRead(BaseModel):
    state: Literal["not_scheduled", "scheduled", "due", "waiting_for_run", "waiting_for_allowance", "queued", "running", "ended"]
    as_of: datetime
    next_scheduled_at: datetime | None = None
    upcoming_runs: list[datetime] = Field(default_factory=list)
    time_zone: str | None = None
    send_email: bool = False
    active_run_id: UUID | None = None
    waiting_digest_id: UUID | None = None
    allowance_available_at: datetime | None = None
    exhausted: bool = False
