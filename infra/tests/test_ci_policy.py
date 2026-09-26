import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch


SCRIPT = Path(__file__).resolve().parents[1] / "scripts/ci_policy.py"
spec = importlib.util.spec_from_file_location("ci_policy", SCRIPT)
policy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(policy)


def job_results(profile="full"):
    return {
        "changes": {"result": "success", "outputs": {"profile": profile}},
        **{name: {"result": "success" if name in policy.REQUIRED_JOBS[profile] else "skipped"}
           for name in policy.VALIDATION_JOBS},
    }


class ClassificationTests(unittest.TestCase):
    def test_only_known_documentation_is_lightweight(self):
        self.assertEqual(policy.classify_paths([
            "README.md", "SECURITY_REVIEW.md", "backend/EMAIL.md", "infra/README.md",
            "docs/testing.md", "docs/nested/guide.md",
        ]), "docs")

    def test_ui_assets_tests_and_optional_docs_select_frontend(self):
        for path in ("frontend/src/App.tsx", "frontend/public/logo.svg", "frontend/tests/api.test.mjs",
                     "frontend/index.html", "frontend/src/generated/api.ts"):
            with self.subTest(path=path):
                self.assertEqual(policy.classify_paths([path]), "frontend")
                self.assertEqual(policy.classify_paths(["README.md", path, "docs/testing.md"]), "frontend")

    def test_runtime_markdown_and_all_shared_or_unknown_paths_require_full_checks(self):
        for path in (
            "backend/app/radar/prompts/shared_system.md", "backend/app/main.py", "backend/tests/test_api.py",
            "backend/migrations/versions/new.py", "backend/evaluation/benchmarks/data.json",
            "backend/pyproject.toml", "backend/Dockerfile", "frontend/package.json", "frontend/package-lock.json",
            "frontend/vite.config.ts", "frontend/tsconfig.json", "frontend/scripts/api-contracts.mjs",
            "frontend/Dockerfile", "frontend/Caddyfile", "infra/compose.yaml", "infra/scripts/deploy.sh",
            ".github/workflows/ci.yml", ".github/workflows/deploy-development.yml", ".github/actions/custom/action.yml",
            ".gitmodules", ".gitattributes", "new-area/file.py", "unknown-guide.md", "docs/example.py",
        ):
            with self.subTest(path=path):
                self.assertEqual(policy.classify_paths(["README.md", "frontend/src/App.tsx", path]), "full")

    def test_empty_or_ambiguous_paths_cannot_select_fewer_checks(self):
        self.assertEqual(policy.classify_paths([]), "full")
        for path in ("", "/docs/guide.md", "docs/../backend/main.md", "frontend//src/App.tsx", "./README.md"):
            with self.subTest(path=path):
                self.assertEqual(policy.classify_paths([path]), "full")

    def test_non_pr_events_never_read_a_diff_or_select_reduced_checks(self):
        with patch.object(policy, "changed_paths", side_effect=AssertionError("Must not inspect a diff")):
            for event in ("push", "workflow_dispatch", "merge_group", "", "pull_request_target"):
                with self.subTest(event=event):
                    self.assertEqual(policy.select_profile(event, None, Path("/missing")).profile, "full")

    def test_missing_malformed_or_incomplete_events_use_full_validation(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "event.json"
            for value in ("not json", "{}", "[]", "null", '{"pull_request": {"base": null}}'):
                with self.subTest(value=value):
                    path.write_text(value)
                    self.assertEqual(policy.select_profile("pull_request", path, Path(directory)).profile, "full")
            path.unlink()
            self.assertEqual(policy.select_profile("pull_request", path, Path(directory)).profile, "full")
            self.assertEqual(policy.select_profile("pull_request", None, Path(directory)).profile, "full")

    def test_unavailable_history_or_ambiguous_merge_bases_use_full_validation(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "event.json"
            path.write_text(json.dumps({"pull_request": {"base": {"sha": "a" * 40}, "head": {"sha": "b" * 40}}}))
            for error in (subprocess.CalledProcessError(1, "git"), subprocess.TimeoutExpired("git", 60),
                          ValueError("Ambiguous merge base")):
                with self.subTest(error=error), patch.object(policy, "changed_paths", side_effect=error):
                    result = policy.select_profile("pull_request", path, Path(directory))
                    self.assertEqual(result.profile, "full")
                    self.assertIn("could not be determined", result.reason)


class GitDiffTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.repository = Path(self.directory.name)
        self.git("init", "--initial-branch=main")
        self.git("config", "user.name", "CI test")
        self.git("config", "user.email", "ci-test@example.com")
        self.write("README.md", "Guide\n")
        self.write("backend/app/prompt.md", "Runtime prompt\n")
        self.write("frontend/src/App.tsx", "export const title = 'Radar';\n")
        self.base = self.commit()

    def git(self, *args):
        return subprocess.run(["git", *args], cwd=self.repository, check=True,
                              stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True).stdout.strip()

    def write(self, path, text):
        target = self.repository / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text)

    def commit(self):
        self.git("add", "--all")
        self.git("commit", "-m", "Test change")
        return self.git("rev-parse", "HEAD")

    def test_renaming_runtime_markdown_into_docs_still_runs_full_checks(self):
        (self.repository / "docs").mkdir()
        self.git("mv", "backend/app/prompt.md", "docs/prompt.md")
        paths = policy.changed_paths(self.base, self.commit(), self.repository)
        self.assertEqual(set(paths), {"backend/app/prompt.md", "docs/prompt.md"})
        self.assertEqual(policy.classify_paths(paths), "full")

    def test_deleted_backend_files_still_run_full_checks(self):
        self.git("rm", "backend/app/prompt.md")
        paths = policy.changed_paths(self.base, self.commit(), self.repository)
        self.assertEqual(paths, ["backend/app/prompt.md"])
        self.assertEqual(policy.classify_paths(paths), "full")

    def test_diff_covers_entire_pr_after_base_advances_and_merge_is_checked_out(self):
        self.git("checkout", "-b", "feature")
        self.write("frontend/src/App.tsx", "export const title = 'Updated';\n")
        head = self.commit()
        self.git("checkout", "main")
        self.write("backend/app/prompt.md", "Base-only change\n")
        base = self.commit()
        self.git("merge", "--no-ff", "feature", "-m", "Synthetic PR merge")
        paths = policy.changed_paths(base, head, self.repository)
        self.assertEqual(paths, ["frontend/src/App.tsx"])
        self.assertEqual(policy.classify_paths(paths), "frontend")

    def test_no_file_limit_or_newline_splitting(self):
        for index in range(350):
            self.write(f"docs/guide-{index}.md", "Guide\n")
        unusual = "docs/line\nbreak.md"
        self.write(unusual, "Guide\n")
        self.write("z-unknown/runtime.py", "pass\n")
        paths = policy.changed_paths(self.base, self.commit(), self.repository)
        self.assertEqual(len(paths), 352)
        self.assertIn(unusual, paths)
        self.assertEqual(policy.classify_paths(paths), "full")

    def test_unknown_or_invalid_revisions_cannot_produce_a_small_diff(self):
        with self.assertRaises(subprocess.CalledProcessError):
            policy.changed_paths("a" * 40, self.base, self.repository)
        for revision in ("HEAD", "--help", self.base + "\n", None):
            with self.subTest(revision=revision), self.assertRaises(ValueError):
                policy.changed_paths(revision, self.base, self.repository)

    def test_selector_cli_exports_only_a_valid_profile_and_summary(self):
        self.write("docs/guide.md", "Guide\n")
        head = self.commit()
        event, output, summary = (self.repository / name for name in ("event.json", "output", "summary"))
        event.write_text(json.dumps({"pull_request": {"base": {"sha": self.base}, "head": {"sha": head}}}))
        env = os.environ | dict(GITHUB_EVENT_NAME="pull_request", GITHUB_EVENT_PATH=str(event),
                                GITHUB_OUTPUT=str(output), GITHUB_STEP_SUMMARY=str(summary))
        subprocess.run([sys.executable, str(SCRIPT), "select"], cwd=self.repository, env=env,
                       check=True, capture_output=True)
        self.assertEqual(output.read_text(), "profile=docs\n")
        self.assertIn("Changed paths: 1", summary.read_text())


class GateTests(unittest.TestCase):
    def test_success_requires_exactly_the_jobs_selected_by_each_profile(self):
        for profile in policy.REQUIRED_JOBS:
            with self.subTest(profile=profile):
                self.assertEqual(policy.verify_results("pull_request", job_results(profile)), profile)
        self.assertEqual(policy.verify_results("push", job_results()), "full")

    def test_failed_cancelled_or_unexpectedly_skipped_selected_jobs_block_gate(self):
        for profile, required in policy.REQUIRED_JOBS.items():
            for name in {"changes", *required}:
                for result in ("failure", "cancelled", "skipped", None, "timed_out"):
                    with self.subTest(profile=profile, job=name, result=result), self.assertRaises(ValueError):
                        needs = job_results(profile)
                        needs[name]["result"] = result
                        policy.verify_results("pull_request", needs)

    def test_excluded_jobs_must_be_explicitly_skipped(self):
        for profile, required in policy.REQUIRED_JOBS.items():
            for name in set(policy.VALIDATION_JOBS) - required:
                for result in ("success", "failure", "cancelled", None):
                    with self.subTest(profile=profile, job=name, result=result), self.assertRaises(ValueError):
                        needs = job_results(profile)
                        needs[name]["result"] = result
                        policy.verify_results("pull_request", needs)

    def test_missing_job_results_or_profile_block_gate(self):
        for name in job_results():
            with self.subTest(missing=name), self.assertRaises(ValueError):
                policy.verify_results("pull_request", {k: v for k, v in job_results().items() if k != name})
        for outputs in ({}, {"profile": ""}, {"profile": "unknown"}, {"profile": []}, None):
            with self.subTest(outputs=outputs), self.assertRaises(ValueError):
                needs = job_results()
                needs["changes"]["outputs"] = outputs
                policy.verify_results("pull_request", needs)
        for invalid in (None, [], {}, job_results() | {"new-check": {"result": "success"}},
                        job_results() | {"frontend": None}):
            with self.subTest(needs=invalid), self.assertRaises(ValueError):
                policy.verify_results("pull_request", invalid)

    def test_non_pr_runs_cannot_pass_a_reduced_profile(self):
        for event in ("push", "workflow_dispatch", "merge_group", ""):
            for profile in ("docs", "frontend"):
                with self.subTest(event=event, profile=profile), self.assertRaises(ValueError):
                    policy.verify_results(event, job_results(profile))

    def test_gate_cli_exit_status_and_summary_match_outcomes(self):
        with tempfile.TemporaryDirectory() as directory:
            summary = Path(directory) / "summary"
            for payload, expected in ((json.dumps(job_results("docs")), 0), ("{}", 1), ("not json", 1)):
                with self.subTest(payload=payload):
                    env = os.environ | dict(GITHUB_EVENT_NAME="pull_request", CI_NEEDS_JSON=payload,
                                            GITHUB_STEP_SUMMARY=str(summary))
                    result = subprocess.run([sys.executable, str(SCRIPT), "verify"], env=env,
                                            capture_output=True, text=True)
                    self.assertEqual(result.returncode, expected, result.stderr)
                    self.assertIn("CI passed" if expected == 0 else "CI failed", summary.read_text())
                    summary.unlink()
