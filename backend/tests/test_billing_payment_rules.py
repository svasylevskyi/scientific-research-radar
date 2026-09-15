"""Payment invariants at the typed boundary, without provider calls or a database."""

from copy import deepcopy
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest

from app.models.stripe_sandbox import SandboxCheckout
from app.models.subscription_upgrade import SubscriptionUpgrade
from app.services.billing_payment_rules import snapshot, validate_upgrade_invoice
from app.services.billing_provider import Error
from app.services.billing_types import PlanEntitlements


@pytest.fixture
def payment_evidence():
    start = datetime(2026, 9, 15, tzinfo=timezone.utc)
    end = start + timedelta(days=10)
    checkout = SandboxCheckout(
        id=uuid4(), customer_id="cus_owner", subscription_id="sub_owner"
    )
    upgrade = SubscriptionUpgrade(
        source_price_id="price_old",
        target_price_id="price_new",
        item_id="si_owner",
        proration_at=start,
        period_end=end,
        quote={"currency": "eur"},
    )

    def line(price, amount):
        return {
            "price": price,
            "amount": amount,
            "quantity": 1,
            "proration": True,
            "subscription": "sub_owner",
            "subscription_item": "si_owner",
            "currency": "eur",
            "period": {"start": int(start.timestamp()), "end": int(end.timestamp())},
        }

    invoice = {
        "object": "invoice",
        "livemode": False,
        "customer": "cus_owner",
        "subscription": "sub_owner",
        "currency": "eur",
        "collection_method": "charge_automatically",
        "billing_reason": "subscription_update",
        "total": 200,
        "amount_due": 200,
        "lines": {
            "has_more": False,
            "data": [line("price_old", -100), line("price_new", 300)],
        },
    }
    return checkout, upgrade, invoice


def test_typed_invoice_retains_exact_quote_shape_and_order_independence(
    payment_evidence,
):
    checkout, upgrade, invoice = payment_evidence
    verified = validate_upgrade_invoice(
        invoice=invoice, checkout=checkout, upgrade=upgrade
    )
    expected = {
        "currency": "eur",
        "total": 200,
        "amount_due": 200,
        "lines": [
            {
                "price": "price_new",
                "amount": 300,
                "start": int(upgrade.proration_at.timestamp()),
                "end": int(upgrade.period_end.timestamp()),
            },
            {
                "price": "price_old",
                "amount": -100,
                "start": int(upgrade.proration_at.timestamp()),
                "end": int(upgrade.period_end.timestamp()),
            },
        ],
    }
    assert verified.to_record() == expected
    invoice["lines"]["data"].reverse()
    assert snapshot(invoice=invoice, checkout=checkout, upgrade=upgrade) == expected


@pytest.mark.parametrize(
    "field",
    [
        "discounts",
        "total_discount_amounts",
        "default_tax_rates",
        "starting_balance",
        "ending_balance",
        "amount_shipping",
        "paid_out_of_band",
        "amount_paid_off_stripe",
        "post_payment_credit_notes_amount",
        "pre_payment_credit_notes_amount",
        "amount_overpaid",
    ],
)
def test_invoice_adjustments_still_require_review(payment_evidence, field):
    checkout, upgrade, invoice = payment_evidence
    invoice[field] = 1
    with pytest.raises(Error, match="adjustments require review"):
        snapshot(invoice=invoice, checkout=checkout, upgrade=upgrade)


@pytest.mark.parametrize("amount", [True, 300.0, "300"])
def test_no_monetary_coercion_at_the_typed_boundary(payment_evidence, amount):
    checkout, upgrade, invoice = payment_evidence
    invoice["lines"]["data"][1]["amount"] = amount
    with pytest.raises(Error, match="line ownership, quantity, or proration"):
        snapshot(invoice=invoice, checkout=checkout, upgrade=upgrade)


def test_zero_credit_is_supported_but_period_and_total_must_match(payment_evidence):
    checkout, upgrade, invoice = payment_evidence
    invoice["lines"]["data"][0]["amount"] = 0
    invoice.update(total=300, amount_due=300)
    assert snapshot(invoice=invoice, checkout=checkout, upgrade=upgrade)["total"] == 300
    wrong_period = deepcopy(invoice)
    wrong_period["lines"]["data"][0]["period"]["end"] += 1
    with pytest.raises(Error, match="proration dates"):
        snapshot(invoice=wrong_period, checkout=checkout, upgrade=upgrade)
    invoice["total"] += 1
    with pytest.raises(Error, match="total must match"):
        snapshot(invoice=invoice, checkout=checkout, upgrade=upgrade)


def test_preview_only_relaxes_billing_reason(payment_evidence):
    checkout, upgrade, invoice = payment_evidence
    invoice.pop("billing_reason")
    snapshot(invoice=invoice, checkout=checkout, upgrade=upgrade, preview=True)
    with pytest.raises(Error, match="subscription update"):
        snapshot(invoice=invoice, checkout=checkout, upgrade=upgrade)
    invoice["customer"] = "cus_someone_else"
    with pytest.raises(Error, match="ownership"):
        snapshot(invoice=invoice, checkout=checkout, upgrade=upgrade, preview=True)


def test_incomplete_or_duplicate_invoice_lines_cannot_become_a_quote(payment_evidence):
    checkout, upgrade, invoice = payment_evidence
    invoice["lines"]["has_more"] = True
    with pytest.raises(Error, match="exactly the complete"):
        snapshot(invoice=invoice, checkout=checkout, upgrade=upgrade)
    invoice["lines"]["has_more"] = False
    invoice["lines"]["data"][1]["price"] = "price_old"
    with pytest.raises(Error, match="credit the saved source price"):
        snapshot(invoice=invoice, checkout=checkout, upgrade=upgrade)


@pytest.mark.parametrize(
    "changed",
    [
        "max_digests",
        "max_papers_per_run",
        "papers_per_month",
        "runs_per_month",
        "manual_runs_per_month",
        "schedule_frequencies",
        "email_delivery",
    ],
)
def test_upgrade_cannot_trade_away_any_entitlement(changed):
    base = dict(
        max_digests=3,
        max_papers_per_run=20,
        papers_per_month=100,
        runs_per_month=10,
        manual_runs_per_month=5,
        schedule_frequencies=["weekly", "monthly"],
        email_delivery=True,
    )
    improved = {**base, "papers_per_month": 200}
    improved[changed] = (
        []
        if changed == "schedule_frequencies"
        else False
        if changed == "email_delivery"
        else base[changed] - 1
    )
    assert not PlanEntitlements.from_configuration(improved).includes(
        other=PlanEntitlements.from_configuration(base)
    )


def test_equal_benefits_are_not_an_upgrade_but_added_capabilities_are():
    base = dict(
        max_digests=1,
        max_papers_per_run=10,
        papers_per_month=10,
        runs_per_month=1,
        manual_runs_per_month=1,
        schedule_frequencies=[],
        email_delivery=False,
    )
    entitlements = PlanEntitlements.from_configuration(base)
    assert not entitlements.improves(other=entitlements)
    assert PlanEntitlements.from_configuration(
        {**base, "email_delivery": True}
    ).improves(other=entitlements)
    assert PlanEntitlements.from_configuration(
        {**base, "schedule_frequencies": ["monthly"]}
    ).improves(other=entitlements)
