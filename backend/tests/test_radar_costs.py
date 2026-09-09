from decimal import Decimal
from types import SimpleNamespace
import pytest
from pydantic import ValidationError
from app.schemas.radar_pricing import RadarPricing
from app.services.radar_cost_service import estimate
from app.radar.client import OpenAIRadarClient


def request(**changes):
    values = dict(pricing={"version": "test-v1", "input_per_million": "10",
        "cached_input_per_million": "1", "output_per_million": "50",
        "web_search_per_call": "0.01", "max_input_tokens": 272000},
        usage={"input_tokens": 1000, "cached_input_tokens": 400,
               "output_tokens": 200, "reasoning_tokens": 150},
        service_tier="default", web_search_calls=2)
    values.update(changes)
    return SimpleNamespace(**values)


def test_estimate_does_not_double_charge_cached_or_reasoning_tokens():
    assert estimate(request()) == Decimal("0.0364")


@pytest.mark.parametrize("changes", [{"pricing": None}, {"usage": None},
    {"service_tier": "priority"}, {"web_search_calls": None},
    {"usage": {"input_tokens": 300000, "cached_input_tokens": 0, "output_tokens": 1}}])
def test_unknown_and_unsupported_costs_are_not_zero(changes):
    assert estimate(request(**changes)) is None


def test_zero_usage_can_have_known_zero_cost():
    assert estimate(request(usage={"input_tokens": 0, "cached_input_tokens": 0,
                                  "output_tokens": 0}, web_search_calls=0)) == 0


def test_pricing_validation():
    p = request().pricing
    assert RadarPricing(**p).version == "test-v1"
    for invalid in [-1, "NaN", "Infinity"]:
        with pytest.raises(ValidationError):
            RadarPricing(**{**p, "input_per_million": invalid})


def test_observation_preserves_missing_usage_and_failed_response_usage():
    client = object.__new__(OpenAIRadarClient)
    client.model_name = "test-model"
    response = SimpleNamespace(id="r1", status="failed", usage=None, output=[])
    assert client._observation(response)["usage"] is None
    response.usage = SimpleNamespace(input_tokens=12, output_tokens=4,
        input_tokens_details=SimpleNamespace(cached_tokens=2),
        output_tokens_details=SimpleNamespace(reasoning_tokens=3))
    response.output = [SimpleNamespace(type="web_search_call")]
    observed = client._observation(response)
    assert observed["usage"]["output_tokens"] == 4
    assert observed["web_search_calls"] == 1
    assert observed["status"] == "failed"
