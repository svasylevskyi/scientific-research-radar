from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

Confidence = Literal["low", "medium", "high"]
Priority = Literal["low", "medium", "high"]
Audience = Literal[
    "researchers",
    "builders_technical_teams",
    "science_communicators_educators",
    "executives_decision_makers",
    "general",
]


class RadarContract(BaseModel):
    model_config = ConfigDict(extra="forbid")


class SourceCitation(RadarContract):
    title: str
    url: str


class SearchPaper(RadarContract):
    source_name: str
    external_id: str
    title: str
    authors: list[str]
    abstract: str | None
    published_date: date | None
    updated_date: date | None
    venue_or_source: str | None
    url: str
    pdf_url: str | None
    doi: str | None
    access_status: Literal[
        "open", "paywalled", "metadata_only", "user_provided", "unknown"
    ]
    license: str | None
    full_text_available: bool
    discovery_reason: str
    matched_keywords: list[str]
    possible_duplicate_of: str | None
    factual_note: str
    warnings: list[str]
    citations: list[SourceCitation]


class SearchStage(RadarContract):
    queries: list[str]
    sources_used: list[str]
    papers: list[SearchPaper]
    deduplication_notes: list[str]
    coverage_notes: list[str]
    next_step_recommendations: list[str]


class RelevanceAssessment(RadarContract):
    external_id: str
    topic_relevance_score: int = Field(ge=1, le=10)
    novelty_signal_score: int = Field(ge=1, le=10)
    practical_value_score: int = Field(ge=1, le=10)
    score: float = Field(ge=0, le=100)
    confidence_score: int = Field(ge=1, le=10)
    recommended_status: Literal["summarize", "mention_briefly", "archive", "reject"]
    best_digest_placement: Literal[
        "top_paper",
        "important_technical_contribution",
        "trend_signal",
        "background_context",
        "niche_interest",
        "archive_only",
        "reject",
    ]
    rationale: str
    criteria: list[str]
    evidence_used: list[str]
    potential_value_for_audience: str
    caveats: list[str]
    next_step_recommendations: list[str]


class RelevanceStage(RadarContract):
    methodology: str
    assessments: list[RelevanceAssessment]
    recommendations: list[str]
    quality_warnings: list[str]


class PaperSummary(RadarContract):
    external_id: str
    summary_basis: Literal[
        "metadata_only",
        "abstract_only",
        "extracted_sections",
        "open_full_text",
        "user_provided_source",
        "unclear",
    ]
    paper_type: Literal[
        "empirical_study",
        "benchmark_paper",
        "dataset_paper",
        "survey_review",
        "theoretical_paper",
        "systems_paper",
        "methods_paper",
        "position_paper",
        "case_study",
        "unclear",
    ]
    concise_summary: str
    why_this_paper_matters: list[str]
    methods: list[str]
    key_findings: list[str]
    limitations: list[str]
    implications: list[str]
    recommendations: list[str]
    suggested_digest_bullet: str
    follow_up_questions: list[str]
    related_search_terms: list[str]
    warnings: list[str]
    confidence_score: int = Field(ge=1, le=10)


class TrendTheme(RadarContract):
    title: str
    summary: str
    evidence_type: Literal[
        "multi_paper_pattern",
        "single_paper_signal",
        "historical_continuation",
        "weak_signal",
    ]
    evidence_external_ids: list[str]
    observed_pattern: str
    interpretation: str
    confidence: Confidence
    relevance_to_audience: str
    caveats: list[str]


class EmergingItem(RadarContract):
    name: str
    item_type: Literal[
        "method",
        "model",
        "tool",
        "dataset",
        "benchmark",
        "framework",
        "metric",
        "system",
        "other",
    ]
    description: str
    supporting_external_ids: list[str]
    why_it_matters: str
    maturity_level: Literal["early", "emerging", "established", "unclear"]
    confidence: Confidence
    caveats: list[str]


class RepeatedProblem(RadarContract):
    name: str
    description: str
    supporting_external_ids: list[str]
    affected_methods_or_topics: list[str]
    why_it_matters: str
    confidence: Confidence


class CompetingApproach(RadarContract):
    description: str
    approach_a: str
    approach_b: str
    supporting_external_ids: list[str]
    interpretation: str
    confidence: Confidence
    caveats: list[str]


class WeakSignal(RadarContract):
    name: str
    description: str
    supporting_external_ids: list[str]
    why_it_may_matter: str
    why_confidence_is_limited: str
    recommended_monitoring_query: str


class HistoricalChange(RadarContract):
    change_type: Literal[
        "new_theme",
        "repeated_theme",
        "fading_theme",
        "stronger_signal",
        "weaker_signal",
        "unclear",
    ]
    description: str
    supporting_external_ids: list[str]
    previous_digest_reference: str
    confidence: Confidence


