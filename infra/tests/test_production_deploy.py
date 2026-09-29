"""Exercise the privileged command's policy without Docker, SSH, or real secrets."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
BACKEND = "sha256:" + "b" * 64
WEB = "sha256:" + "c" * 64


class ProductionDeployTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.directory = Path(self.temporary.name)
        self.origin = self.directory / "origin"
        self.checkout = self.directory / "checkout"
        self.log = self.directory / "calls"
        self.origin.mkdir()
        self.git("init", "-b", "main")
        self.git("config", "user.name", "Test")
        self.git("config", "user.email", "test@example.com")
        scripts = self.origin / "infra/scripts"
        scripts.mkdir(parents=True)
        for name in ("release-images.sh", "deploy-ref.sh"):
            shutil.copyfile(SCRIPTS / name, scripts / name)
        (scripts / "deploy.sh").write_text(
            '#!/usr/bin/env bash\n'
            'printf "%s\\n" "deploy:$RADAR_ENVIRONMENT" "$@" >> "$TEST_DEPLOY_LOG"\n'
            'exit "${TEST_DEPLOY_EXIT:-0}"\n'
        )
        (scripts / "status.sh").write_text(
            '#!/usr/bin/env bash\n'
            'printf "%s\\n" "status:$RADAR_ENVIRONMENT" >> "$TEST_DEPLOY_LOG"\n'
            'exit "${TEST_STATUS_EXIT:-0}"\n'
        )
        self.git("add", ".")
        self.git("commit", "-m", "main")
        self.main = self.git("rev-parse", "HEAD")
        self.git("switch", "-c", "feature/paid-subscriptions")
        (self.origin / "unapproved").write_text("Development-only change")
        self.git("add", ".")
        self.git("commit", "-m", "development-only")
        self.feature = self.git("rev-parse", "HEAD")
        self.git("switch", "main")
        self.git("clone", str(self.origin), str(self.checkout))

    def git(self, *args):
        return subprocess.check_output(["git", *args], cwd=self.origin,
            stderr=subprocess.DEVNULL, text=True).strip()

    def deploy(self, request, **env):
        return subprocess.run([
            "bash", "-euc", 'source "$1"; run_production_deploy "$2" "$3"',
            "_", str(SCRIPTS / "production-deploy.sh"), str(self.checkout), request,
        ], env=os.environ | {"TEST_DEPLOY_LOG": str(self.log), "RADAR_ENVIRONMENT": "development"} | env,
            capture_output=True, text=True)

    def request(self, sha=None):
        return f"deploy {sha or self.main} scheduled {BACKEND} {WEB}"

    def test_main_pinned_images_force_production_and_scheduled_mode(self):
        result = self.deploy(self.request())
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.log.read_text().splitlines(), [
            "deploy:production", self.main, "scheduled", BACKEND, WEB, "status:production",
        ])

    def test_development_feature_commit_cannot_reach_deployment(self):
        result = self.deploy(self.request(self.feature))
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("not on an approved deployment branch", result.stderr)
        self.assertFalse(self.log.exists())

    def test_invalid_requests_never_deploy_or_execute_shell_input(self):
        sentinel = self.directory / "must-not-exist"
        requests = [
            "", f"deploy {self.main} scheduled", f"deploy {self.main} scheduled {BACKEND}",
            f"deploy {self.main} base {BACKEND} {WEB}", f"deploy {self.main} research {BACKEND} {WEB}",
            f"deploy main scheduled {BACKEND} {WEB}", f"deploy {self.main} scheduled latest {WEB}",
            self.request() + " extra", self.request() + "\nanything", self.request() + "\ranything",
            self.request() + f"; touch {sentinel}",
            f"deploy {self.main} scheduled $(touch {sentinel}) {WEB}",
            f"deploy {self.main} scheduled `touch {sentinel}` {WEB}",
        ]
        for request in requests:
            with self.subTest(request=request):
                self.assertNotEqual(self.deploy(request).returncode, 0)
                self.assertFalse(self.log.exists())
                self.assertFalse(sentinel.exists())

    def test_deployment_failure_is_propagated_without_status_or_retry(self):
        result = self.deploy(self.request(), TEST_DEPLOY_EXIT="23")
        self.assertEqual(result.returncode, 23)
        self.assertEqual(self.log.read_text().splitlines(), [
            "deploy:production", self.main, "scheduled", BACKEND, WEB,
        ])

    def test_status_failure_does_not_report_success_or_redeploy(self):
        result = self.deploy(self.request(), TEST_STATUS_EXIT="24")
        self.assertEqual(result.returncode, 24)
        self.assertEqual(self.log.read_text().splitlines().count("deploy:production"), 1)

    def test_forced_entrypoint_passes_ssh_command_as_one_literal_argument(self):
        # A fake sudo records arguments; no privileged command is run in this test.
        executable = self.directory / "sudo"
        executable.write_text('#!/usr/bin/env bash\nprintf "%s\\n" "$@" > "$TEST_DEPLOY_LOG"\n')
        executable.chmod(0o700)
        request = self.request() + '; $(touch never-execute)'
        result = subprocess.run(["bash", str(SCRIPTS / "ssh-production-entrypoint.sh")],
            env=os.environ | {"PATH": str(self.directory) + os.pathsep + os.environ["PATH"],
                "TEST_DEPLOY_LOG": str(self.log), "SSH_ORIGINAL_COMMAND": request},
            capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.log.read_text().splitlines(), [
            "-n", "/usr/local/sbin/radar-production-deploy-command", request,
        ])
