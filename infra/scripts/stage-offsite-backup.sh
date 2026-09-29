#!/usr/bin/env bash
# Internal helper: write a fresh, consistent recovery bundle into a private directory.
# The caller serializes off-site operations; this lock protects against deployment.
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
lock
load_release
KIND=${1:?Expected database or closures}
DESTINATION=${2:?Expected an existing private staging directory}
[[ $KIND == database || $KIND == closures ]] || exit 1
[[ -d $DESTINATION && ! -L $DESTINATION ]] || exit 1

if [[ $KIND == database ]]; then
  # Never upload the live PostgreSQL data directory or a possibly stale daily dump.
  dc exec -T db pg_dump -U radar -d radar -Fc > "$DESTINATION/database.dump"
  dc exec -T db pg_restore --list < "$DESTINATION/database.dump" > /dev/null
  install -m 600 "$RADAR_ENV_FILE" "$DESTINATION/application.env"
  install -m 600 "$STATE" "$DESTINATION/release"
  # Recovery must identify the exact images. Legacy tag-only releases must be pinned first.
  install -m 600 "$RELEASE/image-digests" "$DESTINATION/image-digests"
  if [[ -f /etc/radar/$RADAR_ENVIRONMENT.monitoring.json ]]; then
    install -m 600 "/etc/radar/$RADAR_ENVIRONMENT.monitoring.json" "$DESTINATION/monitoring.json"
  fi
fi

# Export after pg_dump, so closures committed during the dump are captured too.
# This CLI only reads closure IDs/times; it never sends mail or contacts a provider.
# The ops container also works when the public API process is unavailable.
dc run --rm --no-deps -T ops python -m app.account_closure export \
  > "$DESTINATION/closure-manifest.json"
