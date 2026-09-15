"""Billing values independent of commands, persistence, and provider transport.

ProviderObject is deliberately untrusted JSON. Typed records describe our stored
shape; immutable values are constructed by the payment validation boundary.
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Mapping, TypedDict

ProviderObject = dict[str, Any]


class ProrationLineRecord(TypedDict):
    price: str
    amount: int
    start: int
    end: int


class UpgradeQuoteRecord(TypedDict):
    currency: str
    amount_due: int
    total: int
    lines: list[ProrationLineRecord]


class InvoiceReview(TypedDict):
    issue: str | None
    start: datetime
    end: datetime


@dataclass(frozen=True)
class ProrationLine:
    price_id: str
    amount: int
    period_start: int
    period_end: int

    def to_record(self) -> ProrationLineRecord:
        return {
            "price": self.price_id,
            "amount": self.amount,
            "start": self.period_start,
            "end": self.period_end,
        }


@dataclass(frozen=True)
class VerifiedUpgradeInvoice:
    currency: str
    amount_due: int
    total: int
    lines: tuple[ProrationLine, ...]

    def to_record(self) -> UpgradeQuoteRecord:
        """Retain the exact persisted quote keys and canonical price ordering."""
        return {
            "currency": self.currency,
            "amount_due": self.amount_due,
            "total": self.total,
            "lines": [
                line.to_record()
                for line in sorted(self.lines, key=lambda line: line.price_id)
            ],
        }


@dataclass(frozen=True)
class PriceBinding:
    effective_at: datetime
    source_price_id: str
    target_price_id: str


@dataclass(frozen=True)
class PlanEntitlements:
    max_digests: int
    max_papers_per_run: int
    papers_per_month: int
    runs_per_month: int
    manual_runs_per_month: int
    schedule_frequencies: frozenset[str]
    email_delivery: bool

    @classmethod
    def from_configuration(cls, configuration: Mapping[str, Any]) -> "PlanEntitlements":
        """Read an already validated saved plan; do not coerce its quota values."""
        return cls(
            max_digests=configuration["max_digests"],
            max_papers_per_run=configuration["max_papers_per_run"],
            papers_per_month=configuration["papers_per_month"],
            runs_per_month=configuration["runs_per_month"],
            manual_runs_per_month=configuration["manual_runs_per_month"],
            schedule_frequencies=frozenset(configuration["schedule_frequencies"]),
            email_delivery=configuration["email_delivery"],
        )

    def includes(self, *, other: "PlanEntitlements") -> bool:
        """Every quota and capability in the other plan must be retained."""
        return (
            self.max_digests >= other.max_digests
            and self.max_papers_per_run >= other.max_papers_per_run
            and self.papers_per_month >= other.papers_per_month
            and self.runs_per_month >= other.runs_per_month
            and self.manual_runs_per_month >= other.manual_runs_per_month
            and self.schedule_frequencies >= other.schedule_frequencies
            and (not other.email_delivery or self.email_delivery)
        )

    def improves(self, *, other: "PlanEntitlements") -> bool:
        return self.includes(other=other) and self != other
