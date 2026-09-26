#!/usr/bin/env bash
# Run from a trusted checkout: deploy.sh FULL_SHA MODE [BACKEND_DIGEST WEB_DIGEST]
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
lock
TARGET_SHA=${1:?Provide a tested full commit SHA}
TARGET_MODE=${2:-base}
TARGET_BACKEND_DIGEST=${3:-}
TARGET_WEB_DIGEST=${4:-}
[[ $# -le 4 ]] || { echo 'Too many deployment arguments.' >&2; exit 1; }
set_release "$TARGET_SHA" "$TARGET_MODE" "$TARGET_BACKEND_DIGEST" "$TARGET_WEB_DIGEST"
SOURCE=$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)
source "$SOURCE/infra/scripts/deploy-ref.sh"
verify_deploy_ref "$SOURCE" "$TARGET_SHA" "$RADAR_ENVIRONMENT"
install -d -m 750 "$RELEASE"
git -C "$SOURCE" archive "$TARGET_SHA" | tar -x -C "$RELEASE"
dc config --quiet
dc pull "${SERVICES[@]}"
if [[ -n $TARGET_BACKEND_DIGEST ]]; then
  for image in "$BACKEND_IMAGE" "$WEB_IMAGE"; do
    revision=$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$image")
    [[ $revision == "$TARGET_SHA" ]] || { echo 'Image revision does not match the deployment commit.' >&2; exit 1; }
  done
fi
dc run --rm --no-deps -T ops python -m app.ops configuration "$TARGET_MODE"
if [[ -f $STATE ]]; then
  load_release
  # Block new manual and scheduled enqueues before checking active work.
  dc stop web api scheduler
  # Use the existing database container: older releases have no ops service.
  if ! active=$(dc exec -T db psql -U radar -d radar -At -v ON_ERROR_STOP=1 \
      -c "SELECT count(*) FROM digest_runs WHERE status IN ('queued', 'running')"); then
    echo 'Could not check active work. Restoring current services.' >&2
    dc up -d --wait --wait-timeout 120 "${SERVICES[@]}"
    exit 1
  fi
  if [[ $active != 0 ]]; then
    echo 'Active or queued research remains. Restoring current services; retry after runs finish.' >&2
    dc up -d --wait --wait-timeout 120 "${SERVICES[@]}"
    exit 1
  fi
  dc stop research
  backup_database
fi
set_release "$TARGET_SHA" "$TARGET_MODE" "$TARGET_BACKEND_DIGEST" "$TARGET_WEB_DIGEST"
dc up -d --wait --wait-timeout 120 db mailpit
if [[ ! -f $STATE ]]; then backup_database; fi
# From this point a failure leaves the application stopped for operator inspection.
# Never automatically restart an old image against a possibly changed schema.
dc run --rm --no-deps -T ops alembic upgrade head
dc up -d --wait --wait-timeout 180 "${SERVICES[@]}"
save_image_digests "$RELEASE" "$TARGET_BACKEND_DIGEST" "$TARGET_WEB_DIGEST"
printf '%s %s\n' "$SHA" "$MODE" > "$STATE.tmp"
mv "$STATE.tmp" "$STATE"
echo "Deployed $SHA in $MODE mode."
