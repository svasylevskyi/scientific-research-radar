"""Encrypted off-site recovery bundles. Host-only; no application or provider writes.

Restic credentials are read as literal data and passed only to restic, never to
Docker, logs, or the uploaded bundle. Approved retention is enforced only by the
explicit retention command under the same host lock as backup and recovery.
"""
import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import stat
import subprocess
import sys
import tempfile
from urllib.parse import urlsplit
from uuid import UUID

from healthchecks import URL as PING_URL, ping


SCRIPTS = Path(__file__).resolve().parent
SHA = re.compile(r"[0-9a-f]{64}")
ENVIRONMENT = re.compile(r"[a-z][a-z0-9-]*")
RESTIC_KEYS = {"RESTIC_REPOSITORY", "RESTIC_PASSWORD", "AWS_ACCESS_KEY_ID",
               "AWS_SECRET_ACCESS_KEY", "AWS_DEFAULT_REGION"}
ALERT_KEYS = {"RADAR_OFFSITE_PING_URL", "RADAR_CLOSURE_PING_URL", "RADAR_RETENTION_PING_URL"}
DATABASE_RETENTION_DAYS = 35
CLOSURE_RETENTION_DAYS = DATABASE_RETENTION_DAYS + 30
FILES = {
    "closures": {"closure-manifest.json"},
    "database": {"database.dump", "application.env", "release", "image-digests",
                 "closure-manifest.json"},
}


class BackupError(Exception):
    """An operator-safe message; never include subprocess output or credentials."""


def private_file(path: Path) -> None:
    info = path.lstat()
    if (not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid()
            or stat.S_IMODE(info.st_mode) & 0o077):
        raise BackupError("Configuration must be a private, root-owned regular file (mode 600).")


def load_config(path: Path) -> dict[str, str]:
    private_file(path)
    if path.stat().st_size > 16_384:
        raise BackupError("Backup configuration is too large.")
    values: dict[str, str] = {}
    for line in path.read_text().splitlines():
        try:
            parts = shlex.split(line, comments=True)
        except ValueError:
            raise BackupError("Invalid quoting in backup configuration.") from None
        if not parts:
            continue
        if len(parts) != 1 or "=" not in parts[0]:
            raise BackupError("Use one literal KEY=value assignment per line; shell commands are not supported.")
        key, value = parts[0].split("=", 1)
        if key not in RESTIC_KEYS | ALERT_KEYS or key in values or not value:
            raise BackupError("Unknown, duplicate, or empty backup configuration setting.")
        values[key] = value
    if not RESTIC_KEYS | {"RADAR_OFFSITE_PING_URL"} <= values.keys():
        raise BackupError("Backup configuration is missing required settings.")
    repository = values["RESTIC_REPOSITORY"]
    endpoint = urlsplit(repository.removeprefix("s3:"))
    if (not repository.startswith("s3:https://") or not endpoint.hostname
            or endpoint.username or endpoint.password or endpoint.query or endpoint.fragment
            or not endpoint.path.strip("/")):
        raise BackupError("Use an HTTPS S3 repository URL including the bucket and optional prefix.")
    if len(values["RESTIC_PASSWORD"]) < 32:
        raise BackupError("Use a separate backup encryption password of at least 32 characters.")
    urls = [values[key] for key in ALERT_KEYS if key in values]
    if any(not PING_URL.fullmatch(url) for url in urls) or len(set(urls)) != len(urls):
        raise BackupError("Use distinct HTTPS hc-ping.com UUID URLs for off-site and closure alerts.")
    return values


def clean_environment() -> dict[str, str]:
    # Avoid inherited provider credentials/options affecting either restic or Docker.
    return {key: value for key, value in os.environ.items()
            if not key.startswith(("RESTIC_", "AWS_", "B2_", "RADAR_OFFSITE_", "RADAR_CLOSURE_", "RADAR_RETENTION_"))}


