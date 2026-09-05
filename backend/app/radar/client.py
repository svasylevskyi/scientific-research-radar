from dataclasses import dataclass
from datetime import date
from typing import Protocol

from app.core.config import Settings
from app.radar.contracts import (
    BriefingMainSignal,
    DigestBriefing,
    EmergingItem,
    PaperSummary,
    RadarOutput,
    RecommendedAction,
    RecommendedSearch,
    RelevanceAssessment,
    RelevanceStage,
    SearchPaper,
    SearchStage,
    TrendAnalysis,
    TrendTheme,
)
from app.radar.prompt_builder import RadarPrompt


class RadarClientError(RuntimeError):
    pass


class RadarNotConfiguredError(RadarClientError):
    pass


@dataclass(frozen=True)
class RadarClientResult:
    output: RadarOutput
    response_id: str | None
    model_name: str


class RadarClient(Protocol):
    model_name: str

    def execute(self, prompt: RadarPrompt) -> RadarClientResult: ...


class OpenAIRadarClient:
    def __init__(self, *, api_key: str, model_name: str) -> None:
        self.api_key = api_key
        self.model_name = model_name

    def execute(self, prompt: RadarPrompt) -> RadarClientResult:
        try:
            from openai import OpenAI

            client = OpenAI(api_key=self.api_key)
            response = client.responses.parse(
                model=self.model_name,
                tools=[{"type": "web_search"}],
                input=[
                    {"role": "system", "content": prompt.system},
                    {"role": "user", "content": prompt.user},
                ],
                text_format=RadarOutput,
            )
        except Exception as exc:
            raise RadarClientError("The OpenAI radar request failed") from exc

        if response.output_parsed is None:
            raise RadarClientError("The OpenAI response did not contain structured radar data")
        return RadarClientResult(
            output=response.output_parsed,
            response_id=response.id,
            model_name=self.model_name,
        )


