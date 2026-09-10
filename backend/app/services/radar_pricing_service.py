from sqlalchemy import select
from app.models.radar_price import RadarPrice
from app.schemas.radar_pricing import RadarPriceCreate


def current_price(db, model_name, *, as_of=None):
    # IDs provide a deterministic publication order, including concurrent saves.
    statement = select(RadarPrice).where(RadarPrice.model_name == model_name)
    if as_of is not None:
        statement = statement.where(RadarPrice.created_at <= as_of)
    row = db.scalar(statement.order_by(RadarPrice.id.desc()).limit(1))
    return dict(row.pricing) if row else None


def publish_price(db, payload: RadarPriceCreate, actor_id=None):
    row = RadarPrice(model_name=payload.model_name, version=payload.version,
                     pricing=payload.model_dump(mode="json", exclude={"model_name"}),
                     created_by=actor_id)
    db.add(row)
    db.flush()
    return row


def serialize_price(row):
    return {"id": row.id, "model_name": row.model_name, **row.pricing,
            "created_at": row.created_at, "created_by": row.created_by}
