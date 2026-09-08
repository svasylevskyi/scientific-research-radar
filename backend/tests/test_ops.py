import sys
import time

import pytest

from app import ops


def test_worker_probe_requires_recent_heartbeat(tmp_path, monkeypatch):
    path = tmp_path / 'heartbeat'
    monkeypatch.setenv('RADAR_HEARTBEAT_FILE', str(path))
    monkeypatch.setattr(sys, 'argv', ['ops', 'worker-health', 'research'])
    with pytest.raises(FileNotFoundError):
        ops.main()
    ops.heartbeat()
    ops.main()
    import os
    old = time.time() - 200
    os.utime(path, (old, old))
    with pytest.raises(SystemExit, match='stale'):
        ops.main()


def test_heartbeat_is_optional_for_local_processes(monkeypatch):
    monkeypatch.delenv('RADAR_HEARTBEAT_FILE', raising=False)
    ops.heartbeat()
