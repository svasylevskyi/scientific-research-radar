from decimal import Decimal
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator


class StripeSandboxMapping(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    product_id: str = Field(pattern=r"^prod_[A-Za-z0-9]+$", max_length=255)
    monthly_price_id: str = Field(pattern=r"^price_[A-Za-z0-9]+$", max_length=255)
    annual_price_id: str | None = Field(default=None, pattern=r"^price_[A-Za-z0-9]+$", max_length=255)


class SubscriptionPlanConfiguration(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=100)
    description: str = Field(default="", max_length=1000)
    state: Literal["draft", "reviewed", "archived"] = "draft"
    currency: Literal["EUR", "USD", "GBP", "PLN"] = "EUR"
    monthly_price: Decimal = Field(ge=0, le=1000000, decimal_places=2, allow_inf_nan=False)
    annual_price: Decimal | None = Field(default=None, ge=0, le=1000000, decimal_places=2, allow_inf_nan=False)
    tax_display: Literal["undecided", "inclusive", "exclusive"] = "undecided"
    max_digests: int = Field(ge=1, le=10000, strict=True)
    max_papers_per_run: int = Field(ge=1, le=30, strict=True)
    papers_per_month: int = Field(ge=1, le=1000000, strict=True)
    runs_per_month: int = Field(ge=0, le=100000, strict=True)
    manual_runs_per_month: int = Field(ge=0, le=100000, strict=True)
    schedule_frequencies: list[Literal["daily", "weekly", "monthly", "quarterly"]] = Field(default_factory=list, max_length=4)
    email_delivery: bool = True
    trial_days: int = Field(default=0, ge=0, le=365, strict=True)
    stripe_sandbox: StripeSandboxMapping | None = None
    subscriber_visible: bool = False
    display_order: int = Field(default=0, ge=0, le=10000, strict=True)

    @model_validator(mode="after")
    def consistent_allowances(self):
        if self.subscriber_visible and (self.state != "reviewed" or self.tax_display != "inclusive" or not self.stripe_sandbox or self.trial_days):
            raise ValueError("Subscriber plans must be reviewed, tax-inclusive, mapped to Stripe sandbox and have no trial")
        if self.manual_runs_per_month > self.runs_per_month:
            raise ValueError("Manual runs cannot exceed the total monthly run allowance")
        if self.max_papers_per_run > self.papers_per_month:
            raise ValueError("Papers per run cannot exceed the monthly paper allowance")
        if len(set(self.schedule_frequencies)) != len(self.schedule_frequencies):
            raise ValueError("Schedule frequencies must be unique")
        if self.stripe_sandbox:
            if (self.annual_price is None) != (self.stripe_sandbox.annual_price_id is None):
                raise ValueError("Annual Stripe price mapping must match whether the plan has an annual price")
            if self.stripe_sandbox.monthly_price_id == self.stripe_sandbox.annual_price_id:
                raise ValueError("Monthly and annual Stripe price IDs must differ")
        return self


class SubscriptionPlanSave(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    code: str = Field(pattern=r"^[a-z][a-z0-9-]{0,59}$")
    expected_revision: int = Field(ge=0, le=2147483646, strict=True)
    change_note: str = Field(min_length=1, max_length=500)
    configuration: SubscriptionPlanConfiguration
