"""One-time explicit import of legacy RADAR_PRICING; never overwrites DB models."""
import os
from dotenv import dotenv_values
from pydantic import TypeAdapter
from app.schemas.radar_pricing import RadarPricing, RadarPriceCreate
from app.services.radar_pricing_service import current_price, publish_price


def import_prices(db, raw):
    values = TypeAdapter(dict[str, RadarPricing]).validate_json(raw)
    count = 0
    for model, price in values.items():
        if current_price(db, model) is None:
            publish_price(db, RadarPriceCreate(model_name=model, **price.model_dump()))
            count += 1
    return count


if __name__ == "__main__":
    from app.db.session import SessionLocal
    raw = os.environ.get("RADAR_PRICING") or dotenv_values(".env").get("RADAR_PRICING")
    if not raw:
        raise SystemExit("No RADAR_PRICING found. Use the super-admin Pricing page instead.")
    with SessionLocal() as db, db.begin():
        count = import_prices(db, raw)
    print(f"Imported pricing for {count} models. Existing database prices were preserved.")
