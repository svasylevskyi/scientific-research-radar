#!/usr/bin/env bash
# Run from a trusted checkout: sudo bash infra/scripts/deploy.sh FULL_SHA [base|research|scheduled]
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
lock
TARGET_SHA=${1:?Provide a tested full commit SHA}
TARGET_MODE=${2:-base}
set_release "$TARGET_SHA" "$TARGET_MODE"
SOURCE=$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)
git -C "$SOURCE" fetch origin main
# Production credentials must never execute an unreviewed feature-branch image.
git -C "$SOURCE" merge-base --is-ancestor "$TARGET_SHA" origin/main || {
  echo 'Only commits merged into main can be deployed.' >&2; exit 1;
}
install -d -m 750 "$RELEASE"
git -C "$SOURCE" archive "$TARGET_SHA" | tar -x -C "$RELEASE"
dc config --quiet
dc pull "${SERVICES[@]}"
dc run --rm --no-deps -T api python -m app.ops configuration "$TARGET_MODE"
if [[ -f $STATE ]]; then
  load_release
  # Block new manual and scheduled enqueues before checking active work.
  dc stop web api scheduler
  active=$(dc run --rm --no-deps -T api python -m app.ops active)
  if [[ $active != 0 ]]; then
    echo 'Active or queued research remains. Restoring current services; retry after runs finish.' >&2
    dc up -d --wait --wait-timeout 120 "${SERVICES[@]}"
    exit 1
  fi
  dc stop research
  backup_database
fi
set_release "$TARGET_SHA" "$TARGET_MODE"
dc up -d --wait --wait-timeout 120 db mailpit
if [[ ! -f $STATE ]]; then backup_database; fi
# From this point a failure leaves the application stopped for operator inspection.
# Never automatically restart an old image against a possibly changed schema.
dc run --rm --no-deps -T api alembic upgrade head
dc up -d --wait --wait-timeout 180 "${SERVICES[@]}"
printf '%s %s\n' "$SHA" "$MODE" > "$STATE.tmp"
mv "$STATE.tmp" "$STATE"
echo "Deployed $SHA in $MODE mode."
