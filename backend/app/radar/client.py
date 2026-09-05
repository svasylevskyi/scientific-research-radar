from dataclasses import dataclass
from datetime import date
from typing import Protocol

from app.core.config import Settings
from app.radar.contracts import (
    DigestBriefing,
    PaperSummary,
    RadarOutput,
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
                        url="https://example.invalid/scientific-research-radar/dry-run-paper-001",
                        doi=None,
                        discovery_reason="Exercises search-result persistence without external traffic.",
                        matched_keywords=["dry run"],
                        citations=[],
                    )
                ],
                coverage_notes=["No external search was performed in dry-run mode."],
                next_step_recommendations=["Enable live execution after reviewing the prompts."],
            ),
            relevance=RelevanceStage(
                methodology="Deterministic placeholder scoring for workflow validation.",
                assessments=[
                    RelevanceAssessment(
                        external_id=external_id,
                        score=75,
                        rationale="Provides a stable record for exercising the radar pipeline.",
                        criteria=["Persistence coverage", "UI coverage"],
                        next_step_recommendations=["Replace with live evidence when configured."],
                    )
                ],
                recommendations=["Review the stored structure before enabling OpenAI."],
            ),
            paper_summaries=[
                PaperSummary(
                    external_id=external_id,
                    concise_summary="Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
                    key_findings=["Placeholder finding for interface validation."],
                    methods=["Deterministic dry-run fixture."],
                    limitations=["This is not a real scientific paper."],
                    implications=["The end-to-end persistence path can be reviewed safely."],
                    recommendations=["Do not treat dry-run content as scientific evidence."],
                )
            ],
            trend_analysis=TrendAnalysis(
                overview="Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
                themes=[
                    TrendTheme(
                        title="Placeholder trend",
                        summary="Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
                        evidence_external_ids=[external_id],
                        confidence="low",
                    )
                ],
                emerging_signals=["Placeholder signal"],
                contradictions=[],
                recommendations=["Run with live search before drawing conclusions."],
            ),
            digest_briefing=DigestBriefing(
                title="Dry-run research briefing",
                executive_summary="Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
                highlights=["Placeholder briefing highlight."],
                recommendations=["Review and refine the radar prompts."],
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
