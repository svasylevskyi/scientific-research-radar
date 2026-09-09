#!/usr/bin/env bash
set -Eeuo pipefail
[[ $EUID == 0 ]] || { echo 'Run with sudo.' >&2; exit 1; }
RADAR_ENVIRONMENT=${RADAR_ENVIRONMENT:-development}
[[ $RADAR_ENVIRONMENT =~ ^[a-z][a-z0-9-]*$ ]] || exit 1
# Separate from deployment/backup lock: monitoring must observe those operations.
exec 9>"/var/lock/radar-$RADAR_ENVIRONMENT-monitor.lock"
flock -n 9 || exit 0
exec python3 "$(dirname "${BASH_SOURCE[0]}")/healthchecks.py" check --environment "$RADAR_ENVIRONMENT"
