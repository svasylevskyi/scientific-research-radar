"""Internal plan catalogue only: no checkout, assignment or quota enforcement."""
from app.schemas.admin_billing_responses import (
    PlanListRead,
    PriceWarningsRead,
    SavedPlanRead,
    StripeMappingCheckRead,
    StripeProductsRead,
)
from datetime import timezone
from fastapi import APIRouter, HTTPException, Query, Response
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from app.api.dependencies import CurrentAdmin, DbSession, AppSettings
from app.models.subscription_plan import SubscriptionPlanRevision
from app.schemas.subscription_plan import SubscriptionPlanSave
from app.schemas.subscription_plan import SubscriptionPlanConfiguration
from pydantic import BaseModel, Field
from app.services.plan_catalogue_service import claim_product, price_warnings, product_owners

router = APIRouter()


class PricePreview(BaseModel):
    code: str = Field(default="", max_length=60)
    configuration: SubscriptionPlanConfiguration


@router.post("/price-warnings", response_model=PriceWarningsRead, response_model_exclude_unset=True)
def preview_prices(payload: PricePreview, actor: CurrentAdmin, db: DbSession):
    return {"warnings": price_warnings(db, payload.code, payload.configuration)}


@router.get("/stripe-products", response_model=StripeProductsRead, response_model_exclude_unset=True)
def stripe_products(actor: CurrentAdmin, db: DbSession, settings: AppSettings, response: Response):
    from app.services.stripe_catalogue_service import list_products, StripeCatalogueError
    response.headers["Cache-Control"] = "no-store"
    try:
        products = list_products(settings)
    except StripeCatalogueError as exc:
        raise HTTPException(exc.status_code, str(exc)) from None
    owners = product_owners(db)
    return {"items": [{**p, "mapped_plan_codes": sorted(owners.get(p["id"], set()))} for p in products]}


def serialize(row):
    return {"id": row.id, "code": row.code, "revision": row.revision,
            "configuration": row.configuration, "change_note": row.change_note,
            "created_by": row.created_by, "created_at": row.created_at.replace(tzinfo=timezone.utc) if row.created_at.tzinfo is None else row.created_at}


@router.get("", response_model=PlanListRead, response_model_exclude_unset=True)
def list_plans(actor: CurrentAdmin, db: DbSession,
               offset: int = Query(0, ge=0), limit: int = Query(25, ge=1, le=100)):
    latest = select(func.max(SubscriptionPlanRevision.revision).label("revision"),
                    SubscriptionPlanRevision.code).group_by(SubscriptionPlanRevision.code).subquery()
    statement = select(SubscriptionPlanRevision).join(latest,
        (SubscriptionPlanRevision.code == latest.c.code) & (SubscriptionPlanRevision.revision == latest.c.revision))
    return {"items": [serialize(row) for row in db.scalars(statement.order_by(
        func.coalesce(SubscriptionPlanRevision.configuration["display_order"].as_integer(), 0),
        SubscriptionPlanRevision.code).offset(offset).limit(limit))],
            "total": db.scalar(select(func.count()).select_from(latest))}


@router.get("/{code}/revisions", response_model=PlanListRead, response_model_exclude_unset=True)
def history(code: str, actor: CurrentAdmin, db: DbSession,
            offset: int = Query(0, ge=0), limit: int = Query(25, ge=1, le=100)):
    statement = select(SubscriptionPlanRevision).where(SubscriptionPlanRevision.code == code)
    return {"items": [serialize(row) for row in db.scalars(statement.order_by(SubscriptionPlanRevision.revision.desc()).offset(offset).limit(limit))],
            "total": db.scalar(select(func.count()).select_from(SubscriptionPlanRevision).where(SubscriptionPlanRevision.code == code))}


@router.post("", status_code=201, response_model=SavedPlanRead, response_model_exclude_unset=True)
def save_plan(payload: SubscriptionPlanSave, actor: CurrentAdmin, db: DbSession):
    current = db.scalar(select(func.max(SubscriptionPlanRevision.revision)).where(SubscriptionPlanRevision.code == payload.code)) or 0
    if current != payload.expected_revision:
        raise HTTPException(status_code=409, detail="This plan changed. Reload the catalogue and review the latest revision before saving.")
    row = SubscriptionPlanRevision(code=payload.code, revision=current + 1,
        configuration=payload.configuration.model_dump(mode="json"), change_note=payload.change_note, created_by=actor.id)
    db.add(row)
    try:
        if payload.configuration.stripe_sandbox:
            claim_product(db, payload.code, payload.configuration.stripe_sandbox.product_id)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Another admin saved this plan or claimed its Stripe product. Reload and review the latest catalogue.") from exc
    return {**serialize(row), "warnings": price_warnings(db, payload.code, payload.configuration)}


@router.post("/{code}/revisions/{revision}/check-stripe", response_model=StripeMappingCheckRead, response_model_exclude_unset=True)
def verify_stripe_mapping(code: str, revision: int, actor: CurrentAdmin, db: DbSession,
                          settings: AppSettings, response: Response):
    from app.services.stripe_catalogue_service import check_mapping, StripeCatalogueError
    row = db.scalar(select(SubscriptionPlanRevision).where(
        SubscriptionPlanRevision.code == code, SubscriptionPlanRevision.revision == revision))
    if row is None:
        raise HTTPException(status_code=404, detail="Plan revision not found.")
    response.headers["Cache-Control"] = "no-store"
    try:
        return {"code": code, "revision": revision, **check_mapping(row.configuration, settings)}
    except StripeCatalogueError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from None
