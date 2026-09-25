"""Super-admin limits for optional manual AI observations."""
from decimal import Decimal
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field


class ClaimReviewConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    mode: Literal["off", "observe"] = "off"
    model: str = Field(default="gpt-6-astra", min_length=1, max_length=100, pattern=r"^[a-zA-Z0-9_.:-]+$")
    max_claims: int = Field(default=40, ge=1, le=100)
    max_output_tokens: int = Field(default=1500, ge=500, le=4000)
    max_review_usd: Decimal = Field(default=Decimal("1"), gt=0, le=20, decimal_places=6)
    daily_budget_usd: Decimal = Field(default=Decimal("5"), gt=0, le=100, decimal_places=6)
    daily_call_limit: int = Field(default=100, ge=1, le=500)
