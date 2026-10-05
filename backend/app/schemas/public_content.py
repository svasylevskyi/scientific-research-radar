"""Public-site content edited from administration without redeployment."""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

PublicContentSlug = Literal["about", "privacy", "terms"]


class PublicContentRead(BaseModel):
    slug: PublicContentSlug
    revision: int = Field(ge=1)
    title: str
    body_markdown: str
    change_note: str
    created_by_name: str
    created_at: datetime


class PublicContentUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expected_revision: int = Field(ge=0)
    title: str = Field(min_length=1, max_length=160)
    body_markdown: str = Field(min_length=1, max_length=60000)
    change_note: str = Field(min_length=1, max_length=500)

    @field_validator("title", "body_markdown", "change_note")
    @classmethod
    def trim_non_empty(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Value must not be blank.")
        return value


class PublicContentHistory(BaseModel):
    items: list[PublicContentRead]
    total: int
    offset: int
    limit: int
