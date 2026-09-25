"""One bounded, non-retried OpenAI request; no browsing or background generation."""
import json
from pathlib import Path
from typing import Any

from app.core.config import Settings
from app.radar.client import OpenAIRadarClient
from app.schemas.claim_review import ClaimReviewConfig, ReviewerVerdict

PROMPT_VERSION = "claim-support-2026-09-25.1"
SYSTEM = (Path(__file__).parents[1] / "radar/prompts/claim-review-v1.md").read_text()
MAX_INPUT_BYTES = 100_000


def model_input(case: dict[str, Any]) -> str:
    return json.dumps({key: case[key] for key in ("scope", "claim", "cited_passage_ids", "sources")}, ensure_ascii=False)


def input_token_ceiling(case: dict[str, Any]) -> int:
    # Byte-count upper bound for byte-based tokenizers, plus schema and framing.
    size = len((SYSTEM + model_input(case)).encode("utf-8"))
    if size > MAX_INPUT_BYTES:
        raise ValueError("A claim and its evidence exceed the review input limit; evidence is never silently truncated.")
    return size + 8192


def request_review(settings: Settings, config: ClaimReviewConfig, case: dict[str, Any]) -> dict[str, Any]:
    from openai import OpenAI
    assert settings.openai_api_key is not None
    # Use create rather than parse so malformed/refused output still has its real
    # usage recorded before local validation. Never retry an ambiguous submission.
    with OpenAI(api_key=settings.openai_api_key.get_secret_value(), timeout=60, max_retries=0) as client:
        response = client.responses.create(model=config.model,
            input=[{"role": "system", "content": SYSTEM}, {"role": "user", "content": model_input(case)}],
            reasoning={"effort": "low"}, max_output_tokens=config.max_output_tokens,
            service_tier="default", store=False,
            text={"format": {"type": "json_schema", "name": "claim_support", "strict": True,
                            "schema": ReviewerVerdict.model_json_schema()}})
    usage = response.usage
    return {"response_id": response.id, "model_name": response.model, "status": response.status,
        "service_tier": response.service_tier,
        "usage": {**OpenAIRadarClient._usage(response).as_dict(),
            "cache_write_tokens": getattr(getattr(usage, "input_tokens_details", None), "cache_write_tokens", 0) or 0} if usage else None,
        "text": response.output_text}


def validate_verdict(text: str, case: dict[str, Any]) -> ReviewerVerdict:
    result = ReviewerVerdict.model_validate_json(text)
    allowed = {p["id"] for source in case["sources"] for p in source["passages"]}
    refs = result.evidence_passage_ids
    if len(refs) > 24 or len(refs) != len(set(refs)) or not set(refs).issubset(allowed):
        raise ValueError("Invalid evidence references")
    if result.verdict in {"supported", "contradicted"} and not refs:
        raise ValueError("Missing required evidence references")
    if not result.rationale.strip() or len(result.rationale) > 1200:
        raise ValueError("Invalid rationale")
    return result
