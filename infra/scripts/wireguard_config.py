"""Write a deployment runner's minimal WireGuard configuration without logging keys."""
import argparse
import base64
import os
from pathlib import Path
import re


TUNNELS = {
    "development": ("10.77.0.1", "10.77.0.2"),
    "production": ("10.78.0.1", "10.78.0.2"),
}


def write_config(path: Path, env, environment: str = "development") -> None:
    if environment not in TUNNELS:
        raise ValueError("Unknown deployment environment")
    server, runner = TUNNELS[environment]
    keys = {}
    for name in ("WG_PRIVATE_KEY", "WG_SERVER_PUBLIC_KEY"):
        value = env.get(name, "")
        try:
            valid = len(base64.b64decode(value, validate=True)) == 32
        except (ValueError, TypeError):
            valid = False
        if not valid or not re.fullmatch(r"[A-Za-z0-9+/]{43}=", value):
            raise ValueError(f"{name} must be a WireGuard key")
        keys[name] = value
    endpoint = env.get("WG_ENDPOINT", "")
    match = re.fullmatch(r"([A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?):([0-9]{1,5})", endpoint)
    if not match or not 1 <= int(match[2]) <= 65535:
        raise ValueError("WG_ENDPOINT must be an IPv4 address or hostname followed by a valid port")
    if env.get("DEPLOY_HOST") != server:
        raise ValueError(f"DEPLOY_HOST must be {server} for the {environment} tunnel")
    config = (
        f"[Interface]\nAddress = {runner}/32\n"
        f"PrivateKey = {keys['WG_PRIVATE_KEY']}\n\n"
        "[Peer]\n"
        f"PublicKey = {keys['WG_SERVER_PUBLIC_KEY']}\n"
        f"Endpoint = {endpoint}\n"
        f"AllowedIPs = {server}/32\nPersistentKeepalive = 25\n"
    )
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w") as output:
        output.write(config)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path", type=Path)
    parser.add_argument("--environment", choices=tuple(TUNNELS), default="development")
    args = parser.parse_args()
    try:
        write_config(args.path, os.environ, args.environment)
    except ValueError as exc:
        raise SystemExit(str(exc)) from None
