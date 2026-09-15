"""Acceptance rules run after accounting and before research output is saved.

Future quality gates belong at this boundary. Rejection must retain request cost
evidence while preventing the completed response from being reused on retry.
"""

from app.radar.contracts import (
    DigestBriefingOutput,
    DiscoveryRelevanceOutput,
    PaperSummariesOutput,
    TrendAnalysisOutput,
)
from app.radar.errors import RadarOutputValidationError


def trend_references(output: TrendAnalysisOutput) -> set[str]:
    trend = output.trend_analysis
    groups = [
        *(item.evidence_external_ids for item in trend.themes),
        *(item.supporting_external_ids for item in trend.emerging_items),
        *(
            item.supporting_external_ids
            for item in trend.repeated_limitations_or_unresolved_problems
        ),
        *(
            item.supporting_external_ids
            for item in trend.contradictions_or_competing_approaches
        ),
        *(item.supporting_external_ids for item in trend.weak_signals),
        *(item.supporting_external_ids for item in trend.changes_vs_previous_digest),
        *(item.supporting_external_ids for item in trend.practical_implications),
    ]
    return {external_id for group in groups for external_id in group}


def briefing_references(output: DigestBriefingOutput) -> set[str]:
    briefing = output.digest_briefing
    groups = [
        briefing.top_paper_external_ids,
        briefing.secondary_paper_external_ids,
        *(item.related_external_ids for item in briefing.recommendations),
    ]
    if briefing.main_signal is not None:
        groups.append(briefing.main_signal.supporting_external_ids)
    return {external_id for group in groups for external_id in group}


def validate_references(
    *, referenced_ids: set[str], known_ids: set[str], stage: str
) -> None:
    unknown = referenced_ids - known_ids
    if unknown:
        raise RadarOutputValidationError(
            f"The {stage} referenced unknown papers: " + ", ".join(sorted(unknown))
        )


def validate_discovery(
    *, output: DiscoveryRelevanceOutput, maximum_papers: int
) -> None:
    if len(output.search.papers) > maximum_papers:
        raise RadarOutputValidationError(
            "The discovery stage returned more papers than the digest maximum"
        )


def validate_summaries(*, output: PaperSummariesOutput, expected_ids: set[str]) -> None:
    actual_ids = {summary.external_id for summary in output.paper_summaries}
    if actual_ids != expected_ids:
        raise RadarOutputValidationError(
            "The summary stage must return exactly one summary for each batch paper"
        )


def validate_trends(*, output: TrendAnalysisOutput, known_ids: set[str]) -> None:
    validate_references(
        referenced_ids=trend_references(output),
        known_ids=known_ids,
        stage="trend analysis",
    )


def validate_briefing(*, output: DigestBriefingOutput, known_ids: set[str]) -> None:
    validate_references(
        referenced_ids=briefing_references(output),
        known_ids=known_ids,
        stage="digest briefing",
    )
