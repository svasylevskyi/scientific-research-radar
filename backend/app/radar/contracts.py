from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


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
    url: str
    doi: str | None
    discovery_reason: str
    matched_keywords: list[str]
    citations: list[SourceCitation]


class SearchStage(RadarContract):
    queries: list[str]
    papers: list[SearchPaper]
    coverage_notes: list[str]
    next_step_recommendations: list[str]


class RelevanceAssessment(RadarContract):
    external_id: str
    score: float = Field(ge=0, le=100)
    rationale: str
    criteria: list[str]
    next_step_recommendations: list[str]


class RelevanceStage(RadarContract):
    methodology: str
    assessments: list[RelevanceAssessment]
    recommendations: list[str]


class PaperSummary(RadarContract):
    external_id: str
    concise_summary: str
    key_findings: list[str]
    methods: list[str]
    limitations: list[str]
    implications: list[str]
    recommendations: list[str]


class TrendTheme(RadarContract):
    title: str
    summary: str
    evidence_external_ids: list[str]
    confidence: Literal["low", "medium", "high"]


class TrendAnalysis(RadarContract):
    overview: str
    themes: list[TrendTheme]
    emerging_signals: list[str]
    contradictions: list[str]
    recommendations: list[str]


class DigestBriefing(RadarContract):
    title: str
    executive_summary: str
    highlights: list[str]
    recommendations: list[str]
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
        relevance_ids = {assessment.external_id for assessment in self.relevance.assessments}
        summary_ids = {summary.external_id for summary in self.paper_summaries}
        if relevance_ids != expected_ids:
            raise ValueError("Every searched paper must have one relevance assessment")
        if summary_ids != expected_ids:
            raise ValueError("Every searched paper must have one paper summary")
        return self
