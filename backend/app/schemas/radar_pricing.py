from decimal import Decimal
from pydantic import BaseModel, ConfigDict, Field


class RadarPricing(BaseModel):
    """Explicit flat standard-tier rates; unsupported tariffs remain unpriced."""
    model_config = ConfigDict(extra="forbid")
    version: str = Field(min_length=1, max_length=100)
    input_per_million: Decimal = Field(ge=0, allow_inf_nan=False)
    cached_input_per_million: Decimal = Field(ge=0, allow_inf_nan=False)
    output_per_million: Decimal = Field(ge=0, allow_inf_nan=False)
    web_search_per_call: Decimal = Field(ge=0, allow_inf_nan=False)
    max_input_tokens: int = Field(gt=0)
