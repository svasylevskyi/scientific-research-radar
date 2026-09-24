"""Deterministic checks of saved output, without provider requests or factual claims.

This is separate from mandatory stage/schema validation. Empty or sparse research
can be useful; paper count and limited source access can only produce warnings.
"""

import re
from datetime import date
from typing import Any, Literal
from urllib.parse import urlsplit, urlunsplit

from app.radar.contracts import (
    DigestBriefingOutput, DiscoveryRelevanceOutput, PaperSummariesOutput, TrendAnalysisOutput,
)
from app.radar.validation import briefing_references, trend_references
from app.schemas.research_quality import QualityConfig, QualityDecision, QualityFinding, QualityStatus


def canonical_doi(value: str | None) -> str:
    return re.sub(r"^(?:https?://(?:dx\.)?doi\.org/|doi:\s*)", "", (value or "").strip(), flags=re.I).lower()


def canonical_url(value: str) -> str:
    parts = urlsplit(value)
    return urlunsplit((parts.scheme.lower(), parts.netloc.lower(), parts.path.rstrip("/"), parts.query, ""))


def evaluate_quality(*, digest_snapshot: dict[str, Any], stages: dict[str, Any], config: QualityConfig) -> QualityDecision:
    if config.mode == "off":
        return QualityDecision(status="not_evaluated")
    # Re-parse completed checkpoints too, so missing/malformed stored output never
    # becomes a passing decision. The lifecycle catches failures and records Hold.
    discovery = DiscoveryRelevanceOutput.model_validate(stages["discovery_relevance"])
    summaries = PaperSummariesOutput.model_validate(stages["paper_summaries"])
    trends = TrendAnalysisOutput.model_validate(stages["trend_analysis"])
    briefing_output = DigestBriefingOutput.model_validate(stages["digest_briefing"])
    briefing = briefing_output.digest_briefing
    findings: list[QualityFinding] = []

    def add(code: str, severity: Literal["warning", "hold"], message: str, ids: set[str] | None = None) -> None:
        findings.append(QualityFinding(code=code, severity=severity, message=message, paper_ids=sorted(ids or [])))

    papers = {paper.external_id: paper for paper in discovery.search.papers}
    selected = {item.external_id for item in discovery.relevance.assessments
                if item.recommended_status in {"summarize", "mention_briefly"}}
    summarized = {item.external_id for item in summaries.paper_summaries}
    references = trend_references(trends) | briefing_references(briefing_output)
    if selected != summarized:
        add("summary_coverage", "hold", "Summaries do not match the papers selected for research.", selected ^ summarized)
    if references - papers.keys():
        add("unknown_references", "hold", "Research output references papers absent from discovery.", references - papers.keys())
    if references - selected:
        add("unselected_references", "hold", "Research output cites papers that were not selected for summaries.", references - selected)

    # These consistency rules are not optional and cannot be downgraded in settings.
    missing = [name for name, value in {
        "briefing title": briefing.title, "executive summary": briefing.executive_summary,
        "briefing content": briefing.content_markdown, "source transparency": briefing.transparency_note,
        "trend overview": trends.trend_analysis.overview,
    }.items() if not value.strip()]
    if missing:
        add("missing_content", "hold", "Required content is blank: " + ", ".join(missing) + ".")
    empty_summaries = {item.external_id for item in summaries.paper_summaries if not item.concise_summary.strip()}
    if empty_summaries:
        add("empty_summaries", "hold", "Selected papers have blank summaries.", empty_summaries)
    unsupported_themes = [theme for theme in trends.trend_analysis.themes if not theme.evidence_external_ids]
    if unsupported_themes or (briefing.main_signal is not None and not briefing.main_signal.supporting_external_ids):
        add("missing_evidence_references", "hold", "A research theme or main signal has no supporting paper references.")
    overstated_patterns = {paper_id for theme in trends.trend_analysis.themes
        if theme.evidence_type == "multi_paper_pattern" and len(set(theme.evidence_external_ids)) < 2
        for paper_id in theme.evidence_external_ids}
    if overstated_patterns:
        add("single_paper_pattern", "hold", "A multi-paper pattern references only one distinct paper.", overstated_patterns)

    included = {key: papers[key] for key in selected | references if key in papers}
    if config.check_reporting_dates:
        start = date.fromisoformat(digest_snapshot["reporting_from"])
        end = date.fromisoformat(digest_snapshot["reporting_to"])
        if start > end:
            raise ValueError("Invalid reporting interval")
        outside = {key for key, paper in included.items() if paper.published_date and not start <= paper.published_date <= end}
        unknown = {key for key, paper in included.items() if paper.published_date is None}
        if outside:
            add("reporting_period", "hold", "Included papers have publication dates outside the reporting period.", outside)
        if unknown:
            add("unknown_publication_date", "warning", "Some included papers have no publication date to check.", unknown)

    if config.check_duplicates:
        identities: dict[tuple[str, str], set[str]] = {}
        titles: dict[str, set[str]] = {}
        for key, paper in included.items():
            doi = canonical_doi(paper.doi)
            if not doi and (urlsplit(paper.url).hostname or "").lower() in {"doi.org", "dx.doi.org"}:
                doi = canonical_doi(paper.url)
            if doi:
                identities.setdefault(("doi", doi), set()).add(key)
            identities.setdefault(("url", canonical_url(paper.url)), set()).add(key)
            title = " ".join(re.findall(r"\w+", paper.title.casefold()))
            if title:
                titles.setdefault(title, set()).add(key)
        duplicate_ids = set().union(*(ids for ids in identities.values() if len(ids) > 1))
        if duplicate_ids:
            add("duplicate_identity", "hold", "Multiple included papers share the same DOI or source URL.", duplicate_ids)
        possible_ids = set().union(*(ids for ids in titles.values() if len(ids) > 1)) - duplicate_ids
        possible_ids |= {key for key, paper in included.items() if paper.possible_duplicate_of in included}
        if possible_ids:
            add("possible_duplicates", "warning", "Included papers may represent duplicate versions; review their identity.", possible_ids)

    if config.check_source_access:
        limited = {item.external_id for item in summaries.paper_summaries
                   if item.summary_basis in {"abstract_only", "metadata_only", "unclear"}}
        if limited:
            add("limited_source_access", "warning", "Some summaries report abstract-only, metadata-only, or unclear evidence.", limited)
        inconsistent = {item.external_id for item in summaries.paper_summaries
            if item.summary_basis == "open_full_text" and item.external_id in papers
            and not papers[item.external_id].full_text_available}
        if inconsistent:
            add("inconsistent_source_basis", "hold", "A summary claims full-text review although discovery reports no full text.", inconsistent)
    if len(selected) < config.sparse_paper_threshold:
        add("sparse_results", "warning", f"Only {len(selected)} papers were selected; limited coverage does not by itself block delivery.")

    # The compact owner notice should show a blocking reason before any warnings.
    findings.sort(key=lambda finding: finding.severity != "hold")
    status: QualityStatus = "hold" if any(item.severity == "hold" for item in findings) else "warning" if findings else "pass"
    return QualityDecision(status=status, findings=findings)
