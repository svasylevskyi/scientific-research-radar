import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch


SCRIPTS = Path(__file__).parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS))
spec = importlib.util.spec_from_file_location("offsite_backup", SCRIPTS / "offsite_backup.py")
backup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backup)
ENVIRONMENT = "production"
VALUES = {
    "RESTIC_REPOSITORY": "s3:https://example.eu.r2.cloudflarestorage.com/radar-production-backups/production",
    "RESTIC_PASSWORD": "test-password-that-is-long-enough-for-backup",
    "AWS_ACCESS_KEY_ID": "example-id",
    "AWS_SECRET_ACCESS_KEY": "example-secret",
    "AWS_DEFAULT_REGION": "auto",
    "RADAR_OFFSITE_PING_URL": "https://hc-ping.com/00000000-0000-0000-0000-000000000001",
    "RADAR_CLOSURE_PING_URL": "https://hc-ping.com/00000000-0000-0000-0000-000000000002",
    "RADAR_RETENTION_PING_URL": "https://hc-ping.com/00000000-0000-0000-0000-000000000003",
}
MARKER_A = {"user_id": "00000000-0000-0000-0000-000000000001", "requested_at": "2026-09-29T10:00:00Z"}
MARKER_B = {"user_id": "00000000-0000-0000-0000-000000000002", "requested_at": "2026-09-29T11:00:00Z"}


def stage_fixture(directory, environment, kind, markers=None):
    backup.write_json(directory / "closure-manifest.json", markers or [])
    if kind == "database":
        (directory / "database.dump").write_bytes(b"a consistent PostgreSQL archive fixture")
        (directory / "application.env").write_text("APP_SECRET=private\n")
        (directory / "release").write_text("1" * 40 + " base\n")
        (directory / "image-digests").write_text("sha256:" + "2" * 64 + " sha256:" + "3" * 64 + "\n")


class ConfigTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.path = Path(self.temporary.name) / "production.restic.env"

    def write_config(self, values=VALUES):
        self.path.write_text("\n".join(f"{key}='{value}'" for key, value in values.items()))
        self.path.chmod(0o600)

    def test_existing_production_configuration_and_comments(self):
        self.write_config()
        with self.path.open("a") as stream:
            stream.write("\n# private operator note\n")
        self.assertEqual(backup.load_config(self.path), VALUES)

    def test_configuration_is_literal_not_shell_code(self):
        sentinel = Path(self.temporary.name) / "must-not-exist"
        self.write_config(VALUES | {"AWS_SECRET_ACCESS_KEY": f"$(touch {sentinel})"})
        self.assertEqual(backup.load_config(self.path)["AWS_SECRET_ACCESS_KEY"], f"$(touch {sentinel})")
        self.assertFalse(sentinel.exists())

    def test_rejects_public_symlinked_or_wrong_owner_configuration(self):
        self.write_config()
        self.path.chmod(0o644)
        with self.assertRaises(backup.BackupError):
            backup.load_config(self.path)
        self.path.chmod(0o600)
        with patch.object(backup.os, "geteuid", return_value=os.geteuid() + 1), self.assertRaises(backup.BackupError):
            backup.load_config(self.path)
        link = self.path.with_name("link")
        link.symlink_to(self.path)
        with self.assertRaises(backup.BackupError):
            backup.load_config(link)

    def test_rejects_invalid_repository_secret_and_alert_configuration(self):
        cases = [
            {"RESTIC_REPOSITORY": "s3:http://untrusted/bucket"},
            {"RESTIC_REPOSITORY": "s3:https://username:password@example.org/bucket"},
            {"RESTIC_PASSWORD": "short"},
            {"RADAR_OFFSITE_PING_URL": "http://localhost/secret"},
            {"RADAR_CLOSURE_PING_URL": VALUES["RADAR_OFFSITE_PING_URL"]},
            {"RADAR_RETENTION_PING_URL": VALUES["RADAR_OFFSITE_PING_URL"]},
            {"RESTIC_PASSWORD_COMMAND": "echo secret"},
        ]
        for changes in cases:
            with self.subTest(changes=list(changes)):
                self.write_config(VALUES | changes)
                with self.assertRaises(backup.BackupError):
                    backup.load_config(self.path)
        self.write_config()
        with self.path.open("a") as stream:
            stream.write("\nRESTIC_PASSWORD='duplicate'\n")
        with self.assertRaises(backup.BackupError):
            backup.load_config(self.path)

    def test_subprocess_failure_is_redacted_and_partial_backup_is_failure(self):
        restic = backup.Restic(VALUES)
        for code in (1, 3):
            with self.subTest(code=code), patch.object(backup.subprocess, "run", return_value=SimpleNamespace(
                    returncode=code, stdout=b"", stderr=b"secret-credential https://hc-ping.com/private")) as run:
                with self.assertRaises(backup.BackupError) as error:
                    restic.run("backup", ".")
                self.assertNotIn("secret-credential", str(error.exception))
                self.assertNotIn("RADAR_OFFSITE_PING_URL", run.call_args.kwargs["env"])
                self.assertEqual(run.call_args.kwargs["stdin"], subprocess.DEVNULL)

    def test_staging_never_receives_restic_credentials(self):
        with patch.dict(os.environ, VALUES), patch.object(backup.subprocess, "run", return_value=SimpleNamespace(returncode=0)) as run:
            backup.stage(Path(self.temporary.name), "production", "database")
        environment = run.call_args.kwargs["env"]
        for key in VALUES:
            self.assertNotIn(key, environment)
        self.assertEqual(environment["RADAR_ENVIRONMENT"], "production")


