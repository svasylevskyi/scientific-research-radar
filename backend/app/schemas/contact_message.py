from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class ContactMessageCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr = Field(max_length=320)
    message: str = Field(min_length=1, max_length=1000)

    @field_validator("name", "email", "message", mode="before")
    @classmethod
    def strip_whitespace(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value


class ContactMessageReceipt(BaseModel):
    message: str


class ContactMessageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    email: str
    message: str
    created_at: datetime
    reviewed_at: datetime | None


class ContactMessageList(BaseModel):
    items: list[ContactMessageRead]
    total: int
    offset: int
    limit: int


class ContactMessageReview(BaseModel):
    reviewed: bool
