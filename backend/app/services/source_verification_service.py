"""Persist independent metadata assessments; manual rechecks never alter delivery."""
from datetime import datetime, timezone
from typing import Literal
from uuid import UUID, uuid4

from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.digest_run import DigestRun, DigestRunStatus
from app.models.source_verification import SourceVerification
from app.models.user import User
from app.radar.contracts import DigestBriefingOutput, DiscoveryRelevanceOutput, TrendAnalysisOutput
from app.radar.validation import briefing_references, trend_references
from app.schemas.research_quality import QualityFinding, QualitySnapshot
from app.schemas.source_verification import SourceVerificationHistory, SourceVerificationRead
from app.services.manual_quality_service import ManualQualityUnavailableError
from app.services.research_quality_settings import ENGINE_VERSION, current_settings
from app.services.source_metadata_service import lookup_metadata
from app.sources.comparison import compare_paper, lookup_identity

SOURCE_ENGINE_VERSION = "1"


def verify_sources(
    db: Session, *, run: DigestRun, snapshot: QualitySnapshot,
    trigger: Literal["automatic", "manual"], actor: User | None = None,
) -> SourceVerificationRead:
    stages = {str(stage.stage): stage.result_data for stage in run.stages}
    input_unavailable = False
    try:
        discovery = DiscoveryRelevanceOutput.model_validate(stages["discovery_relevance"])
        selected = {a.external_id for a in discovery.relevance.assessments if a.recommended_status in {"summarize", "mention_briefly"}}
        if stages.get("trend_analysis"):
            selected |= trend_references(TrendAnalysisOutput.model_validate(stages["trend_analysis"]))
        if stages.get("digest_briefing"):
            selected |= briefing_references(DigestBriefingOutput.model_validate(stages["digest_briefing"]))
        papers = [paper for paper in discovery.search.papers if paper.external_id in selected]
        if len(papers) > 30:
            raise ValueError("Too many saved papers")
    except (ValidationError, KeyError, ValueError) as exc:
        if trigger == "manual":
            raise ManualQualityUnavailableError("Saved paper metadata is incomplete or incompatible with source verification.") from exc
        # Preserve completion semantics: deterministic gates decide whether malformed
        # saved output is held; unavailable metadata must not reject a paid LLM stage.
        papers = []
        input_unavailable = True
    run_id = run.id
    actor_id, actor_name = (actor.id, actor.full_name) if actor else (None, "Automatic verification")
    identities = {paper.external_id: lookup_identity(paper) for paper in papers}
    evidence = {}
    # Batch all identifiers per provider (maximum two network calls per run).
    for provider in ("crossref", "arxiv"):
        identifiers = [identity[1] for identity in identities.values() if identity and identity[0] == provider]
        if identifiers:
            evidence.update({(provider, key): value for key, value in lookup_metadata(db, provider, identifiers).items()})
    results = [compare_paper(paper, evidence.get(identity) if (identity := identities[paper.external_id]) else None) for paper in papers]
    findings = [QualityFinding(code="source_verification_unavailable", severity="warning",
        message="Saved paper data could not be used for source verification.")] if input_unavailable else []
    for result in results:
        identity = identities[result.external_id]
        duplicates = [key for key, other in identities.items() if other and other == identity and key != result.external_id]
        if duplicates:
            result.notes.append("Same source identifier is also used by: " + ", ".join(duplicates))
    for status in ("conflict", "unverified"):
        affected = [result.external_id for result in results if result.status == status]
        if affected:
            findings.append(QualityFinding(code=f"source_metadata_{status}",
                severity="hold" if status == "conflict" and snapshot.config.source_verification_mode == "enforce" else "warning",
                message=f"Source metadata conflicts affect {len(affected)} paper(s)." if status == "conflict" else f"Metadata could not be fully verified for {len(affected)} paper(s).",
                paper_ids=affected))
    row = SourceVerification(id=uuid4(), run_id=run_id, trigger=trigger, created_by=actor_id,
        created_by_name=actor_name, created_at=datetime.now(timezone.utc), engine_version=SOURCE_ENGINE_VERSION,
        config=snapshot.model_dump(mode="json"), papers=[result.model_dump(mode="json") for result in results],
        findings=[finding.model_dump(mode="json") for finding in findings])
    db.add(row)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = automatic_evidence(db, run_id) if trigger == "automatic" else None
        if existing is None:
            raise
        return existing
    return SourceVerificationRead.model_validate(row)


def automatic_evidence(db: Session, run_id: UUID) -> SourceVerificationRead | None:
    row = db.scalar(select(SourceVerification).where(SourceVerification.run_id == run_id, SourceVerification.trigger == "automatic"))
    return SourceVerificationRead.model_validate(row) if row else None


def verify_automatically(db: Session, run: DigestRun) -> SourceVerificationRead | None:
    raw = run.quality_config
    # Pre-feature snapshots never acquire a new network check on retry/completion.
    if not raw or "source_verification_mode" not in raw.get("config", {}):
        return None
    try:
        snapshot = QualitySnapshot.model_validate(raw)
    except ValidationError:
        return None  # The deterministic gate will hold an invalid settings snapshot.
    if snapshot.engine_version != ENGINE_VERSION:
        return None
    if snapshot.config.mode == "off" or snapshot.config.source_verification_mode == "off":
        return None
    return automatic_evidence(db, run.id) or verify_sources(db, run=run, snapshot=snapshot, trigger="automatic")


def verify_manually(db: Session, *, run: DigestRun, actor: User, expected_settings_version: int) -> SourceVerificationRead:
    if run.status != DigestRunStatus.COMPLETED:
        raise ManualQualityUnavailableError("Source verification requires a completed research run.")
    settings = current_settings(db)
    if settings.version != expected_settings_version:
        raise ManualQualityUnavailableError("Quality settings changed. Refresh before verifying sources.")
    if settings.config.source_verification_mode == "off":
        raise ManualQualityUnavailableError("Source verification is disabled. A super-admin can enable it in Research quality settings.")
    snapshot = QualitySnapshot(version=settings.version, engine_version=ENGINE_VERSION, config=settings.config)
    return verify_sources(db, run=run, snapshot=snapshot, trigger="manual", actor=actor)


def source_history(db: Session, *, run: DigestRun, offset: int, limit: int) -> SourceVerificationHistory:
    scope = SourceVerification.run_id == run.id
    rows = db.scalars(select(SourceVerification).where(scope).order_by(SourceVerification.created_at.desc(), SourceVerification.id.desc()).offset(offset).limit(limit))
    return SourceVerificationHistory(items=[SourceVerificationRead.model_validate(row) for row in rows],
        total=db.scalar(select(func.count()).select_from(SourceVerification).where(scope)) or 0, offset=offset, limit=limit)
