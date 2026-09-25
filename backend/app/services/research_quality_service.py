"""Persist a quality decision in the same transaction as terminal run state."""

import logging
from datetime import datetime, timezone

from app.models.digest_run import DigestRun
from app.radar.quality import evaluate_quality
from app.schemas.research_quality import QualityDecision, QualityFinding, QualitySnapshot
from app.services.research_quality_settings import ENGINE_VERSION

logger = logging.getLogger(__name__)


def assess_run(run: DigestRun, source_findings: list[QualityFinding] | None = None) -> None:
    # Legacy runs retain their original behaviour, including failed-run retries.
    if run.quality_config is None or run.quality_evaluated_at is not None:
        return
    mode: str | None = None
    try:
        snapshot = QualitySnapshot.model_validate(run.quality_config)
        mode = snapshot.config.mode
        if snapshot.engine_version != ENGINE_VERSION:
            raise ValueError("Unsupported quality engine version")
        decision = evaluate_quality(digest_snapshot=run.digest_snapshot,
            stages={str(stage.stage): stage.result_data for stage in run.stages}, config=snapshot.config)
        if mode != "off" and source_findings:
            decision.findings.extend(source_findings)
            decision.status = "hold" if any(item.severity == "hold" for item in decision.findings) else "warning"
    except Exception:
        logger.exception("Quality assessment could not complete for run %s", run.id)
        decision = QualityDecision(status="hold", findings=[QualityFinding(
            code="evaluation_failed", severity="hold",
            message="Required quality checks could not complete. Output needs review.")])
    run.quality_status = decision.status
    run.quality_findings = [finding.model_dump(mode="json") for finding in decision.findings]
    run.quality_evaluated_at = datetime.now(timezone.utc) if mode != "off" else None
    run.quality_delivery_blocked = decision.status == "hold" and mode != "observe"
    if run.quality_delivery_blocked and run.email_delivery is not None:
        run.email_delivery.status = "held"
        run.email_delivery.last_error = "Quality checks held this output. Automatic delivery is blocked."


def delivery_allowed(run: DigestRun) -> bool:
    if run.quality_delivery_blocked:
        return False
    if run.quality_config is None:
        return True
    mode = run.quality_config.get("config", {}).get("mode")
    if mode in {"off", "observe"}:
        return True
    # Enforced runs need a completed passing/warning decision; missing/unknown
    # state fails closed, including after a scheduler crash and lease recovery.
    return mode == "enforce" and run.quality_evaluated_at is not None and run.quality_status in {"pass", "warning"}


def quality_email_note(run: DigestRun) -> str:
    if run.quality_status == "not_evaluated":
        return "Quality checks: not evaluated. Consult the original sources."
    prefix = f"Quality checks: {run.quality_status}. These checks do not verify scientific claims."
    if run.quality_config and run.quality_config.get("config", {}).get("mode") == "observe":
        prefix += " Observation mode: findings do not block delivery."
    messages = " ".join(item["message"] for item in run.quality_findings)
    return f"{prefix} {messages}".strip()
