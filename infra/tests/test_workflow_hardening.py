import json
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[2]
WORKFLOWS = ROOT / ".github" / "workflows"
ACTIONS = ROOT / ".github" / "actions"


class WorkflowHardeningTests(unittest.TestCase):
    def sources(self):
        yield from sorted(WORKFLOWS.glob("*.yml"))
        yield from sorted(ACTIONS.glob("*/action.yml"))

    def test_external_actions_are_commit_pinned_with_human_version_comments(self):
        external = []
        for path in self.sources():
            for number, line in enumerate(path.read_text().splitlines(), 1):
                match = re.search(r"\buses:\s+([^\s]+)", line)
                if not match or match.group(1).startswith("./"):
                    continue
                external.append((path, number, line))
                self.assertRegex(
                    line,
                    r"uses:\s+[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+@[0-9a-f]{40}\s+#\s+v\d",
                    f"{path}:{number} must pin a third-party Action to a full commit SHA and retain its version comment",
                )
        self.assertTrue(external)

    def test_every_github_job_has_an_explicit_timeout(self):
        expected = {
            "ci.yml": (
                "changes", "repository-policy", "deployment-config", "backend-static", "backend",
                "frontend", "browser-acceptance", "containers", "ci-passed", "publish",
            ),
            "deploy-development.yml": ("release", "deploy"),
            "deploy-production.yml": ("release", "deploy"),
        }
        for filename, jobs in expected.items():
            text = (WORKFLOWS / filename).read_text()
            for job in jobs:
                block = re.search(
                    rf"(?ms)^  {re.escape(job)}:\n(.*?)(?=^  [A-Za-z0-9_-]+:\n|\Z)",
                    text,
                )
                self.assertIsNotNone(block, f"{filename} is missing {job}")
                self.assertIn("timeout-minutes:", block.group(1), f"{filename}:{job} needs an explicit timeout")

    def test_docs_profile_is_lightweight_and_browser_setup_is_prebuilt(self):
        policy = (ROOT / "infra/scripts/ci_policy.py").read_text()
        self.assertIn('"docs": frozenset({"repository-policy"})', policy)
        ci = (WORKFLOWS / "ci.yml").read_text()
        version = json.loads((ROOT / "acceptance/package.json").read_text())["devDependencies"]["@playwright/test"]
        self.assertIn(f"mcr.microsoft.com/playwright:v{version}-noble", ci)
        self.assertNotIn("playwright install --with-deps", ci)
        self.assertIn("browser-acceptance:", ci)

    def test_frontend_profile_reuses_verified_main_backend(self):
        ci = (WORKFLOWS / "ci.yml").read_text()
        self.assertIn("Resolve verified backend from the PR base", ci)
        self.assertIn("find-sha", (ROOT / "infra/scripts/ci_release.py").read_text())
        self.assertIn("docker pull", ci)
        self.assertIn('if: needs.changes.outputs.profile == \'full\'', ci)

    def test_deployments_share_local_actions_and_development_checks_public_health(self):
        dev = (WORKFLOWS / "deploy-development.yml").read_text()
        prod = (WORKFLOWS / "deploy-production.yml").read_text()
        for text in (dev, prod):
            self.assertIn("./.github/actions/verified-release", text)
            self.assertIn("./.github/actions/deploy-over-wireguard", text)
        self.assertIn("DEV_PUBLIC_URL", dev)
        shared = (ACTIONS / "deploy-over-wireguard" / "action.yml").read_text()
        self.assertIn("Verify public website and API", shared)
        self.assertIn('"$base/health"', shared)

    def test_dependabot_tracks_github_action_pins(self):
        text = (ROOT / ".github/dependabot.yml").read_text()
        self.assertIn("package-ecosystem: github-actions", text)
        self.assertIn("interval: weekly", text)


if __name__ == "__main__":
    unittest.main()
