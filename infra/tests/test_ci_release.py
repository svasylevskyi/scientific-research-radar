import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts/ci_release.py'
spec = importlib.util.spec_from_file_location('ci_release', SCRIPT)
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)
REPO = 'svasylevskyi/scientific-research-radar'
SHA = 'a' * 40
BACKEND = 'sha256:' + 'b' * 64
WEB = 'sha256:' + 'c' * 64


def successful_run(**changes):
    return dict(id=123, run_attempt=1, head_sha=SHA, head_branch='main', event='push',
                path='.github/workflows/ci.yml', head_repository={'full_name': REPO},
                status='completed', conclusion='success') | changes


def manifest(**changes):
    return dict(schema_version=1, repository=REPO, sha=SHA, run_id=123, run_attempt=1,
                backend_digest=BACKEND, web_digest=WEB) | changes


class ReleaseTests(unittest.TestCase):
    def test_find_uses_exact_sha_and_exports_the_successful_run_artifact(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / 'outputs'
            env = dict(GITHUB_REPOSITORY=REPO, GITHUB_SHA=SHA, GITHUB_REF='refs/heads/main',
                       GH_TOKEN='test-only', GITHUB_OUTPUT=str(output))
            with patch.dict(os.environ, env), patch('sys.argv', ['ci_release.py', 'find']), \
                 patch.object(release, 'github_json', return_value={'workflow_runs': [successful_run()]}) as request:
                release.main()
            self.assertIn('head_sha=' + SHA, request.call_args.args[0])
            self.assertIn('/actions/workflows/ci.yml/runs?', request.call_args.args[0])
            self.assertNotIn('event', parse_qs(urlsplit(request.call_args.args[0]).query))
            self.assertEqual(output.read_text(), f'run_id=123\nrun_attempt=1\nartifact=verified-release-{SHA}-1\n')

    def test_only_exact_main_ci_can_authorize_deployment(self):
        run = successful_run()
        self.assertEqual(release.select_run([run], REPO, SHA), run)
        for changes in (
            {'head_sha': 'd' * 40}, {'head_branch': 'feature/test'},
            {'event': 'pull_request'}, {'path': '.github/workflows/other.yml'},
            {'event': 'workflow_dispatch', 'path': '.github/workflows/deploy-production.yml'},
            {'head_repository': {'full_name': 'someone/fork'}},
            {'head_repository': None}, {'status': 'in_progress'},
            {'conclusion': 'failure'}, {'conclusion': 'cancelled'}, {'conclusion': 'skipped'},
            {'event': 'pull_request_target'}, {'event': 'workflow_run'}, {'event': 'schedule'},
        ):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                release.select_run([run | changes], REPO, SHA)

    def test_manual_main_recovery_is_accepted_only_after_successful_full_ci(self):
        manual = successful_run(event='workflow_dispatch')
        self.assertEqual(release.select_run([manual], REPO, SHA), manual)
        for changes in (
            {'head_sha': 'd' * 40}, {'head_branch': 'feature/recovery'},
            {'head_repository': {'full_name': 'someone/fork'}},
            {'path': '.github/workflows/deploy-development.yml'},
            {'status': 'in_progress', 'conclusion': None}, {'conclusion': 'failure'},
        ):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                release.select_run([manual | changes], REPO, SHA)

    def test_find_exports_manual_recovery_artifact_without_reusing_pr_images(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / 'outputs'
            env = dict(GITHUB_REPOSITORY=REPO, GITHUB_SHA=SHA, GITHUB_REF='refs/heads/main',
                       GH_TOKEN='test-only', GITHUB_OUTPUT=str(output))
            runs = [successful_run(event='pull_request', id=999),
                    successful_run(event='workflow_dispatch', id=124, run_attempt=2)]
            with patch.dict(os.environ, env), patch('sys.argv', ['ci_release.py', 'find']), \
                 patch.object(release, 'github_json', return_value={'workflow_runs': runs}):
                release.main()
            self.assertEqual(output.read_text(), f'run_id=124\nrun_attempt=2\nartifact=verified-release-{SHA}-2\n')


    def test_find_sha_allows_pr_ci_to_reuse_only_an_exact_successful_main_release(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / 'outputs'
            env = dict(GITHUB_REPOSITORY=REPO, GITHUB_SHA='f' * 40, GITHUB_REF='refs/pull/12/merge',
                       GH_TOKEN='test-only', GITHUB_OUTPUT=str(output))
            with patch.dict(os.environ, env), patch('sys.argv', [
                    'ci_release.py', 'find-sha', '--release-sha', SHA]), \
                    patch.object(release, 'github_json', return_value={'workflow_runs': [successful_run()]}) as request:
                release.main()
            self.assertIn('head_sha=' + SHA, request.call_args.args[0])
            self.assertEqual(output.read_text(), f'run_id=123\nrun_attempt=1\nartifact=verified-release-{SHA}-1\n')

    def test_find_sha_still_rejects_non_main_or_failed_ci(self):
        env = dict(GITHUB_REPOSITORY=REPO, GITHUB_SHA='f' * 40, GITHUB_REF='refs/pull/12/merge',
                   GH_TOKEN='test-only', GITHUB_OUTPUT=os.devnull)
        for changes in ({'head_branch': 'feature/test'}, {'event': 'pull_request'}, {'conclusion': 'failure'}):
            with self.subTest(changes=changes), patch.dict(os.environ, env), patch('sys.argv', [
                    'ci_release.py', 'find-sha', '--release-sha', SHA]), \
                    patch.object(release, 'github_json', return_value={'workflow_runs': [successful_run(**changes)]}), \
                    self.assertRaises(ValueError):
                release.main()

    def test_missing_main_ci_explains_recovery_and_never_exports_a_release(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / 'outputs'
            env = dict(GITHUB_REPOSITORY=REPO, GITHUB_SHA=SHA, GITHUB_REF='refs/heads/main',
                       GH_TOKEN='test-only', GITHUB_OUTPUT=str(output))
            with patch.dict(os.environ, env), patch('sys.argv', ['ci_release.py', 'find']), \
                 patch.object(release, 'github_json', return_value={'workflow_runs': []}), \
                 self.assertRaisesRegex(ValueError, 'Run workflow on main'):
                release.main()
            self.assertFalse(output.exists())

    def test_pending_or_failed_manual_recovery_cannot_fall_back_to_a_successful_push(self):
        push = successful_run()
        for changes in ({'status': 'in_progress', 'conclusion': None}, {'conclusion': 'failure'}):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                release.select_run([push, successful_run(event='workflow_dispatch', id=124, **changes)], REPO, SHA)

    def test_latest_failed_or_pending_attempt_cannot_fall_back_to_old_success(self):
        old = successful_run()
        for current in (successful_run(run_attempt=2, status='in_progress', conclusion=None),
                        successful_run(id=124, conclusion='failure')):
            with self.subTest(current=current), self.assertRaises(ValueError):
                release.select_run([old, current], REPO, SHA)
        self.assertEqual(release.select_run([old, successful_run(id=124)], REPO, SHA)['id'], 124)

    def test_manifest_binds_both_digests_to_repository_commit_run_and_attempt(self):
        self.assertEqual(release.validate_manifest(manifest(), REPO, SHA, 123, 1),
                         dict(backend_digest=BACKEND, web_digest=WEB))
        for changes in ({'schema_version': 2}, {'repository': 'someone/fork'}, {'sha': 'd' * 40},
                        {'run_id': 124}, {'run_attempt': 2}, {'backend_digest': None},
                        {'web_digest': 'latest'}, {'backend_digest': BACKEND + '\nextra=value'}):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                release.validate_manifest(manifest(**changes), REPO, SHA, 123, 1)
        with self.assertRaises(ValueError):
            release.validate_manifest([], REPO, SHA, 123, 1)

    def test_cli_write_validate_round_trip_and_failed_validation_has_no_outputs(self):
        with tempfile.TemporaryDirectory() as directory:
            path, output = Path(directory) / 'release.json', Path(directory) / 'outputs'
            env = os.environ | dict(GITHUB_REPOSITORY=REPO, GITHUB_SHA=SHA, GITHUB_RUN_ID='123',
                                    GITHUB_RUN_ATTEMPT='1', GITHUB_OUTPUT=str(output))
            subprocess.run(['python3', str(SCRIPT), 'write', '--manifest', str(path),
                            '--backend-digest', BACKEND, '--web-digest', WEB], env=env, check=True)
            self.assertEqual(json.loads(path.read_text()), manifest())
            command = ['python3', str(SCRIPT), 'validate', '--manifest', str(path),
                       '--run-id', '123', '--run-attempt', '1']
            subprocess.run(command, env=env, check=True)
            self.assertEqual(output.read_text(), f'backend_digest={BACKEND}\nweb_digest={WEB}\n')
            output.unlink()
            path.write_text(json.dumps(manifest(run_attempt=2)))
            self.assertNotEqual(subprocess.run(command, env=env, capture_output=True).returncode, 0)
            self.assertFalse(output.exists())

    def test_feature_branch_rejected_before_any_api_call(self):
        env = os.environ | dict(GITHUB_REPOSITORY=REPO, GITHUB_SHA=SHA, GITHUB_REF='refs/heads/feature/test')
        result = subprocess.run(['python3', str(SCRIPT), 'find'], env=env, capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('dispatched from main', result.stderr)
