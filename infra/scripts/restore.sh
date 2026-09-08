#!/usr/bin/env bash
# Restore to a NEW database only. Never overwrite the live database automatically.
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
lock
load_release
DUMP=${1:?Provide an absolute dump path}
TARGET=${2:?Provide a NEW database name beginning radar_restore_}
[[ $TARGET =~ ^radar_restore_[a-z0-9_]+$ ]] || { echo 'Invalid restore database name' >&2; exit 1; }
[[ -f $DUMP && -f $DUMP.sha256 ]] || { echo 'Dump and checksum are required' >&2; exit 1; }
sha256sum --check "$DUMP.sha256"
dc exec -T db createdb -U radar "$TARGET"
# --single-transaction avoids a partially restored schema if a command fails.
dc exec -T db pg_restore -U radar -d "$TARGET" --no-owner --no-privileges --exit-on-error --single-transaction < "$DUMP"
dc exec -T db psql -U radar -d "$TARGET" -v ON_ERROR_STOP=1 -c \
  'SELECT version_num FROM alembic_version; SELECT count(*) AS users FROM users; SELECT count(*) AS runs FROM digest_runs;'
echo "Restored into $TARGET. Live database was not modified. Do not run workers against restored schedules."
