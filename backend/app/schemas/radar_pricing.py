from decimal import Decimal
from pydantic import BaseModel, ConfigDict, Field


class RadarPricing(BaseModel):
    """Explicit flat standard-tier rates; unsupported tariffs remain unpriced."""
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    version: str = Field(min_length=1, max_length=100)
    input_per_million: Decimal = Field(ge=0, allow_inf_nan=False)
    cached_input_per_million: Decimal = Field(ge=0, allow_inf_nan=False)
    output_per_million: Decimal = Field(ge=0, allow_inf_nan=False)
    web_search_per_call: Decimal = Field(ge=0, allow_inf_nan=False)
    max_input_tokens: int = Field(gt=0, le=2147483647)


class RadarPriceCreate(RadarPricing):
    model_name: str = Field(min_length=1, max_length=100, pattern=r"^[A-Za-z0-9][A-Za-z0-9._:/-]*$")
