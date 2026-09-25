"""Database-shared cache and provider leases; no transaction spans network I/O."""
from datetime import datetime, timedelta, timezone
from uuid import uuid4
from typing import Any, cast

from sqlalchemy import update
from sqlalchemy.engine import CursorResult
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.source_verification import SourceMetadataCache, SourceProviderState
from app.schemas.source_verification import MetadataLookup
from app.sources import metadata
from app.sources.metadata import Provider


def lookup_metadata(db: Session, provider: Provider, identifiers: list[str]) -> dict[str, MetadataLookup]:
    now = datetime.now(timezone.utc)
    identifiers = sorted(set(identifiers))
    found: dict[str, MetadataLookup] = {}
    missing = []
    for identifier in identifiers:
        row = db.get(SourceMetadataCache, f"{provider}:{identifier}")
        expiry = row.expires_at.replace(tzinfo=timezone.utc) if row and row.expires_at.tzinfo is None else row.expires_at if row else now
        if row and expiry > now:
            found[identifier] = MetadataLookup.model_validate(row.data).model_copy(update={"cached": True})
        else:
            missing.append(identifier)
    if not missing:
        db.commit()
        return found
    # Normally seeded by migration; supports metadata.create_all test databases.
    if db.get(SourceProviderState, provider) is None:
        try:
            with db.begin_nested():
                db.add(SourceProviderState(provider=provider, available_at=now))
                db.flush()
        except IntegrityError:
            pass
    token = str(uuid4())
    claimed = db.execute(update(SourceProviderState)
        .where(SourceProviderState.provider == provider, SourceProviderState.available_at <= now)
        .values(available_at=now + timedelta(seconds=20), lease_token=token))
    db.commit()
    if cast(CursorResult[Any], claimed).rowcount != 1:
        for identifier in missing:
            found[identifier] = MetadataLookup(provider=provider, identifier=identifier,
                request_url=metadata.request_url(provider, missing), retrieved_at=now,
                reason="Provider is busy or cooling down; retry later.")
        return found
    # The HTTP adapter enforces an 8-second total deadline, below the shared lease.
    try:
        fetched, backoff = metadata.fetch_metadata(provider, missing)
    except Exception:
        fetched = {identifier: MetadataLookup(provider=provider, identifier=identifier,
            request_url=metadata.request_url(provider, missing), retrieved_at=now,
            reason="Metadata lookup could not complete; retry later.") for identifier in missing}
        backoff = 60
    finished = datetime.now(timezone.utc)
    for identifier, evidence in fetched.items():
        key = f"{provider}:{identifier}"
        stable_response = evidence.metadata is not None or (evidence.reason or "").startswith("No matching record")
        expiry = finished + timedelta(hours=24) if stable_response else finished + timedelta(seconds=60)
        row = db.get(SourceMetadataCache, key)
        if row is None:
            db.add(SourceMetadataCache(key=key, data=evidence.model_dump(mode="json"), expires_at=expiry))
        else:
            row.data = evidence.model_dump(mode="json")
            row.expires_at = expiry
    db.execute(update(SourceProviderState).where(SourceProviderState.provider == provider, SourceProviderState.lease_token == token)
        .values(available_at=finished + timedelta(seconds=max(backoff, 3 if provider == "arxiv" else 1)), lease_token=None))
    db.commit()
    found.update(fetched)
    return found
