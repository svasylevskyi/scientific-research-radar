from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class VerificationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    email: str
    sent_at: datetime
    code_expires_at: datetime
    expires_at: datetime


class VerificationCode(BaseModel):
    code: str = Field(min_length=6, max_length=6, pattern=r"^[0-9]{6}$")
