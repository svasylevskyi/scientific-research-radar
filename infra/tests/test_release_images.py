from pathlib import Path
import subprocess
import tempfile
import unittest

HELPER = Path(__file__).resolve().parents[1] / 'scripts/release-images.sh'
SHA = 'a' * 40
BACKEND = 'sha256:' + 'b' * 64
WEB = 'sha256:' + 'c' * 64


def shell(script, *args):
    return subprocess.run(['bash', '-euc', 'source "$1"; shift; ' + script,
                           '_', str(HELPER), *args], capture_output=True, text=True)


class ImageTests(unittest.TestCase):
    def test_legacy_selection_and_pinned_release_survive_later_operations(self):
        with tempfile.TemporaryDirectory() as directory:
            result = shell('select_release_images "$1" owner/repo "$2"; printf "%s\\n%s\\n" "$BACKEND_IMAGE" "$WEB_IMAGE"', directory, SHA)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(result.stdout.splitlines(), [f'ghcr.io/owner/repo-backend:{SHA}', f'ghcr.io/owner/repo-web:{SHA}'])
            result = shell('select_release_images "$1" owner/repo "$2" "$3" "$4"; save_image_digests "$1" "$3" "$4"', directory, SHA, BACKEND, WEB)
            self.assertEqual(result.returncode, 0, result.stderr)
            # Backups, status checks and redeploys use the saved digests without extra arguments.
            result = shell('select_release_images "$1" owner/repo "$2"; printf "%s\\n%s\\n" "$BACKEND_IMAGE" "$WEB_IMAGE"', directory, SHA)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(result.stdout.splitlines(), [f'ghcr.io/owner/repo-backend@{BACKEND}', f'ghcr.io/owner/repo-web@{WEB}'])
            result = shell('select_release_images "$1" owner/repo "$2" "$3" "$4"', directory, SHA, BACKEND, WEB)
            self.assertEqual(result.returncode, 0, result.stderr)

    def test_conflicting_or_malformed_pins_fail_without_overwriting_release(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'image-digests'
            path.write_text(f'{BACKEND} {WEB}\n')
            for backend, web in ((WEB, WEB), (BACKEND, ''), ('latest', WEB)):
                result = shell('select_release_images "$1" owner/repo "$2" "$3" "$4"', directory, SHA, backend, web)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(path.read_text(), f'{BACKEND} {WEB}\n')
            path.write_text(f'{BACKEND} {WEB}\nmalicious line\n')
            self.assertNotEqual(shell('select_release_images "$1" owner/repo "$2"', directory, SHA).returncode, 0)

    def test_ssh_grammar_allows_legacy_and_digest_commands_only(self):
        for command in (f'deploy {SHA} base', f'deploy {SHA} scheduled {BACKEND} {WEB}'):
            result = shell('parse_deploy_request "$1"', command)
            self.assertEqual(result.returncode, 0, result.stderr)
        for command in (f'deploy {SHA} invalid', f'deploy {SHA} base {BACKEND}',
                        f'deploy {SHA} base {BACKEND} {WEB} extra',
                        f'deploy {SHA} base\nanything', f'deploy {SHA} base; id',
                        f'deploy {SHA} base $(id) {WEB}', 'deploy main base'):
            with self.subTest(command=command):
                self.assertNotEqual(shell('parse_deploy_request "$1"', command).returncode, 0)

    def test_selecting_new_images_does_not_change_saved_current_release(self):
        with tempfile.TemporaryDirectory() as directory:
            result = shell('select_release_images "$1" owner/repo "$2" "$3" "$4"; select_release_images "$1" owner/repo "$2"; printf "%s" "$BACKEND_IMAGE"', directory, SHA, BACKEND, WEB)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(result.stdout, f'ghcr.io/owner/repo-backend:{SHA}')
            self.assertFalse((Path(directory) / 'image-digests').exists())
