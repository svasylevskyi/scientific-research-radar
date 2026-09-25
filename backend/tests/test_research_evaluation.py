"""All approval records here are simulated test data, never benchmark human labels."""

from copy import deepcopy
from datetime import datetime, timezone
import json
from pathlib import Path
import socket

import pytest
from pydantic import ValidationError

from app.evaluation.__main__ import main
from app.evaluation.files import prepare, read_model
from app.evaluation.models import Benchmark, Candidate, Criteria, Review, Reviews, fingerprint
from app.evaluation.scoring import evaluate, validate_bindings

BENCHMARK = Path(__file__).resolve().parents[1] / "evaluation/benchmarks/research_support_v1.json"
CRITERIA = BENCHMARK.with_name("criteria.example.json")
NOW = datetime(2026, 9, 25, tzinfo=timezone.utc)


def simulated_review_files():
    raw = json.loads(BENCHMARK.read_text())
    raw["sources"] = raw["sources"][:1]
    raw["cases"] = raw["cases"][:3]
    benchmark = Benchmark.model_validate(raw)
    labels = ("supported", "contradicted", "insufficient_evidence")
    records = [dict(case_id=case.id, case_sha256=benchmark.case_hash(case), status="approved", verdict=label,
                    evidence_passage_ids=["s01.abstract"], reviewer="Simulated test reviewer",
                    reviewed_at=NOW, rationale="Unit-test approval only, not a real human assessment.",
                    human_reviewed=True, permissions_checked=True) for case, label in zip(benchmark.cases, labels)]
    reviews = Reviews(benchmark_sha256=fingerprint(benchmark), records=records)
    candidate = Candidate(benchmark_sha256=fingerprint(benchmark), candidate_id="unit-test-only", method="test_fixture",
                          evaluator_version="test-1", judgments=[
        {"case_id": r["case_id"], "case_sha256": r["case_sha256"], "verdict": r["verdict"],
         "evidence_passage_ids": r["evidence_passage_ids"], "rationale": "Test verdict"} for r in records])
    criteria = Criteria(status="approved", reviewer="Simulated policy approver", reviewed_at=NOW,
                        rationale="Unit-test policy, not a release policy", minimum_reviewed_cases=3,
                        minimum_source_families=1)
    return benchmark, reviews, candidate, criteria


def test_real_seed_is_structural_only_and_cleans_metadata_artifacts():
    benchmark = read_model(BENCHMARK, Benchmark)
    assert len(benchmark.cases) == 36
    assert sum(s.kind == "arxiv_abstract" for s in benchmark.sources) == 10
    assert len(next(s for s in benchmark.sources if s.id == "s05").authors) == 31
    assert all("【" not in p.text and "this http URL" not in p.text for s in benchmark.sources for p in s.passages)
    assert read_model(CRITERIA, Criteria).status == "draft"
    assert not any("verdict" in c.model_dump() for c in benchmark.cases)
    seed = json.loads((Path(__file__).parent / "fixtures/source_content/arxiv_benchmark.json").read_text())
    for original, source in zip(seed, benchmark.sources[:10]):
        assert source.authors == original["authors"]
        assert source.title == original["title"]
        assert source.passages[0].text == original["excerpt"]


@pytest.mark.parametrize("update", [
    {"license_url": "https://creativecommons.org/licenses/by-nc/4.0/"},
    {"permission_url": "https://example.com/claim"},
    {"source_url": "https://arxiv.org/pdf/1706.03762v7"},
    {"source_url": "https://arxiv.org/abs/1706.03762"},
    {"source_url": "https://arxiv.org.example.com/abs/1706.03762v7"},
    {"family": "different-paper"}, {"authors": []},
])
def test_rejects_unapproved_or_unversioned_source_content(update):
    raw = json.loads(BENCHMARK.read_text())
    raw["sources"][0].update(update)
    with pytest.raises(ValidationError):
        Benchmark.model_validate(raw)


def test_unavailable_source_cannot_smuggle_text():
    raw = json.loads(BENCHMARK.read_text())
    source = next(s for s in raw["sources"] if s["kind"] == "unavailable")
    source["passages"] = [{"id": "private.text", "text": "Unlicensed copy"}]
    with pytest.raises(ValidationError, match="cannot retain text"):
        Benchmark.model_validate(raw)


def test_family_variants_cannot_leak_between_splits():
    raw = json.loads(BENCHMARK.read_text())
    source = deepcopy(raw["sources"][0])
    source.update(id="other-version", split="heldout", source_url="https://arxiv.org/abs/1706.03762v6")
    source["passages"][0]["id"] = "other-version.abstract"
    raw["sources"].append(source)
    with pytest.raises(ValidationError, match="paper family"):
        Benchmark.model_validate(raw)


@pytest.mark.parametrize("field,value", [("reviewer", None), ("rationale", " "), ("human_reviewed", False),
                                          ("permissions_checked", False), ("reviewed_at", datetime(2026, 9, 25)),
                                          ("evidence_passage_ids", [])])
