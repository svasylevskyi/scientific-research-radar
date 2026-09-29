import base64
import importlib.util
import os
from pathlib import Path
import tempfile
import subprocess
import sys
import unittest

spec = importlib.util.spec_from_file_location("wireguard_config", Path(__file__).parents[1] / "scripts/wireguard_config.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ConfigTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = Path(self.directory.name) / "wg.conf"
        self.env = {
            "WG_PRIVATE_KEY": base64.b64encode(b'a' * 32).decode(),
            "WG_SERVER_PUBLIC_KEY": base64.b64encode(b'b' * 32).decode(),
            "WG_ENDPOINT": "example.com:51820",
            "DEPLOY_HOST": "10.77.0.1",
        }

    def test_minimal_private_config(self):
        module.write_config(self.path, self.env)
        text = self.path.read_text()
        self.assertIn("AllowedIPs = 10.77.0.1/32\n", text)
        self.assertIn("Address = 10.77.0.2/32\n", text)
        self.assertNotIn("0.0.0.0/0", text)
        self.assertEqual(self.path.stat().st_mode & 0o777, 0o600)

    def test_rejects_missing_keys_injection_and_public_ssh_target(self):
        for field, value in (
            ("WG_PRIVATE_KEY", ""),
            ("WG_SERVER_PUBLIC_KEY", "invalid"),
            ("WG_ENDPOINT", "example.com:51820\nPostUp = malicious"),
            ("WG_ENDPOINT", "example.com:99999"),
            ("DEPLOY_HOST", "example.com"),
        ):
            with self.subTest(field=field, value=value):
                with self.assertRaises(ValueError):
                    module.write_config(self.path, {**self.env, field: value})
                self.assertFalse(self.path.exists())

    def test_does_not_overwrite_existing_file(self):
        self.path.write_text("existing")
        with self.assertRaises(FileExistsError):
            module.write_config(self.path, self.env)
        self.assertEqual(self.path.read_text(), "existing")

    def test_production_tunnel_is_separate_and_has_only_its_server_route(self):
        module.write_config(self.path, self.env | {"DEPLOY_HOST": "10.78.0.1"}, "production")
        text = self.path.read_text()
        self.assertIn("AllowedIPs = 10.78.0.1/32\n", text)
        self.assertIn("Address = 10.78.0.2/32\n", text)
        self.assertNotIn("10.77.", text)
        self.assertNotIn("0.0.0.0/0", text)
        self.assertEqual(self.path.stat().st_mode & 0o777, 0o600)

    def test_cross_environment_targets_and_unknown_environment_fail_closed(self):
        for environment, host in (("production", "10.77.0.1"), ("development", "10.78.0.1"),
                                  ("production", "getresearchradar.com"), ("staging", "10.78.0.1")):
            with self.subTest(environment=environment, host=host), self.assertRaises(ValueError):
                module.write_config(self.path, self.env | {"DEPLOY_HOST": host}, environment)
            self.assertFalse(self.path.exists())

    def test_production_cli_and_legacy_cli_never_log_keys(self):
        for environment, host, options in (("production", "10.78.0.1", ["--environment", "production"]),
                                            ("development", "10.77.0.1", [])):
            with self.subTest(environment=environment):
                result = subprocess.run([sys.executable, str(Path(module.__file__)), str(self.path), *options],
                    env=os.environ | self.env | {"DEPLOY_HOST": host}, capture_output=True, text=True)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(result.stdout + result.stderr, "")
                self.assertIn(f"AllowedIPs = {host}/32", self.path.read_text())
                self.path.unlink()
