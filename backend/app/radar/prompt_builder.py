import json
from dataclasses import dataclass
from pathlib import Path
from string import Template
from typing import Any

PROMPT_VERSION = "2026-09-05.3"
PROMPT_DIRECTORY = Path(__file__).resolve().parent / "prompts"


@dataclass(frozen=True)
class RadarPrompt:
    system: str
    user: str
    version: str


class RadarPromptBuilder:
    def __init__(self, prompt_directory: Path = PROMPT_DIRECTORY) -> None:
        self.prompt_directory = prompt_directory

    def build(
        self,
        *,
        digest_snapshot: dict[str, Any],
        history_context: list[dict[str, Any]],
    ) -> RadarPrompt:
        system_prompt = self._read("system.md")
        run_template = Template(self._read("radar_run.md"))
        user_prompt = run_template.substitute(
            digest_json=json.dumps(digest_snapshot, indent=2, ensure_ascii=False),
            history_json=json.dumps(history_context, indent=2, ensure_ascii=False),
        )
        return RadarPrompt(
            system=system_prompt.strip(),
            user=user_prompt.strip(),
            version=PROMPT_VERSION,
        )

    def _read(self, filename: str) -> str:
        return (self.prompt_directory / filename).read_text(encoding="utf-8")