class Restic:
    def __init__(self, values: dict[str, str]):
        self.environment = clean_environment() | {key: values[key] for key in RESTIC_KEYS}

    def run(self, *arguments: str, cwd: Path | None = None) -> bytes:
        try:
            result = subprocess.run(
                ["restic", "--no-cache", *arguments], env=self.environment, cwd=cwd,
                stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                timeout=3600, check=False,
            )
        except (OSError, subprocess.SubprocessError):
            raise BackupError("Restic could not complete the operation; check connectivity and installation.") from None
        # Restic exit 3 means an incomplete snapshot, not a successful backup.
        if result.returncode != 0:
            raise BackupError(f"Restic {arguments[0]} failed (exit {result.returncode}); no successful completion recorded.")
        return result.stdout

    def latest(self, environment: str, kind: str) -> str | None:
        data = json.loads(self.run("snapshots", "--json", "--host", f"radar-{environment}",
                                   "--tag", f"radar-{kind}"))
        if not isinstance(data, list):
            raise BackupError("Invalid repository snapshot listing.")
        for snapshot in data:
            if (snapshot.get("hostname") != f"radar-{environment}"
                    or f"radar-{kind}" not in snapshot.get("tags", [])
                    or not SHA.fullmatch(snapshot.get("id", ""))):
                raise BackupError("Unexpected snapshot identity; recovery selection refused.")
        return max(data, key=lambda item: parse_time(item["time"]))["id"] if data else None

    def forget(self, environment: str, kind: str, days: int) -> None:
        self.run(
            "forget",
            "--host", f"radar-{environment}",
            "--tag", f"radar-{kind}",
            "--group-by", "host,tags",
            "--keep-within", f"{days}d",
            "--prune",
        )

    def upload(self, directory: Path, environment: str, kind: str) -> str:
        output = self.run("backup", "--json", "--host", f"radar-{environment}",
                          "--tag", f"radar-{kind}", ".", cwd=directory)
        summaries = [record for line in output.splitlines() if
                     (record := json.loads(line)).get("message_type") == "summary"]
        if len(summaries) != 1 or not SHA.fullmatch(summaries[0].get("snapshot_id", "")):
            raise BackupError("Restic did not confirm a complete snapshot ID.")
        snapshot_id = summaries[0]["snapshot_id"]
        # Read saved metadata back from remote storage before acknowledging success.
        if self.run("dump", snapshot_id, "bundle.json") != (directory / "bundle.json").read_bytes():
            raise BackupError("Uploaded snapshot metadata could not be verified.")
        return snapshot_id


def parse_time(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise BackupError("Recovery timestamps must include a timezone.")
    return parsed


def parse_markers(raw: bytes) -> list[dict[str, str]]:
    if len(raw) > 64 * 1024 * 1024:
        raise BackupError("Closure manifest exceeds the supported size; investigate before recovery.")
    markers = json.loads(raw)
    if not isinstance(markers, list):
        raise BackupError("Closure manifest must be an array.")
    seen: set[str] = set()
    for marker in markers:
        if not isinstance(marker, dict) or set(marker) != {"user_id", "requested_at"}:
            raise BackupError("Closure manifest contains unexpected fields.")
        identifier = str(UUID(marker["user_id"]))
        if identifier != marker["user_id"] or identifier in seen:
            raise BackupError("Closure manifest contains duplicate or noncanonical IDs.")
        seen.add(identifier)
        parse_time(marker["requested_at"])
    return markers


def merge_markers(*groups: list[dict[str, str]]) -> list[dict[str, str]]:
    """Preserve every known closure even if the local database was rolled back."""
    merged: dict[str, dict[str, str]] = {}
    for group in groups:
        for marker in group:
            previous = merged.get(marker["user_id"])
            if previous is None or parse_time(marker["requested_at"]) < parse_time(previous["requested_at"]):
                merged[marker["user_id"]] = marker
    return [merged[identifier] for identifier in sorted(merged)]


def retained_markers(markers: list[dict[str, str]], current: datetime | None = None) -> list[dict[str, str]]:
    """Keep recovery markers only while pre-closure database snapshots can still be restored, plus the approved safety margin."""
    current = current or datetime.now(timezone.utc)
    cutoff = current.timestamp() - CLOSURE_RETENTION_DAYS * 86400
    return [marker for marker in markers if parse_time(marker["requested_at"]).timestamp() >= cutoff]


def write_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, indent=2) + "\n")
    path.chmod(0o600)


