"""Select conservative PR checks and verify the final CI gate (stdlib only)."""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from typing import NamedTuple


VALIDATION_JOBS = ("deployment-config", "backend-static", "backend", "frontend", "containers")
REQUIRED_JOBS = {
    "docs": frozenset({"deployment-config"}),
    "frontend": frozenset({"deployment-config", "frontend", "containers"}),
    "full": frozenset(VALIDATION_JOBS),
}
DOCUMENTATION_FILES = frozenset({
    "README.md", "SECURITY_REVIEW.md", "backend/EMAIL.md", "infra/README.md",
})
FRONTEND_PREFIXES = ("frontend/src/", "frontend/public/", "frontend/tests/")


class Selection(NamedTuple):
    profile: str
    reason: str
    changed_file_count: int | None = None


def classify_paths(paths: list[str]) -> str:
    """Only known documentation and UI paths may omit backend regression tests."""
    if not paths:
        return "full"
    profile = "docs"
    for path in paths:
        # Reject ambiguous paths instead of normalizing them into an allowlist.
        if not path or path.startswith("/") or any(part in {"", ".", ".."} for part in path.split("/")):
            return "full"
        if path in DOCUMENTATION_FILES or (path.startswith("docs/") and path.endswith(".md")):
            continue
        if path == "frontend/index.html" or path.startswith(FRONTEND_PREFIXES):
            profile = "frontend"
            continue
        # Includes dependencies, build configuration, workflows, migrations,
        # backend prompts (even Markdown), and all newly introduced areas.
        return "full"
    return profile


def changed_paths(base_sha: str, head_sha: str, repository: Path) -> list[str]:
    for sha in (base_sha, head_sha):
        if not isinstance(sha, str) or not re.fullmatch(r"[0-9a-f]{40}", sha):
            raise ValueError("Expected full base and head commit SHAs.")

    def git(*args: str) -> bytes:
        return subprocess.run(
            ["git", *args], cwd=repository, check=True, timeout=60,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        ).stdout

    ancestors = git("merge-base", "--all", base_sha, head_sha).decode("ascii").splitlines()
    if len(ancestors) != 1 or not re.fullmatch(r"[0-9a-f]{40}", ancestors[0]):
        raise ValueError("Expected one unambiguous merge base.")
    # Read the complete PR diff, including both sides of a rename. NUL framing
    # preserves unusual filenames and avoids API pagination/file-count limits.
    diff = git("diff", "--no-ext-diff", "--no-textconv", "--no-renames",
               "--name-only", "-z", ancestors[0], head_sha, "--")
    return [os.fsdecode(path) for path in diff.split(b"\0") if path]


def select_profile(event_name: str, event_path: Path | None, repository: Path) -> Selection:
    if event_name != "pull_request":
        return Selection("full", "Every main push and non-PR event requires full validation.")
    try:
        if event_path is None:
            raise ValueError("Missing event payload.")
        event = json.loads(event_path.read_text(encoding="utf-8"))
        base_sha = event["pull_request"]["base"]["sha"]
        head_sha = event["pull_request"]["head"]["sha"]
        paths = changed_paths(base_sha, head_sha, repository)
    except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError):
        # Never turn missing history, malformed events or failed discovery into
        # skipped tests. A checkout failure itself still fails the workflow.
        return Selection("full", "Changed files could not be determined reliably; running all checks.")
    profile = classify_paths(paths)
    reasons = {
        "docs": "Only allowlisted documentation changed.",
        "frontend": "Only frontend source/assets/tests and optional documentation changed.",
        "full": "Backend, shared, configuration, unknown paths, or an empty diff require all checks.",
    }
    return Selection(profile, reasons[profile], len(paths))


def verify_results(event_name: str, needs: dict) -> str:
    """Require success for selected jobs and an explicit skip for every other job."""
    expected_keys = {"changes", *VALIDATION_JOBS}
    if not isinstance(needs, dict) or set(needs) != expected_keys:
        raise ValueError("The final gate must receive the selector and every validation job.")
    if not all(isinstance(job, dict) for job in needs.values()):
        raise ValueError("Invalid job results.")
    if needs["changes"].get("result") != "success":
        raise ValueError("Change selection did not succeed.")
    outputs = needs["changes"].get("outputs")
    profile = outputs.get("profile") if isinstance(outputs, dict) else None
    if not isinstance(profile, str) or profile not in REQUIRED_JOBS:
        raise ValueError("Missing or invalid check selection.")
    if event_name != "pull_request" and profile != "full":
        raise ValueError("Non-PR runs must validate every job.")
    errors = []
    for name in VALIDATION_JOBS:
        expected = "success" if name in REQUIRED_JOBS[profile] else "skipped"
        if needs[name].get("result") != expected:
            errors.append(f"{name} must report {expected} for the {profile} profile")
    if errors:
        raise ValueError("; ".join(errors))
    return profile


def summary(text: str) -> None:
    print(text)
    if path := os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(path, "a", encoding="utf-8") as stream:
            stream.write(text + "\n")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["select", "verify"])
    args = parser.parse_args()
    event_name = os.environ.get("GITHUB_EVENT_NAME", "")
    if args.command == "select":
        path = os.environ.get("GITHUB_EVENT_PATH")
        selection = select_profile(event_name, Path(path) if path else None, Path.cwd())
        with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as stream:
            stream.write(f"profile={selection.profile}\n")
        count = "unknown" if selection.changed_file_count is None else str(selection.changed_file_count)
        required = ", ".join(name for name in VALIDATION_JOBS if name in REQUIRED_JOBS[selection.profile])
        summary(f"### Selected CI checks: {selection.profile}\n\n{selection.reason}\n\n"
                f"Changed paths: {count}. Required jobs: {required}.")
    else:
        try:
            profile = verify_results(event_name, json.loads(os.environ["CI_NEEDS_JSON"]))
        except (ValueError, KeyError) as error:
            summary(f"### CI failed\n\n{error}")
            raise SystemExit(1) from error
        summary(f"### CI passed\n\nEvery required job succeeded for the **{profile}** profile. "
                "Only jobs explicitly excluded by that profile were skipped.")


if __name__ == "__main__":
    main()
