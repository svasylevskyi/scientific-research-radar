"""Catalogue comparisons and permanent Stripe product ownership."""
from decimal import Decimal
from sqlalchemy import select, func
from fastapi import HTTPException
from app.models.subscription_plan import SubscriptionPlanRevision, StripeProductClaim


def product_owners(db):
    owners = {}
    # Include every immutable revision, even archived tiers and replaced mappings.
    for code, config in db.execute(select(SubscriptionPlanRevision.code, SubscriptionPlanRevision.configuration)):
        product = (config.get('stripe_sandbox') or {}).get('product_id')
        if product:
            owners.setdefault(product, set()).add(code)
    for claim in db.scalars(select(StripeProductClaim)):
        owners.setdefault(claim.product_id, set()).add(claim.plan_code)
    return owners


def claim_product(db, code, product_id):
    others = product_owners(db).get(product_id, set()) - {code}
    if others:
        raise HTTPException(409, 'This Stripe product is already mapped to another Radar tier: ' + ', '.join(sorted(others)) + '.')
    claim = db.get(StripeProductClaim, product_id)
    if claim is None:
        db.add(StripeProductClaim(product_id=product_id, plan_code=code))
        db.flush()  # Unique PK arbitrates concurrent saves for different tier codes.


def price_warnings(db, code, config):
    if config.state == 'archived':
        return []
    latest = select(SubscriptionPlanRevision.code, func.max(SubscriptionPlanRevision.revision).label('revision')).group_by(SubscriptionPlanRevision.code).subquery()
    rows = db.scalars(select(SubscriptionPlanRevision).join(latest,
        (SubscriptionPlanRevision.code == latest.c.code) & (SubscriptionPlanRevision.revision == latest.c.revision)))
    warnings = []
    for row in rows:
        other = row.configuration
        if row.code == code or other.get('state') == 'archived' or other.get('currency', 'EUR') != config.currency:
            continue
        for field, label in [('monthly_price', 'Monthly'), ('annual_price', 'Annual')]:
            amount, value = getattr(config, field), other.get(field)
            if amount is None or value is None:
                continue
            price = Decimal(str(value))
            # Equal zero prices count; positive prices are similar within 10% of the higher amount.
            if abs(amount - price) <= max(amount, price) * Decimal('0.10'):
                kind = 'equals' if amount == price else 'is within 10% of'
                warnings.append(f"{label} price {config.currency} {amount:.2f} {kind} {other['name']} ({row.code}): {config.currency} {price:.2f}. Review the price and allowance differences.")
    return warnings
