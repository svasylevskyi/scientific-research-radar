import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

SCRIPTS = Path(__file__).parents[1] / "scripts"
spec = importlib.util.spec_from_file_location("healthchecks", SCRIPTS / "healthchecks.py")
hc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hc)
URLS = {name: f"https://hc-ping.com/00000000-0000-0000-0000-{i:012d}" for i, name in enumerate(hc.CHECKS)}


class MonitorTests(unittest.TestCase):
    def test_service_checks_exclude_oneoff_containers_and_probe_database(self):
        with patch.object(hc, "command", side_effect=["abc\n", '{"Running":true,"Health":{"Status":"healthy"}}', ""]) as command:
            self.assertTrue(hc.service_healthy("development", "api"))
            self.assertIn("label=com.docker.compose.oneoff=False", command.call_args_list[0].args[0])
            self.assertEqual(command.call_args_list[-1].args[0][-1], "ready")

    def test_stopped_missing_and_unhealthy_containers_never_report_success(self):
        for output in ([""], ["a\nb"], ["a", '{"Running":false}'], ["a", '{"Running":true,"Health":{"Status":"unhealthy"}}']):
            with self.subTest(output=output), patch.object(hc, "command", side_effect=output):
                self.assertFalse(hc.service_healthy("development", "research"))

    def test_failed_check_does_not_prevent_other_heartbeats(self):
        with patch.object(hc, "disk_healthy", return_value=False), patch.object(hc, "service_healthy", side_effect=[True, RuntimeError("unavailable"), True]), patch.object(hc, "ping", return_value=True) as ping:
            self.assertEqual(hc.monitor(URLS, "development"), 1)
            self.assertEqual([c.args[0] for c in ping.call_args_list], [URLS["api"], URLS["scheduler"]])

    def test_disk_capacity_and_inode_thresholds(self):
        gib = 1024**3
        for free, used, inodes_free, healthy in ((10, 30, 90, True), (2, 38, 90, False), (5, 35, 90, False), (10, 30, 10, False)):
            with self.subTest(free=free, inodes_free=inodes_free), patch.object(hc.shutil, "disk_usage", return_value=SimpleNamespace(total=40*gib, used=used*gib, free=free*gib)), patch.object(hc.os, "statvfs", return_value=SimpleNamespace(f_files=100, f_favail=inodes_free)):
                self.assertEqual(hc.disk_healthy(), healthy)

    def test_config_rejects_unsafe_urls_duplicates_and_permissions(self):
        for config, mode, valid in ((URLS, 0o600, True), (URLS, 0o644, False), ({**URLS, "api": "http://localhost/secret"}, 0o600, False), ({**URLS, "api": URLS["disk"]}, 0o600, False)):
            fake = SimpleNamespace(stat=lambda: SimpleNamespace(st_uid=0, st_mode=mode), read_text=lambda: json.dumps(config))
            with self.subTest(mode=mode, valid=valid):
                if valid:
                    self.assertEqual(hc.load_config(fake), URLS)
                else:
                    with self.assertRaises(ValueError):
                        hc.load_config(fake)

    def test_backup_preserves_exit_status_when_reporting_fails(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "backup.sh").write_text((SCRIPTS / "backup.sh").read_text())
            (root / "healthchecks.py").write_text("import sys\nprint(sys.argv[-1])\nsys.exit(1)\n")
            (root / "common.sh").write_text('set -Eeuo pipefail\nlock() { :; }\nload_release() { :; }\nbackup_database() { return "$TEST_STATUS"; }\nBACKUPS="$TEST_BACKUPS"\n')
            (root / "backups").mkdir()
            for status in (0, 7):
                result = subprocess.run(["bash", str(root / "backup.sh")], env={**os.environ, "TEST_STATUS": str(status), "TEST_BACKUPS": str(root / "backups")}, capture_output=True, text=True)
                self.assertEqual(result.returncode, status)
                self.assertEqual(result.stdout.strip(), str(status))