def test_approval_requires_explicit_human_record(field, value):
    _, reviews, _, _ = simulated_review_files()
    raw = reviews.records[0].model_dump()
    raw[field] = value
    with pytest.raises(ValidationError):
        Review.model_validate(raw)


def test_changed_source_or_claim_invalidates_prior_reviews():
    benchmark, reviews, _, _ = simulated_review_files()
    benchmark.sources[0].passages[0].text += " Changed input."
    with pytest.raises(ValueError, match="fingerprint changed"):
        validate_bindings(benchmark, reviews)
    reviews.benchmark_sha256 = fingerprint(benchmark)
    with pytest.raises(ValueError, match="changed case"):
        validate_bindings(benchmark, reviews)


@pytest.mark.parametrize("kind", ["duplicate", "unknown", "wrong_evidence"])
def test_invalid_review_bindings_are_rejected(kind):
    benchmark, reviews, _, _ = simulated_review_files()
    if kind == "duplicate":
        reviews.records.append(reviews.records[0])
    elif kind == "unknown":
        reviews.records[0].case_id = "missing-case"
    else:
        reviews.records[0].evidence_passage_ids = ["another-paper.text"]
    with pytest.raises(ValueError):
        validate_bindings(benchmark, reviews)


def test_complete_matching_review_passes_only_with_approved_policy():
    benchmark, reviews, candidate, criteria = simulated_review_files()
    report = evaluate(benchmark, reviews, candidate, criteria, split="development")
    assert report["decision"] == "pass"
    assert report["candidate"]["metrics"]["accuracy"] == 1
    assert report["candidate"]["recorded_cost_usd"] is None
    assert report["candidate"]["cost_records_missing"] == 3
    criteria.status = "draft"
    assert evaluate(benchmark, reviews, candidate, criteria, split="development")["decision"] == "not_ready"


def test_pending_reviews_and_missing_verdicts_are_never_passes():
    benchmark, reviews, candidate, criteria = simulated_review_files()
    reviews.records = []
    report = evaluate(benchmark, reviews, candidate, criteria, split="development")
    assert report["decision"] == "not_ready"
    assert report["candidate"]["metrics"]["accuracy"] is None
    assert report["candidate"]["pending_cases"] == 3
    assert report["candidate"]["metrics"]["cases"] == 0


def test_critical_false_acceptance_cannot_hide_behind_relaxed_thresholds():
    benchmark, reviews, candidate, criteria = simulated_review_files()
    candidate.judgments[1].verdict = "supported"
    criteria.minimum_accuracy = 0
    criteria.maximum_false_acceptance_rate = 1
    report = evaluate(benchmark, reviews, candidate, criteria, split="development")
    stats = report["candidate"]["metrics"]
    assert stats["false_acceptance_rate"] == 0.5
    assert stats["critical_false_acceptances"] == 1
    assert report["decision"] == "fail"
    assert any("Critical" in reason for reason in report["failures"])


def test_missing_and_abstained_cases_stay_in_denominator():
    benchmark, reviews, candidate, criteria = simulated_review_files()
    candidate.judgments[1].verdict = "abstain"
    candidate.judgments.pop()
    report = evaluate(benchmark, reviews, candidate, criteria, split="development")
    stats = report["candidate"]["metrics"]
    assert stats["accuracy"] == pytest.approx(1 / 3)
    assert stats["prediction_coverage"] == pytest.approx(1 / 3)
    assert stats["missing"] == stats["abstentions"] == 1
    assert stats["unsupported_detection_rate"] == 0
    assert report["decision"] == "fail"


def test_no_candidate_verdicts_never_pass_even_with_relaxed_policy():
    benchmark, reviews, candidate, criteria = simulated_review_files()
    candidate.judgments = []
    criteria.minimum_prediction_coverage = 0
    criteria.minimum_accuracy = 0
    report = evaluate(benchmark, reviews, candidate, criteria, split="development")
    assert report["decision"] == "not_ready"
    assert report["candidate"]["metrics"]["missing"] == 3


def test_correct_verdict_with_invalid_reference_does_not_pass():
    benchmark, reviews, candidate, criteria = simulated_review_files()
    candidate.judgments[0].evidence_passage_ids = ["nonexistent.passage"]
    report = evaluate(benchmark, reviews, candidate, criteria, split="development")
    assert report["candidate"]["metrics"]["verdict_accuracy"] == 1
    assert report["candidate"]["metrics"]["accuracy"] == pytest.approx(2 / 3)
    assert report["decision"] == "fail"


def test_comparison_uses_identical_human_labels_and_names_regressions():
    benchmark, reviews, baseline, criteria = simulated_review_files()
    candidate = baseline.model_copy(deep=True)
    candidate.judgments[0].verdict = "insufficient_evidence"
    criteria.minimum_accuracy = 0
    report = evaluate(benchmark, reviews, candidate, criteria, split="development", baseline=baseline)
    assert report["comparison"]["regressions"] == ["c001"]
    assert report["comparison"]["accuracy_delta"] == pytest.approx(-1 / 3)
    assert report["candidate"]["metrics"]["false_rejection_rate"] == 1
    assert report["decision"] == "fail"
    baseline.benchmark_sha256 = "0" * 64
    with pytest.raises(ValueError, match="fingerprint"):
        evaluate(benchmark, reviews, candidate, criteria, split="development", baseline=baseline)


