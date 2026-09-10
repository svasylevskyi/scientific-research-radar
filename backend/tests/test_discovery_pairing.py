import copy
import pytest
from pydantic import ValidationError
from app.radar.contracts import DiscoveryResponse, DiscoveryRelevanceOutput
from app.models.digest_run import DigestRun, DigestRunStage, DigestRunStageType, DigestRunStageStatus, DigestRunStatus
from app.repositories.digest_run_repository import DigestRunRepository
from test_digest_runs import _stage_output


def wire_payload(count=1):
    output = _stage_output(DiscoveryRelevanceOutput)
    paper = output.search.papers[0].model_dump(mode="json")
    assessment = output.relevance.assessments[0].model_dump(mode="json", exclude={"external_id"})
    return {"search": output.search.model_dump(mode="json", exclude={"papers"}),
            "papers": [{"paper": {**paper, "external_id": f"doi:10.1234/paper-{i}"},
                        "assessment": copy.deepcopy(assessment)} for i in range(count)],
            **output.relevance.model_dump(mode="json", exclude={"assessments"})}


@pytest.mark.parametrize("count", [0, 1, 15])
def test_each_wire_paper_has_exactly_one_internal_assessment(count):
    output = DiscoveryResponse.model_validate(wire_payload(count)).to_output()
    assert len(output.search.papers) == count
    assert [p.external_id for p in output.search.papers] == [a.external_id for a in output.relevance.assessments]
    assert DiscoveryRelevanceOutput.model_validate_json(output.model_dump_json()) == output


def test_assessment_cannot_be_missing_or_target_another_paper():
    payload = wire_payload()
    del payload["papers"][0]["assessment"]
    with pytest.raises(ValidationError): DiscoveryResponse.model_validate(payload)
    payload = wire_payload()
    payload["papers"][0]["assessment"]["external_id"] = "other-paper"
    with pytest.raises(ValidationError): DiscoveryResponse.model_validate(payload)


def test_duplicate_papers_and_invalid_scores_still_fail():
    payload = wire_payload(2)
    payload["papers"][1]["paper"]["external_id"] = payload["papers"][0]["paper"]["external_id"]
    with pytest.raises(ValidationError, match="unique external"):
        DiscoveryResponse.model_validate(payload).to_output()
    payload = wire_payload()
    payload["papers"][0]["assessment"]["score"] = 101
    with pytest.raises(ValidationError): DiscoveryResponse.model_validate(payload)


def test_legacy_failure_retry_discards_rejected_response():
    stage = DigestRunStage(stage=DigestRunStageType.DISCOVERY_RELEVANCE,
        status=DigestRunStageStatus.FAILED, active_response_id="rejected-job",
        error_message="Discovery relevance failed: The OpenAI discovery_relevance request failed: 1 validation error for DiscoveryRelevanceOutput Value error, Every searched paper must have one relevance assessment")
    run = DigestRun(status=DigestRunStatus.FAILED, stages=[stage])
    DigestRunRepository(None).requeue_failed(run=run)
    assert stage.active_response_id is None
    assert stage.status == DigestRunStageStatus.PENDING


def test_completed_invalid_response_preserves_usage_and_clears_retry_id(monkeypatch):
    from types import SimpleNamespace
    import openai
    from app.core.config import Settings
    from app.radar.client import build_radar_client, RadarClientError
    from app.radar.prompt_builder import RadarPrompt
    payload = wire_payload(2)
    payload["papers"][1]["paper"]["external_id"] = payload["papers"][0]["paper"]["external_id"]
    response = SimpleNamespace(id="invalid-completed", status="completed",
        output_parsed=DiscoveryResponse.model_validate(payload), output=[],
        usage=SimpleNamespace(input_tokens=100, output_tokens=50))
    monkeypatch.setattr(openai, "OpenAI", lambda **kwargs: SimpleNamespace(
        responses=SimpleNamespace(parse=lambda **request: response)))
    client = build_radar_client(Settings(environment="test", openai_api_key="fake-key"))
    observations, lost = [], []
    with pytest.raises(RadarClientError, match="did not pass data validation") as error:
        client.execute(RadarPrompt(stage=DigestRunStageType.DISCOVERY_RELEVANCE, system="test", user="test", version="test"),
            response_format=DiscoveryRelevanceOutput, use_web_search=True, reasoning_effort="medium",
            on_usage=observations.append, on_response_lost=lambda: lost.append(True))
    assert observations[-1]["usage"]["input_tokens"] == 100
    assert observations[-1]["response_id"] == "invalid-completed"
    assert lost == [True]
    assert "input_value" not in str(error.value)
