#!/usr/bin/env bash
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
lock
load_release
backup_database
# Keep seven days locally. Off-server retention is a separate policy.
find "$BACKUPS" -maxdepth 1 -type f \( -name '*.dump' -o -name '*.dump.sha256' \) -mtime +7 -delete
