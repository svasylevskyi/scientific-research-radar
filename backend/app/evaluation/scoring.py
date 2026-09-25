"""Compare saved verdicts with human labels, with explicit missing-data denominators."""

from collections import Counter
from typing import Any

from app.evaluation.models import Benchmark, Candidate, Criteria, Reviews, Split, fingerprint, unique

VERDICTS = ("supported", "contradicted", "insufficient_evidence")


def validate_bindings(benchmark: Benchmark, records: Reviews | Candidate) -> None:
    if records.benchmark_sha256 != fingerprint(benchmark):
        raise ValueError("Benchmark fingerprint changed; recreate the packet and re-review changed inputs")
    rows = records.records if isinstance(records, Reviews) else records.judgments
    unique([row.case_id for row in rows], "review/judgment case IDs")
    cases = {case.id: case for case in benchmark.cases}
    for row in rows:
        case = cases.get(row.case_id)
        if case is None or row.case_sha256 != benchmark.case_hash(case):
            raise ValueError(f"Unknown or changed case: {row.case_id}")
        if isinstance(records, Reviews) and not set(row.evidence_passage_ids).issubset(benchmark.passages_for(case)):
            raise ValueError(f"Human review references evidence outside case {row.case_id}")


def ratio(numerator: int, denominator: int) -> float | None:
    return numerator / denominator if denominator else None


def metrics(rows: list[dict[str, Any]]) -> dict[str, Any]:
    counts = {label: {prediction: 0 for prediction in (*VERDICTS, "abstain", "missing")} for label in VERDICTS}
    for row in rows:
        counts[row["expected"]][row["predicted"]] += 1
    total = len(rows)
    positive = [row for row in rows if row["expected"] == "supported"]
    negative = [row for row in rows if row["expected"] != "supported"]
    critical = [row for row in negative if row["severity"] == "critical"]
    invalid_evidence = sum(row["references_valid"] is False for row in rows)
    false_acceptances = sum(row["predicted"] == "supported" for row in negative)
    return {
        "cases": total,
        "correct": sum(row["correct"] for row in rows),
        "accuracy": ratio(sum(row["correct"] for row in rows), total),
        "verdict_accuracy": ratio(sum(row["expected"] == row["predicted"] for row in rows), total),
        "prediction_coverage": ratio(sum(row["predicted"] in VERDICTS for row in rows), total),
        "missing": sum(row["predicted"] == "missing" for row in rows),
        "abstentions": sum(row["predicted"] == "abstain" for row in rows),
        "invalid_evidence_references": invalid_evidence,
        "supported_cases": len(positive),
        "unsupported_cases": len(negative),
        "false_acceptances": false_acceptances,
        "false_acceptance_rate": ratio(false_acceptances, len(negative)),
        "false_rejections": sum(row["predicted"] in {"contradicted", "insufficient_evidence"} for row in positive),
        "false_rejection_rate": ratio(sum(row["predicted"] in {"contradicted", "insufficient_evidence"} for row in positive), len(positive)),
        "unsupported_detection_rate": ratio(sum(row["predicted"] in {"contradicted", "insufficient_evidence"} for row in negative), len(negative)),
        "critical_unsupported_cases": len(critical),
        "critical_false_acceptances": sum(row["predicted"] == "supported" for row in critical),
        "confusion_matrix": counts,
    }


def score_candidate(benchmark: Benchmark, reviews: Reviews, candidate: Candidate, split: Split) -> dict[str, Any]:
    validate_bindings(benchmark, reviews)
    validate_bindings(benchmark, candidate)
    labels = {review.case_id: review for review in reviews.records}
    predictions = {row.case_id: row for row in candidate.judgments}
    selected = [case for case in benchmark.cases if case.split == split]
    rows: list[dict[str, Any]] = []
    families: set[str] = set()
    for case in selected:
        label = labels.get(case.id)
        prediction = predictions.get(case.id)
        reviewed = label is not None and label.status == "approved"
        evidence_valid = None
        if prediction is not None:
            evidence_valid = set(prediction.evidence_passage_ids).issubset(benchmark.passages_for(case))
            if prediction.verdict in {"supported", "contradicted"}:
                evidence_valid = evidence_valid and bool(prediction.evidence_passage_ids)
        sources = [source for source in benchmark.sources if source.id in case.source_ids]
        if reviewed:
            families.update(source.family for source in sources if source.kind == "arxiv_abstract")
        expected = label.verdict if reviewed and label else None
        predicted = prediction.verdict if prediction else "missing"
        rows.append({
            "case_id": case.id, "scope": case.scope, "tags": case.tags, "severity": case.severity,
            "source_kind": "real" if sources and all(s.kind == "arxiv_abstract" for s in sources) else "synthetic_or_unavailable",
            "review_status": label.status if label else "pending", "expected": expected, "predicted": predicted,
            "references_valid": evidence_valid,
            "correct": reviewed and expected == predicted and evidence_valid is True,
            "rationale": prediction.rationale if prediction else None,
        })
    scored = [row for row in rows if row["review_status"] == "approved"]
    judgments = [predictions[case.id] for case in selected if case.id in predictions]
    grouped = {}
    for group in ("scope", "source_kind"):
        grouped[group] = {key: metrics([r for r in scored if r[group] == key]) for key in sorted({r[group] for r in scored})}
    grouped["tag"] = {tag: metrics([r for r in scored if tag in r["tags"]]) for tag in sorted({tag for r in scored for tag in r["tags"]})}
    return {
        "candidate_id": candidate.candidate_id,
        "method": candidate.method, "model": candidate.model, "prompt_version": candidate.prompt_version,
        "evaluator_version": candidate.evaluator_version,
        "selected_cases": len(selected), "approved_cases": len(scored),
        "pending_cases": sum(row["review_status"] == "pending" for row in rows),
        "excluded_cases": sum(row["review_status"] == "excluded" for row in rows),
        "reviewed_real_source_families": len(families),
        "metrics": metrics(scored), "breakdowns": grouped, "cases": rows,
        "recorded_cost_usd": sum(j.cost_usd for j in judgments if j.cost_usd is not None) if any(j.cost_usd is not None for j in judgments) else None,
        "cost_records_missing": sum(j.cost_usd is None for j in judgments),
        "recorded_latency_seconds": sum(j.latency_seconds for j in judgments if j.latency_seconds is not None) if any(j.latency_seconds is not None for j in judgments) else None,
        "latency_records_missing": sum(j.latency_seconds is None for j in judgments),
    }


