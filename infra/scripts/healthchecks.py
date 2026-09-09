"""Host-side monitoring; standard library only, never logs ping URLs or container output."""
import argparse
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
from urllib.request import HTTPRedirectHandler, build_opener

CHECKS = ("backup", "disk", "api", "research", "scheduler")
URL = re.compile(r"https://hc-ping\.com/[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}")


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def load_config(path):
    permissions = path.stat()
    if permissions.st_uid != 0 or stat.S_IMODE(permissions.st_mode) & 0o077:
        raise ValueError("Monitoring configuration must be root-owned with permissions 600")
    config = json.loads(path.read_text())
    if not isinstance(config, dict) or set(config) != set(CHECKS):
        raise ValueError("Monitoring configuration requires backup, disk, api, research and scheduler URLs")
    if any(not isinstance(url, str) or not URL.fullmatch(url) for url in config.values()):
        raise ValueError("Each check must use its HTTPS hc-ping.com UUID URL, without a suffix")
    if len(set(config.values())) != len(CHECKS):
        raise ValueError("Use a distinct Healthchecks URL for every check")
    return config


def ping(url, failed=False):
    try:
        with build_opener(NoRedirect()).open(url + ("/fail" if failed else ""), timeout=10) as response:
            return response.status == 200
    except Exception:
        # Exceptions can contain the secret URL. Do not print them.
        return False


def command(args):
    return subprocess.run(args, check=True, capture_output=True, text=True, timeout=20).stdout


def service_healthy(environment, service):
    ids = command([
        "docker", "ps", "-aq",
        "--filter", f"label=com.docker.compose.project=radar-{environment}",
        "--filter", f"label=com.docker.compose.service={service}",
        "--filter", "label=com.docker.compose.oneoff=False",
    ]).split()
    if len(ids) != 1:
        return False
    state = json.loads(command(["docker", "inspect", "--format", "{{json .State}}", ids[0]]))
    if not state.get("Running") or state.get("Health", {}).get("Status") != "healthy":
        return False
    probe = "ready" if service == "api" else "worker-health"
    command(["docker", "exec", ids[0], "python", "-m", "app.ops", probe])
    return True


def disk_healthy(path="/"):
    usage = shutil.disk_usage(path)
    filesystem = os.statvfs(path)
    return (
        usage.free >= 3 * 1024**3
        and usage.used / usage.total < 0.85
        and (not filesystem.f_files or filesystem.f_favail / filesystem.f_files >= 0.15)
    )


def monitor(config, environment):
    failures = 0
    for name in ("disk", "api", "research", "scheduler"):
        try:
            healthy = disk_healthy() if name == "disk" else service_healthy(environment, name)
        except Exception:
            healthy = False
        if not healthy:
            # Withhold success so the configured grace period absorbs deployments.
            print(f"{name}: unhealthy; success heartbeat withheld", file=sys.stderr)
            failures += 1
        elif not ping(config[name]):
            print(f"{name}: could not deliver heartbeat", file=sys.stderr)
            failures += 1
        else:
            print(f"{name}: healthy; heartbeat sent")
    return 1 if failures else 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("check", "backup", "validate"))
    parser.add_argument("--environment", default="development")
    parser.add_argument("--exit-code", type=int, default=0)
    args = parser.parse_args()
    if not re.fullmatch(r"[a-z][a-z0-9-]*", args.environment):
        raise SystemExit("Invalid environment name")
    path = Path(f"/etc/radar/{args.environment}.monitoring.json")
    if args.action == "backup" and not path.exists():
        return 0  # Opt-in: existing deployments and CI need no monitoring account.
    try:
        config = load_config(path)
    except Exception:
        print("Missing or invalid monitoring configuration; check the file, URL format and permissions", file=sys.stderr)
        return 1
    if args.action == "validate":
        print("Monitoring configuration is valid; no pings sent")
        return 0
    if args.action == "backup":
        if not ping(config["backup"], failed=args.exit_code != 0):
            print("backup: could not deliver result heartbeat", file=sys.stderr)
            return 1
        print("backup: result heartbeat sent")
        return 0
    return monitor(config, args.environment)


if __name__ == "__main__":
    sys.exit(main())