class DryRunRadarClient:
    """Deterministic local client used until live OpenAI execution is enabled."""

    model_name = "dry-run"

    def execute(self, prompt: RadarPrompt) -> RadarClientResult:
        del prompt
        external_id = "dry-run-paper-001"
        output = RadarOutput(
            search=SearchStage(
                queries=["dry-run scientific paper search"],
                papers=[
                    SearchPaper(
                        source_name="dry-run",
                        external_id=external_id,
                        title="Placeholder paper generated without an OpenAI request",
                        authors=["Scientific Research Radar"],
                        abstract="Deterministic placeholder data for local workflow testing.",
                        published_date=date.today(),
                        updated_date=date.today(),
                        venue_or_source="Dry-run fixture",
                        url="https://example.invalid/scientific-research-radar/dry-run-paper-001",
                        pdf_url=None,
                        doi=None,
                        access_status="metadata_only",
                        license=None,
                        full_text_available=False,
                        discovery_reason="Exercises search-result persistence without external traffic.",
                        matched_keywords=["dry run"],
                        possible_duplicate_of=None,
                        factual_note="Synthetic record used only for application testing.",
                        warnings=["This is not a real scientific paper."],
                        citations=[],
                    )
                ],
                sources_used=["dry-run"],
                deduplication_notes=[],
                coverage_notes=["No external search was performed in dry-run mode."],
                next_step_recommendations=["Enable live execution after reviewing the prompts."],
            ),
            relevance=RelevanceStage(
                methodology="Deterministic placeholder scoring for workflow validation.",
                assessments=[
                    RelevanceAssessment(
                        external_id=external_id,
                        topic_relevance_score=8,
                        novelty_signal_score=1,
                        practical_value_score=7,
                        score=75,
                        confidence_score=10,
                        recommended_status="summarize",
                        best_digest_placement="background_context",
                        rationale="Provides a stable record for exercising the radar pipeline.",
                        criteria=["Persistence coverage", "UI coverage"],
                        evidence_used=["dry-run fixture"],
                        potential_value_for_audience="Supports safe workflow validation.",
                        caveats=["Contains no scientific evidence."],
                        next_step_recommendations=["Replace with live evidence when configured."],
                    )
                ],
                recommendations=["Review the stored structure before enabling OpenAI."],
                quality_warnings=["Scores describe a synthetic test record."],
            ),
            paper_summaries=[
                PaperSummary(
                    external_id=external_id,
                    summary_basis="metadata_only",
                    paper_type="unclear",
                    concise_summary="Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
                    why_this_paper_matters=["Exercises the persisted summary structure."],
                    key_findings=["Placeholder finding for interface validation."],
                    methods=["Deterministic dry-run fixture."],
                    limitations=["This is not a real scientific paper."],
                    implications=["The end-to-end persistence path can be reviewed safely."],
                    recommendations=["Do not treat dry-run content as scientific evidence."],
                    suggested_digest_bullet="Synthetic result confirms the radar workflow is connected.",
                    follow_up_questions=["Are the prompts ready for live evaluation?"],
                    related_search_terms=["radar prompt evaluation"],
                    warnings=["Synthetic content only."],
                    confidence_score=10,
                )
            ],
            trend_analysis=TrendAnalysis(
                overview="Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
                overall_confidence="low",
                analysis_limitations=["Only a synthetic single-paper result is available."],
                themes=[
                    TrendTheme(
                        title="Placeholder trend",
                        summary="Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
                        evidence_type="single_paper_signal",
                        evidence_external_ids=[external_id],
                        observed_pattern="One synthetic workflow record was produced.",
                        interpretation="The persistence flow is ready for review.",
                        confidence="low",
                        relevance_to_audience="Demonstrates the shape of future trend output.",
                        caveats=["Not a scientific trend."],
                    )
                ],
                emerging_items=[
                    EmergingItem(
                        name="Structured dry-run output",
                        item_type="system",
                        description="A deterministic fixture exercises all output stages.",
                        supporting_external_ids=[external_id],
                        why_it_matters="It enables validation without external traffic.",
                        maturity_level="early",
                        confidence="high",
                        caveats=["This is application behavior, not research evidence."],
                    )
                ],
                repeated_limitations_or_unresolved_problems=[],
                contradictions_or_competing_approaches=[],
                weak_signals=[],
                changes_vs_previous_digest=[],
                practical_implications=[],
                recommendations=["Run with live search before drawing conclusions."],
                recommended_next_searches=[
                    RecommendedSearch(
                        query="review radar prompt before live execution",
                        reason="Confirms the configuration and output contract are ready.",
                        priority="high",
                    )
                ],
            ),
            digest_briefing=DigestBriefing(
                title="Dry-run research briefing",
                executive_summary="Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
                highlights=["Placeholder briefing highlight."],
                main_signal=BriefingMainSignal(
                    title="Workflow validation",
                    summary="All structured stages produced deterministic records.",
                    why_it_matters="The flow can be reviewed without making an OpenAI request.",
                    supporting_external_ids=[external_id],
                    confidence="high",
                    caveats=["No scientific conclusions can be drawn."],
                ),
                top_paper_external_ids=[external_id],
                secondary_paper_external_ids=[],
                recommendations=[
                    RecommendedAction(
                        action="Review and refine the radar prompts.",
                        reason="Prompt approval should precede live execution.",
                        priority="high",
                        related_external_ids=[external_id],
                    )
                ],
                recommended_next_searches=[
                    RecommendedSearch(
                        query="review radar prompt before live execution",
                        reason="Confirms readiness for a source-grounded run.",
                        priority="high",
                    )
                ],
                source_basis="metadata_only",
                transparency_note=(
                    "This is AI-assisted synthetic dry-run content and must not be treated "
                    "as scientific evidence."
                ),
                quality_warnings=["No external sources were searched."],
                content_markdown="# Dry-run briefing\n\nLorem ipsum dolor sit amet.",
            ),
        )
        return RadarClientResult(
            output=output,
            response_id="dry-run-response",
            model_name=self.model_name,
        )


def build_radar_client(settings: Settings) -> RadarClient:
    if settings.radar_dry_run:
        return DryRunRadarClient()
    if settings.openai_api_key is None:
        raise RadarNotConfiguredError(
            "OpenAI is not configured. Set OPENAI_API_KEY or enable RADAR_DRY_RUN."
        )
    return OpenAIRadarClient(
        api_key=settings.openai_api_key.get_secret_value(),
        model_name=settings.openai_radar_model,
    )
