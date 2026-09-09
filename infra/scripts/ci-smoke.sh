#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")/../.."
export BACKEND_IMAGE=radar-ci-backend WEB_IMAGE=radar-ci-web
export PUBLIC_HOST=http://localhost
export POSTGRES_PASSWORD=0123456789abcdef0123456789abcdef
export RADAR_ENV_FILE="$RUNNER_TEMP/radar-ci.env"
cat > "$RADAR_ENV_FILE" <<'ENV'
JWT_SECRET=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
SUPER_ADMIN_PASSWORD=0123456789abcdef0123456789abcdef
SUPER_ADMIN_EMAIL=ci@example.com
ENV
# HTTP is limited to this disposable CI override; deployed cookies remain Secure.
cat > "$RUNNER_TEMP/compose-ci.yaml" <<'YAML'
services:
  ops:
    environment:
      FRONTEND_BASE_URL: http://localhost
      CORS_ORIGINS: '["http://localhost"]'
  api:
    environment:
      FRONTEND_BASE_URL: http://localhost
      CORS_ORIGINS: '["http://localhost"]'
YAML
dc() { docker compose -p radar-ci --env-file "$RADAR_ENV_FILE" -f infra/compose.yaml -f "$RUNNER_TEMP/compose-ci.yaml" "$@"; }
cleanup() {
  code=$?
  if [[ $code != 0 ]]; then dc logs --tail 80; fi
  dc down -v
  rm -f "$RADAR_ENV_FILE"
}
trap cleanup EXIT
docker build -t "$BACKEND_IMAGE" backend
docker build -t "$WEB_IMAGE" frontend
dc config --quiet
dc up -d --wait db mailpit
dc run --rm --no-deps -T ops alembic upgrade head
dc up -d --wait --wait-timeout 180 api web
# Regression: one-off operations must work while API owns its fixed address.
api_id=$(dc ps -q api)
dc run --rm --no-deps -T ops python -m app.ops configuration base
dc run --rm --no-deps -T ops python -m app.ops active
dc run --rm --no-deps -T ops alembic upgrade head
test "$(dc ps -q api)" = "$api_id"
curl --fail --retry 5 --retry-delay 2 http://localhost/health
curl --fail http://localhost/ | grep -q '<div id="root">'
# Exercise the actual operator scripts against this disposable project.
sha=$(git rev-parse HEAD)
docker tag "$BACKEND_IMAGE" "ghcr.io/svasylevskyi/scientific-research-radar-backend:$sha"
docker tag "$WEB_IMAGE" "ghcr.io/svasylevskyi/scientific-research-radar-web:$sha"
sudo install -d /etc/radar "/opt/radar/releases/$sha/infra"
sudo cp infra/compose.yaml "/opt/radar/releases/$sha/infra/compose.yaml"
sudo cp "$RADAR_ENV_FILE" /etc/radar/ci.env
printf '\nPUBLIC_HOST=ci.example.com\nPOSTGRES_PASSWORD=%s\n' "$POSTGRES_PASSWORD" | sudo tee -a /etc/radar/ci.env >/dev/null
printf '%s base\n' "$sha" | sudo tee /etc/radar/ci.release >/dev/null
sudo env RADAR_ENVIRONMENT=ci bash infra/scripts/backup.sh
dump=$(sudo find /var/backups/radar/ci -name '*.dump' | head -1)
sudo env RADAR_ENVIRONMENT=ci bash infra/scripts/restore.sh "$dump" radar_restore_ci
test "$(dc exec -T db psql -U radar -d radar_restore_ci -Atc 'SELECT count(*) FROM users')" = 1
# Existing destination must be rejected without altering it.
if sudo env RADAR_ENVIRONMENT=ci bash infra/scripts/restore.sh "$dump" radar_restore_ci; then
  echo 'Restore overwrote an existing database' >&2
  exit 1
fi
# Prove health detects DB failure, not just a responding HTTP process.
dc stop db
if dc exec -T api python -m app.ops ready; then
  echo 'Readiness incorrectly passed without PostgreSQL' >&2
  exit 1
fi
