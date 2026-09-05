from dataclasses import dataclass
from typing import Protocol

from app.core.config import Settings
from app.radar.contracts import RadarOutput
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
    def __init__(
        self,
        *,
        api_key: str,
        model_name: str,
        reasoning_effort: str,
        timeout_seconds: float,
        max_output_tokens: int,
    ) -> None:
        self.api_key = api_key
        self.model_name = model_name
        self.reasoning_effort = reasoning_effort
        self.timeout_seconds = timeout_seconds
        self.max_output_tokens = max_output_tokens

    def execute(self, prompt: RadarPrompt) -> RadarClientResult:
        try:
            from openai import OpenAI

            client = OpenAI(
                api_key=self.api_key,
                timeout=self.timeout_seconds,
                max_retries=0,
            )
            response = client.responses.parse(
                model=self.model_name,
                reasoning={"effort": self.reasoning_effort},
                tools=[{"type": "web_search", "search_context_size": "high"}],
                tool_choice="required",
                input=[
                    {"role": "system", "content": prompt.system},
                    {"role": "user", "content": prompt.user},
                ],
                max_output_tokens=self.max_output_tokens,
                store=False,
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


def build_radar_client(settings: Settings) -> RadarClient:
    if settings.openai_api_key is None:
        raise RadarNotConfiguredError(
            "OpenAI is not configured. Set OPENAI_API_KEY before running a digest."
        )
    return OpenAIRadarClient(
        api_key=settings.openai_api_key.get_secret_value(),
        model_name=settings.openai_radar_model,
        reasoning_effort=settings.openai_radar_reasoning_effort,
        timeout_seconds=settings.openai_request_timeout_seconds,
        max_output_tokens=settings.openai_radar_max_output_tokens,
    )
