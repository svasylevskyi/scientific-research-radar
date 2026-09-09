from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from app.api.dependencies import CurrentSuperAdmin, DbSession
from app.models.radar_price import RadarPrice
from app.schemas.radar_pricing import RadarPriceCreate
from app.services.radar_pricing_service import publish_price, serialize_price

router = APIRouter()


@router.get("")
def list_prices(actor: CurrentSuperAdmin, db: DbSession,
                offset: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=100)):
    rows = db.scalars(select(RadarPrice).order_by(RadarPrice.id.desc()).offset(offset).limit(limit))
    latest = dict(db.execute(select(RadarPrice.model_name, func.max(RadarPrice.id))
                            .group_by(RadarPrice.model_name)).all())
    return {"items": [{**serialize_price(row), "is_current": latest[row.model_name] == row.id} for row in rows],
            "total": db.scalar(select(func.count()).select_from(RadarPrice)), "offset": offset, "limit": limit}


@router.post("", status_code=201)
def create_price(payload: RadarPriceCreate, actor: CurrentSuperAdmin, db: DbSession):
    try:
        row = publish_price(db, payload, actor.id)
        db.commit()
        return serialize_price(row)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="This model already has that pricing version. Choose a new version label.") from exc
