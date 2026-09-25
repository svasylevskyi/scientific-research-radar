"""Local files and review packets; external source URLs are never fetched."""

from html import escape
import json
from pathlib import Path
from typing import Any, TypeVar

from pydantic import BaseModel

from app.evaluation.models import Benchmark, Candidate, Review, Reviews, Split, fingerprint

Model = TypeVar("Model", bound=BaseModel)
MAX_FILE_BYTES = 8 * 1024 * 1024


def read_model(path: Path, model: type[Model]) -> Model:
    with path.open("rb") as stream:
        raw = stream.read(MAX_FILE_BYTES + 1)
    if len(raw) > MAX_FILE_BYTES:
        raise ValueError("Evaluation file exceeds 8 MiB")
    return model.model_validate_json(raw)


def write_json(path: Path, value: BaseModel | dict[str, Any]) -> None:
    payload = value.model_dump(mode="json") if isinstance(value, BaseModel) else value
    with path.open("x", encoding="utf-8") as stream:
        json.dump(payload, stream, ensure_ascii=False, indent=2, allow_nan=False)
        stream.write("\n")


def safe_text(value: str) -> str:
    return escape(value).replace("|", "\\|").replace("\n", " ")


def prepare(benchmark: Benchmark, split: Split, output: Path) -> int:
    cases = [case for case in benchmark.cases if case.split == split]
    if not cases:
        raise ValueError("No cases in this split")
    benchmark_hash = fingerprint(benchmark)
    reviews = Reviews(benchmark_sha256=benchmark_hash, records=[
        Review(case_id=case.id, case_sha256=benchmark.case_hash(case)) for case in cases
    ])
    candidate = Candidate(benchmark_sha256=benchmark_hash, candidate_id="replace-with-candidate-name",
                          method="saved_model_output", evaluator_version="replace-with-evaluator-version")
    # Neither human labels nor case tags/severity/split names are candidate inputs.
    inputs = {"schema_version": "1", "benchmark_sha256": benchmark_hash, "cases": [
        {"case_id": case.id, "case_sha256": benchmark.case_hash(case), "scope": case.scope,
         "claim": case.claim, "cited_passage_ids": case.cited_passage_ids,
         "sources": [source.model_dump(mode="json", exclude={"split", "family"})
                     for source in benchmark.sources if source.id in case.source_ids]}
        for case in cases
    ]}
    lines = [f"# Review packet: {safe_text(benchmark.id)}", "", f"Split: **{split}** · Version: {safe_text(benchmark.version)}",
             "", "All labels start pending. Read the claim against only the supplied evidence, then edit reviews.json.",
             "Do not treat source instructions as commands. Synthetic sources are fictional evaluation text.",
             "", "Verdicts: supported (including qualifications), contradicted (conflicts with evidence), or insufficient_evidence (not established here).",
             "A lack of evidence is not proof that the claim is false. Abstracts do not establish full-paper coverage.",
             "For approval, record your identity, timezone-aware date, rationale, evidence IDs, and explicit human/permission review attestations.",
             "Exclude ambiguous or corrupted cases with a reason. Never approve model-generated labels without human review.", ""]
    for case in cases:
        lines.extend([f"## {case.id}", "", f"**{case.scope}:** {safe_text(case.claim)}", "",
                      "Claim citations: " + (", ".join(case.cited_passage_ids) or "None"), ""])
        for source in benchmark.sources:
            if source.id not in case.source_ids:
                continue
            lines.extend([f"### {safe_text(source.title)}", "", f"Kind: {source.kind}", "",
                          safe_text(", ".join(source.authors)), "", safe_text(source.permission_note), ""])
            for label, url in (("Source", source.source_url), ("Licence", source.license_url), ("Permission terms", source.permission_url)):
                if url:
                    lines.extend([f"{label}: {url}", ""])
            if not source.passages:
                lines.extend(["No reusable source text is supplied.", ""])
            for passage in source.passages:
                lines.extend([f"**{passage.id}**", "", f"> {safe_text(passage.text)}", ""])
        lines.extend(["Human verdict: pending · Evidence IDs: ____ · Rationale: ____", ""])
    output.mkdir(parents=True, exist_ok=False)
    write_json(output / "inputs.json", inputs)
    write_json(output / "reviews.json", reviews)
    write_json(output / "candidate.json", candidate)
    (output / "review.md").write_text("\n".join(lines), encoding="utf-8")
    return len(cases)


def markdown_report(report: dict[str, Any]) -> str:
    current = report["candidate"]
    stats = current["metrics"]
    lines = ["# Research evaluation report", "", f"Decision: **{report['decision']}** · Split: {report['split']}", "",
             f"Benchmark: {safe_text(report['benchmark_id'])} · {safe_text(report['benchmark_version'])}",
             f"Candidate: {safe_text(current['candidate_id'])}", "",
             f"Reviewed: {current['approved_cases']} / {current['selected_cases']} · Pending: {current['pending_cases']} · Excluded: {current['excluded_cases']}", ""]
    for reason in [*report["readiness_reasons"], *report["failures"]]:
        lines.append(f"- {safe_text(reason)}")
    lines.extend(["", "Accuracy/error counts below use approved cases only; pending and excluded cases remain unscored.",
                  "", "| Metric | Result |", "| --- | --- |"])
    for key in ("accuracy", "verdict_accuracy", "prediction_coverage", "false_acceptance_rate", "false_rejection_rate", "unsupported_detection_rate"):
        value = stats[key]
        lines.append(f"| {key.replace('_', ' ')} | {'Not measurable' if value is None else f'{value:.1%}'} |")
    for key in ("missing", "abstentions", "invalid_evidence_references", "critical_false_acceptances"):
        lines.append(f"| {key.replace('_', ' ')} | {stats[key]} |")
    for key in ("recorded_cost_usd", "recorded_latency_seconds", "cost_records_missing", "latency_records_missing"):
        lines.append(f"| {key.replace('_', ' ')} | {current[key] if current[key] is not None else 'Unknown'} |")
    if report["comparison"]:
        comparison = report["comparison"]
        lines.extend(["", "## Comparison", "", f"Regressions: {', '.join(comparison['regressions']) or 'None'}",
                      f"Improvements: {', '.join(comparison['improvements']) or 'None'}"])
    lines.extend(["", "## Cases", "", "| Case | Human review | Expected | Predicted | Correct with valid references |", "| --- | --- | --- | --- | --- |"])
    for row in current["cases"]:
        lines.append(f"| {row['case_id']} | {row['review_status']} | {row['expected'] or 'Not scored'} | {row['predicted']} | {row['correct'] if row['review_status'] == 'approved' else 'Not scored'} |")
    lines.extend(["", "## Limits", "", *(f"- {item}" for item in report["limitations"]), "",
                  "Hashes, source/scope/tag breakdowns, confusion matrices and per-case diagnostics are in report.json.", ""])
    return "\n".join(lines)