def evaluate(benchmark: Benchmark, reviews: Reviews, candidate: Candidate, criteria: Criteria,
             *, split: Split, baseline: Candidate | None = None) -> dict[str, Any]:
    current = score_candidate(benchmark, reviews, candidate, split)
    comparison: dict[str, Any] | None = None
    if baseline is not None:
        prior = score_candidate(benchmark, reviews, baseline, split)
        previous = {row["case_id"]: row for row in prior["cases"]}
        regressions = [row["case_id"] for row in current["cases"] if previous[row["case_id"]]["correct"] and not row["correct"]]
        improvements = [row["case_id"] for row in current["cases"] if row["correct"] and not previous[row["case_id"]]["correct"]]
        accuracy, old_accuracy = current["metrics"]["accuracy"], prior["metrics"]["accuracy"]
        comparison = {"baseline": prior, "regressions": regressions, "improvements": improvements,
                      "accuracy_delta": accuracy - old_accuracy if accuracy is not None and old_accuracy is not None else None}
    stats = current["metrics"]
    readiness = []
    if criteria.status != "approved":
        readiness.append("Acceptance criteria still require human approval")
    if current["pending_cases"]:
        readiness.append("Selected cases still require human review")
    if current["approved_cases"] < criteria.minimum_reviewed_cases:
        readiness.append("Too few human-reviewed cases")
    if current["reviewed_real_source_families"] < criteria.minimum_source_families:
        readiness.append("Too few reviewed real-paper families")
    expected = Counter(row["expected"] for row in current["cases"] if row["review_status"] == "approved")
    if any(not expected[label] for label in VERDICTS):
        readiness.append("Human labels must cover all three verdicts")
    if not stats["critical_unsupported_cases"]:
        readiness.append("No approved critical unsupported case")
    if not stats["prediction_coverage"]:
        readiness.append("No substantive candidate verdicts are available")
    failures = []
    for key, threshold, direction in (
        ("prediction_coverage", criteria.minimum_prediction_coverage, "minimum"),
        ("accuracy", criteria.minimum_accuracy, "minimum"),
        ("false_acceptance_rate", criteria.maximum_false_acceptance_rate, "maximum"),
    ):
        value = stats[key]
        if value is not None and (value < threshold if direction == "minimum" else value > threshold):
            failures.append(f"{key} violates {direction} {threshold:g}")
    if stats["critical_false_acceptances"]:
        failures.append("Critical unsupported claims were accepted; aggregate accuracy cannot override this")
    if stats["invalid_evidence_references"]:
        failures.append("Reviewer judgments contain missing or invalid required evidence references")
    if comparison and len(comparison["regressions"]) > criteria.maximum_regressions:
        failures.append("Candidate exceeds the allowed regression count")
    return {
        "schema_version": "1", "benchmark_id": benchmark.id, "benchmark_version": benchmark.version,
        "benchmark_sha256": fingerprint(benchmark), "reviews_sha256": fingerprint(reviews),
        "candidate_sha256": fingerprint(candidate), "criteria_sha256": fingerprint(criteria),
        "baseline_sha256": fingerprint(baseline) if baseline else None,
        "split": split, "decision": "not_ready" if readiness else "fail" if failures else "pass",
        "readiness_reasons": readiness, "failures": failures, "criteria": criteria.model_dump(mode="json"),
        "candidate": current, "comparison": comparison,
        "limitations": [
            "This compares saved reviewer verdicts with supplied human labels; it makes no model or network calls.",
            "A benchmark pass is not product launch approval or proof of scientific truth.",
            "Reference validity is structural; semantic correctness depends on the human-approved labels.",
            "Cost and latency are caller-supplied measurements; missing values are unknown, not zero.",
            "Usefulness, relevance and discovery recall require separate reader and digest-level evaluation.",
        ],
    }
