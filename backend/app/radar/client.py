from dataclasses import dataclass
import time
from collections.abc import Callable
from typing import Generic, Protocol, TypeVar

from pydantic import BaseModel

from app.core.config import Settings
from app.radar.prompt_builder import RadarPrompt


class RadarClientError(RuntimeError):
    pass


class RadarNotConfiguredError(RadarClientError):
    pass


OutputT = TypeVar("OutputT", bound=BaseModel)


@dataclass(frozen=True)
class RadarTokenUsage:
    input_tokens: int = 0
    cached_input_tokens: int = 0
    output_tokens: int = 0
    reasoning_tokens: int = 0

    def as_dict(self) -> dict[str, int]:
        return {
            "input_tokens": self.input_tokens,
            "cached_input_tokens": self.cached_input_tokens,
            "output_tokens": self.output_tokens,
            "reasoning_tokens": self.reasoning_tokens,
        }


@dataclass(frozen=True)
class RadarClientResult(Generic[OutputT]):
    output: OutputT
    response_id: str | None
    model_name: str
    usage: RadarTokenUsage


class RadarClient(Protocol):
    model_name: str

    def execute(
        self,
        prompt: RadarPrompt,
        *,
        response_format: type[OutputT],
        use_web_search: bool,
        reasoning_effort: str,
        existing_response_id: str | None = None,
        on_response_started: Callable[[str], None] | None = None,
        on_response_lost: Callable[[], None] | None = None,
        on_poll: Callable[[], None] | None = None,
    ) -> RadarClientResult[OutputT]: ...


class OpenAIRadarClient:
    def __init__(
        self,
        *,
        api_key: str,
        model_name: str,
        request_timeout_seconds: float,
        background_poll_timeout_seconds: float,
        background_poll_interval_seconds: float,
        max_output_tokens: int,
        max_search_tool_calls: int,
        search_context_size: str,
    ) -> None:
        self.api_key = api_key
        self.model_name = model_name
        self.request_timeout_seconds = request_timeout_seconds
        self.background_poll_timeout_seconds = background_poll_timeout_seconds
        self.background_poll_interval_seconds = background_poll_interval_seconds
        self.max_output_tokens = max_output_tokens
        self.max_search_tool_calls = max_search_tool_calls
        self.search_context_size = search_context_size

    def execute(
        self,
        prompt: RadarPrompt,
        *,
        response_format: type[OutputT],
        use_web_search: bool,
        reasoning_effort: str,
        existing_response_id: str | None = None,
        on_response_started: Callable[[str], None] | None = None,
        on_response_lost: Callable[[], None] | None = None,
        on_poll: Callable[[], None] | None = None,
    ) -> RadarClientResult[OutputT]:
        try:
            from openai import OpenAI

            client = OpenAI(
                api_key=self.api_key,
                timeout=self.request_timeout_seconds,
                max_retries=0,
            )
            request: dict = {
                "model": self.model_name,
                "reasoning": {"effort": reasoning_effort},
                "input": [
                    {"role": "system", "content": prompt.system},
                    {"role": "user", "content": prompt.user},
                ],
                "max_output_tokens": self.max_output_tokens,
                "background": True,
                "store": False,
                "prompt_cache_key": f"scientific-radar-{prompt.version}",
                "text_format": response_format,
            }
            if use_web_search:
                request.update(
                    tools=[
                        {
                            "type": "web_search",
                            "search_context_size": self.search_context_size,
                        }
                    ],
                    tool_choice="required",
                    max_tool_calls=self.max_search_tool_calls,
                )

            response = None
            if existing_response_id:
                try:
                    response = client.responses.retrieve(existing_response_id)
                except Exception as exc:
                    if getattr(exc, "status_code", None) != 404:
                        raise
                    if on_response_lost:
                        on_response_lost()
            if response is None:
                response = client.responses.parse(**request)
                if on_response_started:
                    on_response_started(response.id)
            deadline = time.monotonic() + self.background_poll_timeout_seconds
            transient_poll_failures = 0
            while response.status in {"queued", "in_progress"}:
                if time.monotonic() >= deadline:
                    raise RadarClientError(
                        f"OpenAI {prompt.stage.value} exceeded the background time limit"
                    )
                time.sleep(self.background_poll_interval_seconds)
                if on_poll:
                    on_poll()
                try:
                    response = client.responses.retrieve(response.id)
                    transient_poll_failures = 0
                except Exception:
                    transient_poll_failures += 1
                    if transient_poll_failures >= 3:
                        raise

            if response.status != "completed":
                detail = self._response_failure_detail(response)
                if on_response_lost:
                    on_response_lost()
                raise RadarClientError(
                    f"OpenAI {prompt.stage.value} ended with status "
                    f"{response.status}: {detail}"
                )

            parsed = getattr(response, "output_parsed", None)
            if parsed is None:
                output_text = getattr(response, "output_text", "")
                if not output_text:
                    if on_response_lost:
                        on_response_lost()
                    raise RadarClientError(
                        f"OpenAI {prompt.stage.value} returned no structured data"
                    )
                try:
                    parsed = response_format.model_validate_json(output_text)
                except Exception:
                    if on_response_lost:
                        on_response_lost()
                    raise
        except RadarClientError:
            raise
        except Exception as exc:
            raise RadarClientError(
                f"The OpenAI {prompt.stage.value} request failed: {exc}"
            ) from exc

        return RadarClientResult(
            output=parsed,
            response_id=response.id,
            model_name=self.model_name,
            usage=self._usage(response),
        )

    @staticmethod
    def _response_failure_detail(response) -> str:
        error = getattr(response, "error", None)
        if error is not None and getattr(error, "message", None):
            return str(error.message)
        incomplete = getattr(response, "incomplete_details", None)
        if incomplete is not None and getattr(incomplete, "reason", None):
            return str(incomplete.reason)
        return "No additional details were returned"

    @staticmethod
    def _usage(response) -> RadarTokenUsage:
        usage = getattr(response, "usage", None)
        if usage is None:
            return RadarTokenUsage()
        input_details = getattr(usage, "input_tokens_details", None)
        output_details = getattr(usage, "output_tokens_details", None)
        return RadarTokenUsage(
            input_tokens=getattr(usage, "input_tokens", 0) or 0,
            cached_input_tokens=getattr(input_details, "cached_tokens", 0) or 0,
            output_tokens=getattr(usage, "output_tokens", 0) or 0,
            reasoning_tokens=getattr(output_details, "reasoning_tokens", 0) or 0,
        )


def build_radar_client(settings: Settings) -> RadarClient:
    if settings.openai_api_key is None:
        raise RadarNotConfiguredError(
            "OpenAI is not configured. Set OPENAI_API_KEY before running a digest."
        )
    return OpenAIRadarClient(
        api_key=settings.openai_api_key.get_secret_value(),
        model_name=settings.openai_radar_model,
        request_timeout_seconds=settings.openai_request_timeout_seconds,
        background_poll_timeout_seconds=settings.openai_background_poll_timeout_seconds,
        background_poll_interval_seconds=settings.openai_background_poll_interval_seconds,
        max_output_tokens=settings.openai_radar_max_output_tokens,
        max_search_tool_calls=settings.openai_radar_max_search_tool_calls,
        search_context_size=settings.openai_radar_search_context_size,
    )
