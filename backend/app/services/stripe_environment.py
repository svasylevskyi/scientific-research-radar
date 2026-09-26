"""Deployment mode binding. Never convert a billing database between Stripe modes."""
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.models.stripe_sandbox import StripeEnvironment, SandboxCheckout
from app.services.stripe_catalogue_service import StripeCatalogueError


def matches_metadata(metadata: dict, mode: str) -> bool:
    if mode == "live":
        return metadata.get("radar_mode") == "live"
    return metadata.get("radar_mode", "sandbox") == "sandbox" and metadata.get("radar_sandbox") == "1"


def ensure_database_mode(db: Session, settings: Settings) -> None:
    """Bind once, with conflict-safe initialization. Caller commits the transaction.

    Existing pre-mode checkout records belong to sandbox. Configuration changes
    cannot reinterpret those records, even when checkout creation is disabled.
    """
    mode = db.scalar(select(StripeEnvironment.mode).where(StripeEnvironment.id == 1))
    if mode is None:
        legacy = db.scalar(select(SandboxCheckout.id).limit(1))
        selected = "sandbox" if legacy else settings.stripe_mode
        insert = pg_insert
        db.execute(insert(StripeEnvironment).values(id=1, mode=selected).on_conflict_do_nothing(index_elements=["id"]))
        mode = db.scalar(select(StripeEnvironment.mode).where(StripeEnvironment.id == 1))
    if mode != settings.stripe_mode:
        raise StripeCatalogueError(
            f"This database is bound to Stripe {mode}; STRIPE_MODE is {settings.stripe_mode}. "
            "Use a separate database for live and sandbox deployments. Do not change or delete the mode binding.", 503,
        )
