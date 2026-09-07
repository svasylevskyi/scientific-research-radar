from datetime import timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.digest import DigestFrequency


class DigestSchedule(BaseModel):
    """Saved preferences only. No scheduler or execution state is created."""

    model_config = ConfigDict(extra="forbid")

    frequency: DigestFrequency
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
