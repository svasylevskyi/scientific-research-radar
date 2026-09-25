"""Offline CLI. No API credentials, database, network, or model client required."""

import argparse
import json
from pathlib import Path
import sys

from pydantic import ValidationError

from app.evaluation.files import markdown_report, prepare, read_model, write_json
from app.evaluation.models import Benchmark, Candidate, Criteria, Reviews, fingerprint
from app.evaluation.scoring import evaluate, validate_bindings


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    for name in ("validate", "prepare", "evaluate"):
        command = commands.add_parser(name)
        command.add_argument("--benchmark", type=Path, required=True)
        if name != "validate":
            command.add_argument("--split", choices=("development", "heldout"), default="development")
            command.add_argument("--output", type=Path, required=True, help="New directory; existing files are never overwritten")
        if name in {"validate", "evaluate"}:
            command.add_argument("--reviews", type=Path, required=name == "evaluate")
        if name == "evaluate":
            command.add_argument("--candidate", type=Path, required=True)
            command.add_argument("--criteria", type=Path, required=True)
            command.add_argument("--baseline", type=Path)
    args = parser.parse_args(argv)
    try:
        benchmark = read_model(args.benchmark, Benchmark)
        if args.command == "validate":
            if args.reviews:
                validate_bindings(benchmark, read_model(args.reviews, Reviews))
            print(json.dumps({"structurally_valid": True, "benchmark_sha256": fingerprint(benchmark),
                              "cases": len(benchmark.cases), "sources": len(benchmark.sources),
                              "notice": "Structural validation is not human approval or scientific evaluation."}))
            return 0
        if args.command == "prepare":
            count = prepare(benchmark, args.split, args.output)
            print(f"Prepared {count} cases in {args.output}. Human labels are pending; no model calls were made.")
            return 0
        report = evaluate(benchmark, read_model(args.reviews, Reviews), read_model(args.candidate, Candidate),
                          read_model(args.criteria, Criteria), split=args.split,
                          baseline=read_model(args.baseline, Candidate) if args.baseline else None)
        args.output.mkdir(parents=True, exist_ok=False)
        write_json(args.output / "report.json", report)
        (args.output / "report.md").write_text(markdown_report(report), encoding="utf-8")
        print(f"Benchmark decision: {report['decision']}. Report: {args.output / 'report.md'}")
        return {"pass": 0, "fail": 1, "not_ready": 2}[report["decision"]]
    except (ValidationError, ValueError, OSError) as exc:
        # Do not echo source/claim text from Pydantic errors into CI logs.
        message = "; ".join(f"{'.'.join(map(str, e['loc']))}: {e['msg']}" for e in exc.errors(include_input=False)) if isinstance(exc, ValidationError) else str(exc)
        print(f"Evaluation input error: {message}", file=sys.stderr)
        return 3


if __name__ == "__main__":
    raise SystemExit(main())
