"""Persist permission-checked inputs before generation; retries reuse identical text."""
from datetime import datetime, timedelta, timezone
from hashlib import sha256
from typing import Any, Callable, cast
from uuid import UUID, uuid4

from sqlalchemy import select, update
from sqlalchemy.engine import CursorResult
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.digest_run import DigestRun
from app.models.source_content import RunSourceContent, SourceContentCache
from app.models.source_verification import SourceProviderState
from app.radar.contracts import DiscoveryRelevanceOutput, SearchPaper
from app.schemas.source_content import SourceDocument
from app.services.source_metadata_service import lookup_metadata
from app.sources import pmc_content
from app.sources.comparison import compare_paper, lookup_identity
from app.sources.content_policy import ARXIV_TERMS, CC0, attach_passages, pmc_identifier


def utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def unavailable(paper: SearchPaper, reason: str) -> SourceDocument:
    return SourceDocument(external_id=paper.external_id, title=paper.title, authors=paper.authors,
        status="unavailable", retrieved_at=datetime.now(timezone.utc), notes=[reason])


def pmc_document(db: Session, paper: SearchPaper, identifier: str) -> SourceDocument:
    now = datetime.now(timezone.utc)
    fingerprint = sha256((paper.title + str(paper.authors) + str(paper.doi) + paper.external_id).encode()).hexdigest()
    key = "pmc:v1:" + identifier + ":" + fingerprint
    cached = db.get(SourceContentCache, key)
    if cached and utc(cached.expires_at) > now:
        return SourceDocument.model_validate(cached.document).model_copy(update={"cached": True})
    if db.get(SourceProviderState, "pmc") is None:
        try:
            with db.begin_nested():
                db.add(SourceProviderState(provider="pmc", available_at=now))
                db.flush()
        except IntegrityError:
            pass
    token = str(uuid4())
    claimed = db.execute(update(SourceProviderState).where(SourceProviderState.provider == "pmc", SourceProviderState.available_at <= now)
        .values(available_at=now + timedelta(seconds=30), lease_token=token))
    if cast(CursorResult[Any], claimed).rowcount != 1:
        db.commit()
        return unavailable(paper, "PMC is busy or cooling down; no content was retrieved.")
    state = db.get(SourceProviderState, "pmc", populate_existing=True)
    assert state is not None
    if state.content_window_started is None or utc(state.content_window_started) + timedelta(hours=24) <= now:
        state.content_window_started, state.content_requests = now, 0
    # Conservative shared rolling budget keeps this interactive integration below
    # PMC's >100-request high-volume/off-peak workflow. Each attempt reserves two.
    if state.content_requests >= 96:
        state.available_at = utc(state.content_window_started) + timedelta(hours=24)
        state.lease_token = None
        db.commit()
        return unavailable(paper, "PMC retrieval budget reached; metadata-only fallback used.")
    state.content_requests += 2
    db.commit()
    document, cooldown = pmc_content.fetch_pmc(paper, identifier)
    finished = datetime.now(timezone.utc)
    cache = db.get(SourceContentCache, key)
    expires = finished + (timedelta(hours=24) if document.status == "available" else timedelta(minutes=1))
    if cache is None:
        db.add(SourceContentCache(key=key, document=document.model_dump(mode="json"), expires_at=expires))
    else:
        cache.document, cache.expires_at = document.model_dump(mode="json"), expires
    db.execute(update(SourceProviderState).where(SourceProviderState.provider == "pmc", SourceProviderState.lease_token == token)
        .values(available_at=finished + timedelta(seconds=max(1, cooldown)), lease_token=None))
    db.commit()
    return document


def stored_documents(db: Session, run_id: UUID) -> dict[str, SourceDocument]:
    rows = db.scalars(select(RunSourceContent).where(RunSourceContent.run_id == run_id))
    return {row.external_id: SourceDocument.model_validate(row.document) for row in rows}


def prepare_content(db: Session, *, run: DigestRun, discovery: DiscoveryRelevanceOutput,
                    renew: Callable[[], None]) -> dict[str, SourceDocument]:
    selected = {a.external_id for a in discovery.relevance.assessments if a.recommended_status in {"summarize", "mention_briefly"}}
    if run.prompt_version < "2026-09-25.1":
        # An already submitted background request did not see new evidence. Never
        # attach newly fetched passages to it as though they were its inputs.
        return {paper.external_id: unavailable(paper, "This run predates saved evidence; unfinished summaries use metadata-only fallback.")
                for paper in discovery.search.papers if paper.external_id in selected}
    documents = stored_documents(db, run.id)
    missing = [p for p in discovery.search.papers if p.external_id in selected and p.external_id not in documents]
    identities = {p.external_id: lookup_identity(p) for p in missing}
    arxiv_ids = [identity[1] for identity in identities.values() if identity and identity[0] == "arxiv"]
    renew()
    lookups = lookup_metadata(db, "arxiv", arxiv_ids) if arxiv_ids else {}
    for paper in missing:
        renew()
        document = unavailable(paper, "No approved reusable content source was identified. Discovery text and model-reported licences are not permission evidence.")
        identity = identities[paper.external_id]
        if identity and identity[0] == "arxiv":
            lookup = lookups.get(identity[1])
            comparison = compare_paper(paper, lookup)
            required = {check.field: check.status for check in comparison.checks}
            if lookup and lookup.metadata and lookup.metadata.abstract and all(required.get(field) == "match" for field in ("identifier", "title", "authors")):
                actual = lookup.metadata
                document = SourceDocument(external_id=paper.external_id, title=actual.title, authors=actual.authors,
                    status="available", basis="abstract_only", source_url=actual.url, request_url=lookup.request_url,
                    retrieved_at=lookup.retrieved_at, source_version=actual.identifier + " @ " + (actual.updated or "unknown revision date"),
                    license_url=CC0, permission_source=ARXIV_TERMS, cached=lookup.cached,
                    rights_notice="arXiv API descriptive metadata, including abstracts, is provided under CC0. This does not license the paper's full text.",
                    notes=["Only the abstract returned by arXiv metadata (up to 10,000 characters) was supplied; full text was not retrieved."])
                document = attach_passages(document, [("Abstract", actual.abstract or "")])
            else:
                document.notes = ["arXiv abstract unavailable or paper identity could not be confirmed; no source content supplied."]
        elif identifier := pmc_identifier(paper):
            document = pmc_document(db, paper, identifier)
        renew()  # Fence ownership after external I/O before recording inputs.
        db.add(RunSourceContent(id=uuid4(), run_id=run.id, external_id=paper.external_id, document=document.model_dump(mode="json")))
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            existing = stored_documents(db, run.id).get(paper.external_id)
            if existing is None:
                raise
            document = existing
        documents[paper.external_id] = document
    return documents
