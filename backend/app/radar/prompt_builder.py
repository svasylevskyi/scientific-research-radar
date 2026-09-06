import json
from dataclasses import dataclass
from pathlib import Path
from string import Template
from typing import Any

from app.models.digest_run import DigestRunStageType

PROMPT_VERSION = "2026-09-06.1"
PROMPT_DIRECTORY = Path(__file__).resolve().parent / "prompts"


@dataclass(frozen=True)
class RadarPrompt:
    stage: DigestRunStageType
    system: str
    user: str
    version: str


class RadarPromptBuilder:
    def __init__(self, prompt_directory: Path = PROMPT_DIRECTORY) -> None:
        self.prompt_directory = prompt_directory

    def build_discovery_relevance(
        self,
        *,
        digest_snapshot: dict[str, Any],
        history_context: list[dict[str, Any]],
    ) -> RadarPrompt:
        return self._build(
            stage=DigestRunStageType.DISCOVERY_RELEVANCE,
            filename="discovery_relevance.md",
            digest_json=digest_snapshot,
            history_json=history_context,
        )

    def build_paper_summaries(
        self,
        *,
        digest_snapshot: dict[str, Any],
        papers: list[dict[str, Any]],
    ) -> RadarPrompt:
        return self._build(
            stage=DigestRunStageType.PAPER_SUMMARIES,
            filename="paper_summaries.md",
            digest_json=digest_snapshot,
            papers_json=papers,
        )

    def build_trend_analysis(
        self,
        *,
        digest_snapshot: dict[str, Any],
        history_context: list[dict[str, Any]],
        papers: list[dict[str, Any]],
    ) -> RadarPrompt:
        return self._build(
            stage=DigestRunStageType.TREND_ANALYSIS,
            filename="trend_analysis.md",
            digest_json=digest_snapshot,
            history_json=history_context,
            papers_json=papers,
        )

    def build_digest_briefing(
        self,
        *,
        digest_snapshot: dict[str, Any],
        papers: list[dict[str, Any]],
        trend_analysis: dict[str, Any],
    ) -> RadarPrompt:
        return self._build(
            stage=DigestRunStageType.DIGEST_BRIEFING,
            filename="digest_briefing.md",
            digest_json=digest_snapshot,
            papers_json=papers,
            trend_json=trend_analysis,
        )

    def _build(
        self,
        *,
        stage: DigestRunStageType,
        filename: str,
        **values: Any,
    ) -> RadarPrompt:
        rendered_values = {
            key: json.dumps(value, indent=2, ensure_ascii=False)
            for key, value in values.items()
        }
        return RadarPrompt(
            stage=stage,
            system=self._read("shared_system.md").strip(),
            user=Template(self._read(filename)).substitute(rendered_values).strip(),
            version=PROMPT_VERSION,
        )

    def _read(self, filename: str) -> str:
        return (self.prompt_directory / filename).read_text(encoding="utf-8")
