"""Interval-independent tier policy for reviewed changes at paid renewal.

No provider calls, catalogue ordering, or authorization lives here. Callers must
still validate publication, mapping, selected price, ownership and paid coverage.
"""

from typing import TYPE_CHECKING

from app.services.billing_types import PlanEntitlements

if TYPE_CHECKING:
    from app.models.subscription_plan import SubscriptionPlanRevision


def is_renewal_upgrade(
    *, source: "SubscriptionPlanRevision", target: "SubscriptionPlanRevision"
) -> bool:
    """A different paid tier must add benefits without removing any.

    Billing interval and its discount are independent of tier: a higher yearly
    plan may have a lower monthly equivalent. A price increase alone is not an
    upgrade, and same-tier interval changes retain the purchased revision.
    """
    before, after = source.configuration, target.configuration
    if (
        source.code == target.code
        or before.get("billing_type", "stripe") != "stripe"
        or after.get("billing_type", "stripe") != "stripe"
        or before["currency"] != after["currency"]
    ):
        return False
    return PlanEntitlements.from_configuration(after).improves(
        other=PlanEntitlements.from_configuration(before)
    )