def digest(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def describe_bundle(directory: Path, environment: str, kind: str) -> None:
    paths = list(directory.iterdir())
    if any(not stat.S_ISREG(path.lstat().st_mode) for path in paths):
        raise BackupError("Recovery bundles must contain only regular files.")
    files = {path.name: digest(path) for path in paths}
    write_json(directory / "bundle.json", {
        "schema_version": 1, "environment": environment, "kind": kind,
        "created_at": datetime.now(timezone.utc).isoformat(), "files": files,
    })
    verify_bundle(directory, environment, kind)


def verify_bundle(directory: Path, environment: str, kind: str) -> dict:
    paths = list(directory.iterdir())
    if any(not stat.S_ISREG(path.lstat().st_mode) for path in paths):
        raise BackupError("Recovery bundles must contain only regular files.")
    metadata = directory / "bundle.json"
    if metadata.stat().st_size > 16_384:
        raise BackupError("Invalid recovery bundle metadata.")
    record = json.loads(metadata.read_bytes())
    if (set(record) != {"schema_version", "environment", "kind", "created_at", "files"}
            or record["schema_version"] != 1 or record["environment"] != environment
            or record["kind"] != kind or not isinstance(record["files"], dict)):
        raise BackupError("Recovery bundle identity does not match this environment and operation.")
    parse_time(record["created_at"])
    expected, actual = FILES[kind], set(record["files"])
    optional = {"monitoring.json"} if kind == "database" else set()
    if not expected <= actual <= expected | optional or {path.name for path in paths} != actual | {"bundle.json"}:
        raise BackupError("Recovery bundle has missing or unexpected files.")
    for name, checksum in record["files"].items():
        if not isinstance(checksum, str) or not SHA.fullmatch(checksum) or digest(directory / name) != checksum:
            raise BackupError("Recovery file checksum mismatch.")
    parse_markers((directory / "closure-manifest.json").read_bytes())
    if kind == "database":
        if not re.fullmatch(r"[0-9a-f]{40} (?:base|research|scheduled)\n", (directory / "release").read_text()):
            raise BackupError("Invalid release identity in recovery bundle.")
        if not re.fullmatch(r"sha256:[0-9a-f]{64} sha256:[0-9a-f]{64}\n", (directory / "image-digests").read_text()):
            raise BackupError("Recovery bundle does not pin both container images.")
    return record


def saved_markers(restic: Restic, environment: str) -> tuple[list[dict[str, str]], str | None]:
    snapshot_id = restic.latest(environment, "closures")
    if snapshot_id is None:
        return [], None
    with tempfile.TemporaryDirectory(prefix="radar-closure-read-") as temporary:
        directory = Path(temporary)
        for name in ("bundle.json", "closure-manifest.json"):
            (directory / name).write_bytes(restic.run("dump", snapshot_id, name))
        verify_bundle(directory, environment, "closures")
        return parse_markers((directory / "closure-manifest.json").read_bytes()), snapshot_id


def stage(directory: Path, environment: str, kind: str) -> None:
    try:
        result = subprocess.run(
            ["bash", str(SCRIPTS / "stage-offsite-backup.sh"), kind, str(directory)],
            env=clean_environment() | {"RADAR_ENVIRONMENT": environment},
            stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            timeout=3600, check=False,
        )
    except (OSError, subprocess.SubprocessError):
        raise BackupError("Could not stage the recovery bundle; check the deployed release and Docker.") from None
    if result.returncode:
        raise BackupError("Recovery staging failed; check disk space, release image pins, database, and deployment locks.")


def backup(restic: Restic, environment: str, kind: str) -> str:
    # A failed remote read must stop the operation; never replace known closures with [].
    previous, _ = saved_markers(restic, environment)
    with tempfile.TemporaryDirectory(prefix=f"radar-{environment}-offsite-") as temporary:
        directory = Path(temporary)
        stage(directory, environment, kind)
        current = parse_markers((directory / "closure-manifest.json").read_bytes())
        markers = retained_markers(merge_markers(previous, current))
        write_json(directory / "closure-manifest.json", markers)
        # Commit the independent closure checkpoint before the database snapshot.
        with tempfile.TemporaryDirectory(prefix="radar-closure-upload-") as closure_temporary:
            closure_directory = Path(closure_temporary)
            write_json(closure_directory / "closure-manifest.json", markers)
            describe_bundle(closure_directory, environment, "closures")
            closure_id = restic.upload(closure_directory, environment, "closures")
        if kind == "closures":
            return closure_id
        describe_bundle(directory, environment, kind)
        return restic.upload(directory, environment, kind)


def apply_retention(restic: Restic, environment: str) -> None:
    # Database snapshots carry potentially identifiable live data for 35 days.
    # Closure checkpoints remain for an additional 30-day restore-safety margin.
    restic.forget(environment, "database", DATABASE_RETENTION_DAYS)
    restic.forget(environment, "closures", CLOSURE_RETENTION_DAYS)


def fetch(restic: Restic, environment: str, target: Path, snapshot_id: str | None) -> str:
    if (not target.is_absolute() or any(char in str(target) for char in "\n\r\\")
            or target.exists() or target.is_symlink()):
        raise BackupError("Choose a new absolute recovery directory; existing paths are never overwritten.")
    snapshot_id = snapshot_id or restic.latest(environment, "database")
    if snapshot_id is None or not SHA.fullmatch(snapshot_id):
        raise BackupError("No complete database snapshot was selected.")
    latest, closure_id = saved_markers(restic, environment)
    if closure_id is None:
        raise BackupError("No independent closure checkpoint exists; investigate before recovery.")
    target.mkdir(mode=0o700)
    restic.run("restore", snapshot_id, "--target", str(target))
    record = verify_bundle(target, environment, "database")
    for path in target.iterdir():
        path.chmod(0o600)
    merged = merge_markers(parse_markers((target / "closure-manifest.json").read_bytes()), latest)
    # Keep the historical bundle intact and put the cumulative recovery manifest beside it.
    write_json(target / "latest-closure-manifest.json", merged)
    write_json(target / "recovery-selection.json", {
        "database_snapshot": snapshot_id, "closure_snapshot": closure_id,
        "downloaded_at": datetime.now(timezone.utc).isoformat(),
    })
    # restore.sh needs a sidecar pointing at the downloaded file, not its old staging path.
    (target / "database.dump.sha256").write_text(
        record["files"]["database.dump"] + "  " + str(target / "database.dump") + "\n")
    (target / "database.dump.sha256").chmod(0o600)
    return snapshot_id


@contextmanager
def operation_lock(environment: str):
    with open(f"/var/lock/radar-{environment}-offsite.lock", "a") as handle:
        try:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise BackupError("Another off-site operation is active; retry after it completes.") from None
        yield


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("validate", "backup", "closures", "retention", "check", "fetch"))
    parser.add_argument("--environment", default=os.environ.get("RADAR_ENVIRONMENT", "development"))
    parser.add_argument("--target", type=Path)
    parser.add_argument("--snapshot", help="Full database snapshot ID; defaults to latest for this environment")
    args = parser.parse_args()
    if os.geteuid() != 0:
        parser.error("Run with sudo.")
    if not ENVIRONMENT.fullmatch(args.environment):
        parser.error("Invalid environment.")
    if args.command == "fetch" and args.target is None:
        parser.error("fetch requires --target (a new absolute directory)")
    if args.command != "fetch" and (args.target is not None or args.snapshot is not None):
        parser.error("--target and --snapshot apply only to fetch")
    if args.snapshot is not None and not SHA.fullmatch(args.snapshot):
        parser.error("Use a full 64-character snapshot ID")
    os.umask(0o077)
    alert = None
    try:
        values = load_config(Path(f"/etc/radar/{args.environment}.restic.env"))
        if args.command == "validate":
            print("Off-site configuration is valid; no remote requests made.")
            return 0
        if args.command in {"backup", "closures", "retention"}:
            key = {
                "backup": "RADAR_OFFSITE_PING_URL",
                "closures": "RADAR_CLOSURE_PING_URL",
                "retention": "RADAR_RETENTION_PING_URL",
            }[args.command]
            if key not in values:
                raise BackupError(f"Configure {key} before scheduling {args.command}.")
            alert = values[key]
        with operation_lock(args.environment):
            restic = Restic(values)
            if args.command in {"backup", "closures"}:
                kind = "database" if args.command == "backup" else "closures"
                snapshot_id = backup(restic, args.environment, kind)
                print(f"Saved complete {kind} snapshot: {snapshot_id}")
            elif args.command == "retention":
                apply_retention(restic, args.environment)
                print(f"Applied retention: database {DATABASE_RETENTION_DAYS} days; closure checkpoints {CLOSURE_RETENTION_DAYS} days.")
            elif args.command == "check":
                restic.run("check", "--read-data")
                print("Remote repository structure and encrypted data verified.")
            elif args.command == "fetch":
                snapshot_id = fetch(restic, args.environment, args.target, args.snapshot)
                print(f"Downloaded and verified database snapshot: {snapshot_id}")
                print("Recovery files are isolated. Before promotion, reapply latest-closure-manifest.json and finish erasure review.")
        if alert and not ping(alert):
            raise BackupError("Backup completed, but its success heartbeat could not be delivered.")
        return 0
    except Exception as error:
        # Raw exceptions and subprocess output can contain credentials, URLs or private data.
        message = str(error) if isinstance(error, BackupError) else "Off-site operation failed; check configuration, files, and repository access."
        print(message, file=sys.stderr)
        if alert:
            ping(alert, failed=True)
        return 1


if __name__ == "__main__":
    sys.exit(main())
