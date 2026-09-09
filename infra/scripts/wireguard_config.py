"""Write the development runner's minimal WireGuard configuration without logging keys."""
import base64
import os
from pathlib import Path
import re
import sys


def write_config(path: Path, env) -> None:
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
    if env.get("DEPLOY_HOST") != "10.77.0.1":
        raise ValueError("DEV_SSH_HOST must be 10.77.0.1 for the development tunnel")
    config = (
        "[Interface]\nAddress = 10.77.0.2/32\n"
        f"PrivateKey = {keys['WG_PRIVATE_KEY']}\n\n"
        "[Peer]\n"
        f"PublicKey = {keys['WG_SERVER_PUBLIC_KEY']}\n"
        f"Endpoint = {endpoint}\n"
        "AllowedIPs = 10.77.0.1/32\nPersistentKeepalive = 25\n"
    )
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w") as output:
        output.write(config)


if __name__ == "__main__":
    try:
        write_config(Path(sys.argv[1]), os.environ)
    except ValueError as exc:
        raise SystemExit(str(exc)) from None