class PracticalImplication(RadarContract):
    audience_segment: Audience
    implication: str
    supporting_external_ids: list[str]
    recommended_action: str
    confidence: Confidence


class RecommendedSearch(RadarContract):
    query: str
    reason: str
    priority: Priority


class TrendAnalysis(RadarContract):
    overview: str
    overall_confidence: Confidence
    analysis_limitations: list[str]
    themes: list[TrendTheme]
    emerging_items: list[EmergingItem]
    repeated_limitations_or_unresolved_problems: list[RepeatedProblem]
    contradictions_or_competing_approaches: list[CompetingApproach]
    weak_signals: list[WeakSignal]
    changes_vs_previous_digest: list[HistoricalChange]
    practical_implications: list[PracticalImplication]
    recommendations: list[str]
    recommended_next_searches: list[RecommendedSearch]


class BriefingMainSignal(RadarContract):
    title: str
    summary: str
    why_it_matters: str
    supporting_external_ids: list[str]
    confidence: Confidence
    caveats: list[str]


class RecommendedAction(RadarContract):
    action: str
    reason: str
    priority: Priority
    related_external_ids: list[str]


class DigestBriefing(RadarContract):
    title: str
    executive_summary: str
    highlights: list[str]
    main_signal: BriefingMainSignal | None
    top_paper_external_ids: list[str]
    secondary_paper_external_ids: list[str]
    recommendations: list[RecommendedAction]
    recommended_next_searches: list[RecommendedSearch]
    source_basis: Literal[
        "metadata_only",
        "abstracts_only",
        "open_full_text",
        "user_provided_sources",
        "mixed",
        "unclear",
    ]
    transparency_note: str
    quality_warnings: list[str]
    content_markdown: str


class RadarOutput(RadarContract):
    search: SearchStage
    relevance: RelevanceStage
    paper_summaries: list[PaperSummary]
    trend_analysis: TrendAnalysis
    digest_briefing: DigestBriefing

    @model_validator(mode="after")
    def validate_paper_references(self) -> "RadarOutput":
        paper_ids = [paper.external_id for paper in self.search.papers]
        if len(paper_ids) != len(set(paper_ids)):
            raise ValueError("Search results must use unique external paper identifiers")

        expected_ids = set(paper_ids)
        relevance_ids = [
            assessment.external_id for assessment in self.relevance.assessments
        ]
        summary_ids = [summary.external_id for summary in self.paper_summaries]
        if len(relevance_ids) != len(set(relevance_ids)) or set(relevance_ids) != expected_ids:
            raise ValueError("Every searched paper must have one relevance assessment")
        if len(summary_ids) != len(set(summary_ids)) or set(summary_ids) != expected_ids:
            raise ValueError("Every searched paper must have one paper summary")

        referenced_ids = self._collect_referenced_ids()
        unknown_ids = referenced_ids - expected_ids
        if unknown_ids:
            raise ValueError(
                "Trend and briefing data reference unknown papers: "
                + ", ".join(sorted(unknown_ids))
            )

        top_ids = self.digest_briefing.top_paper_external_ids
        secondary_ids = self.digest_briefing.secondary_paper_external_ids
        if len(top_ids) != len(set(top_ids)) or len(secondary_ids) != len(set(secondary_ids)):
            raise ValueError("Briefing paper selections must not contain duplicates")
        if set(top_ids) & set(secondary_ids):
            raise ValueError("Top and secondary briefing papers must not overlap")
        return self

    def _collect_referenced_ids(self) -> set[str]:
        trend = self.trend_analysis
        groups = [
            *(theme.evidence_external_ids for theme in trend.themes),
            *(item.supporting_external_ids for item in trend.emerging_items),
            *(
                problem.supporting_external_ids
                for problem in trend.repeated_limitations_or_unresolved_problems
            ),
            *(
                item.supporting_external_ids
                for item in trend.contradictions_or_competing_approaches
            ),
            *(signal.supporting_external_ids for signal in trend.weak_signals),
            *(change.supporting_external_ids for change in trend.changes_vs_previous_digest),
            *(
                implication.supporting_external_ids
                for implication in trend.practical_implications
            ),
            self.digest_briefing.top_paper_external_ids,
            self.digest_briefing.secondary_paper_external_ids,
            *(
                action.related_external_ids
                for action in self.digest_briefing.recommendations
            ),
        ]
        if self.digest_briefing.main_signal is not None:
            groups.append(self.digest_briefing.main_signal.supporting_external_ids)
        return {external_id for group in groups for external_id in group}
