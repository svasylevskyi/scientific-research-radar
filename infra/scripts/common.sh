#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
[[ $EUID == 0 ]] || { echo 'Run with sudo.' >&2; exit 1; }
RADAR_ENVIRONMENT=${RADAR_ENVIRONMENT:-development}
[[ $RADAR_ENVIRONMENT =~ ^[a-z][a-z0-9-]*$ ]] || exit 1
export RADAR_ENV_FILE=/etc/radar/$RADAR_ENVIRONMENT.env
STATE=/etc/radar/$RADAR_ENVIRONMENT.release
BACKUPS=/var/backups/radar/$RADAR_ENVIRONMENT
REPO=svasylevskyi/scientific-research-radar
[[ -f $RADAR_ENV_FILE ]] || { echo "Missing $RADAR_ENV_FILE" >&2; exit 1; }
set_release() {
  SHA=$1
  MODE=$2
  [[ $SHA =~ ^[0-9a-f]{40}$ ]] || { echo 'Expected full commit SHA' >&2; exit 1; }
  case $MODE in
    base) PROFILES=(); SERVICES=(db mailpit api web);;
    research) PROFILES=(--profile research); SERVICES=(db mailpit api web research);;
    scheduled) PROFILES=(--profile research --profile scheduled); SERVICES=(db mailpit api web research scheduler);;
    *) echo 'Mode must be base, research, or scheduled' >&2; exit 1;;
  esac
  RELEASE=/opt/radar/releases/$SHA
  export BACKEND_IMAGE=ghcr.io/$REPO-backend:$SHA
  export WEB_IMAGE=ghcr.io/$REPO-web:$SHA
}
load_release() {
  [[ -f $STATE ]] || { echo 'No deployed release yet.' >&2; exit 1; }
  read -r saved_sha saved_mode < "$STATE"
  set_release "$saved_sha" "$saved_mode"
}
dc() {
  docker compose --env-file "$RADAR_ENV_FILE" -p "radar-$RADAR_ENVIRONMENT" \
    -f "$RELEASE/infra/compose.yaml" "${PROFILES[@]}" "$@"
}
lock() {
  exec 9>"/var/lock/radar-$RADAR_ENVIRONMENT.lock"
  flock -n 9 || { echo 'Another deployment, backup, or restore is active.' >&2; exit 1; }
}
backup_database() {
  install -d -m 700 "$BACKUPS"
  BACKUP_FILE="$BACKUPS/$(date -u +%Y%m%dT%H%M%SZ)-$SHA.dump"
  dc exec -T db pg_dump -U radar -d radar -Fc > "$BACKUP_FILE.partial"
  dc exec -T db pg_restore --list < "$BACKUP_FILE.partial" > /dev/null
  mv "$BACKUP_FILE.partial" "$BACKUP_FILE"
  sha256sum "$BACKUP_FILE" > "$BACKUP_FILE.sha256"
  echo "Database backup: $BACKUP_FILE" >&2
}