class BundleTests(unittest.TestCase):
    def test_closure_merge_preserves_old_ids_and_earliest_request(self):
        later_a = MARKER_A | {"requested_at": "2026-10-01T00:00:00Z"}
        self.assertEqual(backup.merge_markers([MARKER_A], [MARKER_B, later_a]), [MARKER_A, MARKER_B])
        self.assertEqual(backup.merge_markers([MARKER_A, MARKER_B], []), [MARKER_A, MARKER_B])

    def test_invalid_closure_manifests_fail_closed(self):
        for value in ({}, [MARKER_A, MARKER_A], [MARKER_A | {"email": "private@example.com"}],
                      [MARKER_A | {"user_id": "not-a-uuid"}], [MARKER_A | {"requested_at": "2026-09-29"}]):
            with self.subTest(value=value), self.assertRaises((backup.BackupError, ValueError)):
                backup.parse_markers(json.dumps(value).encode())

    def test_integrity_environment_and_unexpected_files_are_checked(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            stage_fixture(directory, ENVIRONMENT, "database", [MARKER_A])
            backup.describe_bundle(directory, ENVIRONMENT, "database")
            with self.assertRaises(backup.BackupError):
                backup.verify_bundle(directory, "development", "database")
            (directory / "unexpected.env").write_text("secret")
            with self.assertRaises(backup.BackupError):
                backup.verify_bundle(directory, ENVIRONMENT, "database")
            (directory / "unexpected.env").unlink()
            (directory / "database.dump").write_text("corrupt")
            with self.assertRaises(backup.BackupError):
                backup.verify_bundle(directory, ENVIRONMENT, "database")

    def test_symlinks_and_missing_image_pins_are_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            stage_fixture(directory, ENVIRONMENT, "database")
            backup.describe_bundle(directory, ENVIRONMENT, "database")
            (directory / "image-digests").unlink()
            with self.assertRaises(backup.BackupError):
                backup.verify_bundle(directory, ENVIRONMENT, "database")
            (directory / "image-digests").symlink_to(directory / "release")
            with self.assertRaises(backup.BackupError):
                backup.verify_bundle(directory, ENVIRONMENT, "database")

    def test_unreadable_previous_closures_prevent_new_backup(self):
        with patch.object(backup, "saved_markers", side_effect=backup.BackupError("remote unavailable")), patch.object(backup, "stage") as stage:
            with self.assertRaises(backup.BackupError):
                backup.backup(None, ENVIRONMENT, "database")
            stage.assert_not_called()

    def test_marker_retention_is_backup_window_plus_safety_margin(self):
        current = backup.parse_time("2026-12-04T10:00:00Z")
        recent = MARKER_A | {"requested_at": "2026-10-01T10:00:00Z"}
        expired = MARKER_B | {"requested_at": "2026-09-30T09:59:59Z"}
        self.assertEqual(backup.CLOSURE_RETENTION_DAYS, backup.DATABASE_RETENTION_DAYS + 30)
        no_old_snapshots = [backup.parse_time("2026-10-02T00:00:00Z")]
        self.assertEqual(backup.retained_markers([recent, expired], no_old_snapshots, current), [recent])
        preclosure_survives = [backup.parse_time("2026-09-29T00:00:00Z")]
        self.assertEqual(backup.retained_markers([expired], preclosure_survives, current), [expired])

    def test_retention_prunes_database_before_proving_marker_disposal(self):
        restic = backup.Restic(VALUES)
        recent_db = [{"id": "d" * 64, "hostname": "radar-production", "tags": ["radar-database"],
                      "time": "2026-10-02T00:00:00Z"}]
        with patch.object(restic, "forget") as forget, \
                patch.object(restic, "snapshots", return_value=recent_db) as snapshots, \
                patch.object(backup, "saved_markers", return_value=([MARKER_A], "c" * 64)), \
                patch.object(restic, "upload", return_value="e" * 64) as upload:
            backup.apply_retention(restic, ENVIRONMENT)
        self.assertEqual(forget.call_args_list[0].args, (ENVIRONMENT, "database", 35))
        snapshots.assert_called_once_with(ENVIRONMENT, "database")
        self.assertEqual(forget.call_args_list[-1].args, (ENVIRONMENT, "closures", 65))
        upload.assert_not_called()

    def test_old_marker_is_republished_without_unsafe_history_before_closure_prune(self):
        restic = backup.Restic(VALUES)
        old_marker = MARKER_A | {"requested_at": "2026-01-01T00:00:00Z"}
        recent_db = [{"id": "d" * 64, "hostname": "radar-production", "tags": ["radar-database"],
                      "time": "2026-10-02T00:00:00Z"}]
        with patch.object(restic, "forget"), patch.object(restic, "snapshots", return_value=recent_db), \
                patch.object(backup, "saved_markers", return_value=([old_marker], "c" * 64)), \
                patch.object(restic, "upload", return_value="e" * 64) as upload:
            backup.apply_retention(restic, ENVIRONMENT)
        upload.assert_called_once()

    def test_partial_upload_reports_failure_not_success(self):
        for command, key in (("backup", "RADAR_OFFSITE_PING_URL"), ("closures", "RADAR_CLOSURE_PING_URL")):
            with self.subTest(command=command), patch.object(sys, "argv", ["offsite_backup.py", command, "--environment", ENVIRONMENT]), \
                    patch.object(backup.os, "geteuid", return_value=0), patch.object(backup, "load_config", return_value=VALUES), \
                    patch.object(backup, "operation_lock", return_value=contextlib.nullcontext()), \
                    patch.object(backup, "backup", side_effect=backup.BackupError("partial upload")), patch.object(backup, "ping", return_value=True) as ping, \
                    contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(backup.main(), 1)
                ping.assert_called_once_with(VALUES[key], failed=True)

    def test_retention_has_separate_heartbeat(self):
        with patch.object(sys, "argv", ["offsite_backup.py", "retention", "--environment", ENVIRONMENT]), \
                patch.object(backup.os, "geteuid", return_value=0), patch.object(backup, "load_config", return_value=VALUES), \
                patch.object(backup, "operation_lock", return_value=contextlib.nullcontext()), \
                patch.object(backup, "apply_retention") as retention, patch.object(backup, "ping", return_value=True) as ping, \
                contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(backup.main(), 0)
            retention.assert_called_once()
            ping.assert_called_once_with(VALUES["RADAR_RETENTION_PING_URL"])

    def test_check_and_fetch_do_not_refresh_backup_heartbeat(self):
        for command in ("check", "fetch"):
            args = ["offsite_backup.py", command, "--environment", ENVIRONMENT]
            if command == "fetch":
                args.extend(["--target", "/private/new-recovery"])
            with self.subTest(command=command), patch.object(sys, "argv", args), \
                    patch.object(backup.os, "geteuid", return_value=0), patch.object(backup, "load_config", return_value=VALUES), \
                    patch.object(backup, "operation_lock", return_value=contextlib.nullcontext()), \
                    patch.object(backup.Restic, "run", return_value=b""), patch.object(backup, "fetch", return_value="a" * 64), \
                    patch.object(backup, "ping") as ping, contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(backup.main(), 0)
                ping.assert_not_called()


@unittest.skipUnless(shutil.which("restic"), "real restic executable is required (installed in CI)")
class ResticIntegrationTests(unittest.TestCase):
    """Exercise actual encryption, snapshot layout and recovery without any cloud credentials."""
    def test_old_database_recovery_uses_latest_cumulative_closures(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            values = VALUES | {"RESTIC_REPOSITORY": str(root / "repository")}
            restic = backup.Restic(values)
            restic.run("init")
            with patch.object(backup, "stage", side_effect=lambda d, e, k: stage_fixture(d, e, k, [MARKER_A])):
                first = backup.backup(restic, ENVIRONMENT, "database")
            # An older local database has lost A, but its remote marker must survive.
            with patch.object(backup, "stage", side_effect=lambda d, e, k: stage_fixture(d, e, k, [MARKER_B])):
                backup.backup(restic, ENVIRONMENT, "closures")
            target = root / "recovery"
            self.assertEqual(backup.fetch(restic, ENVIRONMENT, target, first), first)
            self.assertEqual(json.loads((target / "closure-manifest.json").read_text()), [MARKER_A])
            self.assertEqual(json.loads((target / "latest-closure-manifest.json").read_text()), [MARKER_A, MARKER_B])
            subprocess.run(["sha256sum", "--check", str(target / "database.dump.sha256")], cwd="/", check=True, capture_output=True)
            self.assertEqual((target / "application.env").stat().st_mode & 0o777, 0o600)
            self.assertEqual(target.stat().st_mode & 0o777, 0o700)
            self.assertFalse((target / "production.restic.env").exists())
            restic.run("check", "--read-data")
            with self.assertRaises(backup.BackupError):
                backup.fetch(restic, ENVIRONMENT, target, first)
            with self.assertRaises(backup.BackupError):
                backup.fetch(restic, "development", root / "wrong-environment", first)
            with self.assertRaises(backup.BackupError):
                backup.Restic(values | {"RESTIC_PASSWORD": "wrong password"}).run("snapshots")


class StagingTests(unittest.TestCase):
    def test_archive_validation_precedes_closure_export_and_staging_failure_stops(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            script = root / "stage-offsite-backup.sh"
            script.write_text((SCRIPTS / script.name).read_text())
            (root / "common.sh").write_text('''set -Eeuo pipefail
umask 077
lock() { :; }
load_release() { :; }
dc() {
  printf '%s\\n' "$*" >> "$TEST_CALLS"
  case "$*" in
    *pg_dump*) printf 'dump';;
    *pg_restore*) cat >/dev/null; return "${TEST_RESTORE_STATUS:-0}";;
    *app.account_closure*) printf '[]\\n';;
  esac
}
''')
            state = root / "state"
            state.write_text("a" * 40 + " base\n")
            env_file = root / "app.env"
            env_file.write_text("APP_SECRET=private\n")
            release = root / "release"
            release.mkdir()
            (release / "image-digests").write_text("pins\n")
            for status in (0, 1):
                destination = root / f"stage-{status}"
                destination.mkdir()
                calls = root / f"calls-{status}"
                result = subprocess.run(["bash", str(script), "database", str(destination)], env={
                    **os.environ, "TEST_CALLS": str(calls), "TEST_RESTORE_STATUS": str(status),
                    "RADAR_ENV_FILE": str(env_file), "STATE": str(state), "RELEASE": str(release),
                    "RADAR_ENVIRONMENT": "offsite-fixture-not-deployed",
                }, capture_output=True, text=True)
                self.assertEqual(result.returncode, status)
                operations = calls.read_text().splitlines()
                self.assertIn("pg_dump", operations[0])
                self.assertIn("pg_restore", operations[1])
                if status:
                    self.assertEqual(len(operations), 2)
                    self.assertFalse((destination / "closure-manifest.json").exists())
                else:
                    self.assertIn("app.account_closure export", operations[2])
                    self.assertEqual((destination / "application.env").stat().st_mode & 0o777, 0o600)


if __name__ == "__main__":
    unittest.main()
