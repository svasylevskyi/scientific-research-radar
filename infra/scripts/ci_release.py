"""Identify a successful main CI run and validate its immutable image manifest."""
import argparse
import json
import os
from pathlib import Path
import re
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


def validate_identity(repository, sha):
    if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repository):
        raise ValueError("Invalid repository.")
    if not re.fullmatch(r"[0-9a-f]{40}", sha):
        raise ValueError("Expected a full commit SHA.")


def select_run(runs, repository, sha):
    """Never substitute a PR run, another commit, or an older successful attempt."""
    validate_identity(repository, sha)
    matching = [run for run in runs if (
        run.get("head_sha") == sha
        and run.get("head_branch") == "main"
        and run.get("event") == "push"
        and run.get("path") == ".github/workflows/ci.yml"
        and (run.get("head_repository") or {}).get("full_name") == repository
    )]
    if not matching:
        raise ValueError("No main CI run exists for this commit. Deploy from main after CI publishes its images.")
    run = max(matching, key=lambda value: (value["id"], value["run_attempt"]))
    if run.get("status") != "completed" or run.get("conclusion") != "success":
        raise ValueError("CI for this exact commit must finish successfully, including publication. Retry deployment after CI is green.")
    return run


def validate_manifest(manifest, repository, sha, run_id, run_attempt):
    validate_identity(repository, sha)
    if not isinstance(manifest, dict):
        raise ValueError("Release manifest must be an object.")
    expected = dict(schema_version=1, repository=repository, sha=sha,
                    run_id=int(run_id), run_attempt=int(run_attempt))
    if any(manifest.get(key) != value for key, value in expected.items()):
        raise ValueError("Release manifest does not match the selected successful CI run and attempt.")
    for key in ("backend_digest", "web_digest"):
        if not re.fullmatch(r"sha256:[0-9a-f]{64}", str(manifest.get(key, ""))):
            raise ValueError(f"Invalid {key} in release manifest.")
    return {key: manifest[key] for key in ("backend_digest", "web_digest")}


def github_json(path, token):
    request = Request("https://api.github.com/" + path, headers={
        "Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    })
    with urlopen(request, timeout=30) as response:
        return json.load(response)


def output(values):
    # All values written here have been validated, never raw artifact contents.
    with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as stream:
        for key, value in values.items():
            stream.write(f"{key}={value}\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["find", "write", "validate"])
    parser.add_argument("--manifest", type=Path)
    parser.add_argument("--run-id", type=int)
    parser.add_argument("--run-attempt", type=int)
    parser.add_argument("--backend-digest")
    parser.add_argument("--web-digest")
    args = parser.parse_args()
    repository, sha = os.environ["GITHUB_REPOSITORY"], os.environ["GITHUB_SHA"]
    validate_identity(repository, sha)
    if args.command == "find":
        if os.environ.get("GITHUB_REF") != "refs/heads/main":
            raise ValueError("Deploy development must be dispatched from main.")
        query = urlencode(dict(head_sha=sha, branch="main", event="push", per_page=100))
        data = github_json(f"repos/{repository}/actions/workflows/ci.yml/runs?{query}", os.environ["GH_TOKEN"])
        run = select_run(data["workflow_runs"], repository, sha)
        output(dict(run_id=run["id"], run_attempt=run["run_attempt"],
                    artifact=f"verified-release-{sha}-{run['run_attempt']}"))
        return
    if args.manifest is None:
        parser.error("--manifest is required")
    if args.command == "write":
        manifest = dict(schema_version=1, repository=repository, sha=sha,
                        run_id=int(os.environ["GITHUB_RUN_ID"]),
                        run_attempt=int(os.environ["GITHUB_RUN_ATTEMPT"]),
                        backend_digest=args.backend_digest, web_digest=args.web_digest)
        validate_manifest(manifest, repository, sha, manifest["run_id"], manifest["run_attempt"])
        args.manifest.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    else:
        if args.run_id is None or args.run_attempt is None:
            parser.error("--run-id and --run-attempt are required")
        if args.manifest.stat().st_size > 16384:
            raise ValueError("Release manifest is too large.")
        manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
        output(validate_manifest(manifest, repository, sha, args.run_id, args.run_attempt))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, KeyError, OSError, HTTPError, URLError) as error:
        print(f"Release verification failed: {error}", file=sys.stderr)
        sys.exit(1)