def test_excluded_cases_are_visible_not_counted_as_correct():
    benchmark, reviews, candidate, criteria = simulated_review_files()
    reviews.records[0].status = "excluded"
    report = evaluate(benchmark, reviews, candidate, criteria, split="development")
    assert report["candidate"]["excluded_cases"] == 1
    assert report["candidate"]["metrics"]["cases"] == 2
    assert report["decision"] == "not_ready"


@pytest.mark.parametrize("field,value", [("cost_usd", float("nan")), ("cost_usd", -1), ("latency_seconds", float("inf"))])
def test_invalid_cost_or_latency_is_rejected(field, value):
    _, _, candidate, _ = simulated_review_files()
    raw = candidate.model_dump()
    raw["judgments"][0][field] = value
    with pytest.raises(ValidationError):
        Candidate.model_validate(raw)


def test_saved_model_results_require_reproducibility_metadata():
    _, _, candidate, _ = simulated_review_files()
    raw = candidate.model_dump()
    raw["method"] = "saved_model_output"
    with pytest.raises(ValidationError, match="model and prompt"):
        Candidate.model_validate(raw)
    raw.update(model="example-model-version", prompt_version="example-prompt-version")
    assert Candidate.model_validate(raw).model == "example-model-version"


def test_review_packet_is_blind_and_does_not_overwrite(tmp_path):
    benchmark = read_model(BENCHMARK, Benchmark)
    output = tmp_path / "packet"
    assert prepare(benchmark, "development", output) == 29
    inputs = json.loads((output / "inputs.json").read_text())
    assert all(not {"verdict", "tags", "severity", "split"} & case.keys() for case in inputs["cases"])
    assert all("split" not in source for case in inputs["cases"] for source in case["sources"])
    assert all(r.status == "pending" and not r.human_reviewed for r in read_model(output / "reviews.json", Reviews).records)
    assert not read_model(output / "candidate.json", Candidate).judgments
    with pytest.raises(FileExistsError):
        prepare(benchmark, "development", output)


def test_cli_requires_no_network_database_or_credentials(tmp_path, monkeypatch, capsys):
    def blocked(*args, **kwargs):
        pytest.fail("Offline evaluation attempted network access")
    monkeypatch.setattr(socket, "create_connection", blocked)
    monkeypatch.setattr(socket.socket, "connect", blocked)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.setenv("DATABASE_URL", "deliberately-not-a-database-url")
    packet = tmp_path / "packet"
    common = ["--benchmark", str(BENCHMARK)]
    assert main(["validate", *common]) == 0
    assert main(["prepare", *common, "--output", str(packet)]) == 0
    report_dir = tmp_path / "report"
    command = ["evaluate", *common, "--reviews", str(packet / "reviews.json"), "--candidate", str(packet / "candidate.json"),
               "--criteria", str(CRITERIA), "--output", str(report_dir)]
    assert main(command) == 2
    report = json.loads((report_dir / "report.json").read_text())
    assert report["decision"] == "not_ready"
    assert "Not measurable" in (report_dir / "report.md").read_text()
    assert main(command) == 3
    assert "input error" in capsys.readouterr().err


def test_candidate_cases_from_other_split_do_not_affect_scores():
    benchmark = read_model(BENCHMARK, Benchmark)
    heldout = next(case for case in benchmark.cases if case.split == "heldout")
    candidate = Candidate(benchmark_sha256=fingerprint(benchmark), candidate_id="test", method="test_fixture", evaluator_version="test",
                          judgments=[dict(case_id=heldout.id, case_sha256=benchmark.case_hash(heldout), verdict="supported",
                                          evidence_passage_ids=heldout.cited_passage_ids, rationale="Test only", cost_usd=0.1)])
    report = evaluate(benchmark, Reviews(benchmark_sha256=fingerprint(benchmark)), candidate, Criteria(), split="development")
    assert report["candidate"]["recorded_cost_usd"] is None


def test_report_is_reproducible_and_keeps_measurement_unknowns():
    benchmark, reviews, candidate, criteria = simulated_review_files()
    candidate.judgments[0].cost_usd = 0.12
    candidate.judgments[0].latency_seconds = 3
    first = evaluate(benchmark, reviews, candidate, criteria, split="development")
    second = evaluate(benchmark, reviews, candidate, criteria, split="development")
    assert first == second
    assert first["candidate"]["recorded_cost_usd"] == 0.12
    assert first["candidate"]["recorded_latency_seconds"] == 3
    assert first["candidate"]["cost_records_missing"] == 2
    assert first["candidate"]["latency_records_missing"] == 2
