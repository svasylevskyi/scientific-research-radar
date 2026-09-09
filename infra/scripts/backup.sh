#!/usr/bin/env bash
# Preserve the backup's exit status even if alert delivery fails.
report_result() {
  backup_status=$?
  trap - EXIT
  python3 "$(dirname "${BASH_SOURCE[0]}")/healthchecks.py" backup \
    --environment "${RADAR_ENVIRONMENT:-development}" --exit-code "$backup_status" || true
  exit "$backup_status"
}
trap report_result EXIT
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
lock
load_release
backup_database
# Keep seven days locally. Off-server retention is a separate policy.
find "$BACKUPS" -maxdepth 1 -type f \( -name '*.dump' -o -name '*.dump.sha256' \) -mtime +7 -delete
