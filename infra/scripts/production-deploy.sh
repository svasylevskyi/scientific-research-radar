#!/usr/bin/env bash
# Source only from the trusted root-owned operator checkout.
run_production_deploy() (
  set -Eeuo pipefail
  local source_dir=$1 request=$2
  cd "$source_dir"
  source infra/scripts/release-images.sh
  parse_deploy_request "$request" || { echo 'Invalid deployment request.' >&2; return 1; }
  # Production automation cannot disable workers or fall back to mutable tags.
  [[ $DEPLOY_MODE == scheduled && -n $DEPLOY_BACKEND_DIGEST && -n $DEPLOY_WEB_DIGEST ]] || {
    echo 'Production requires scheduled mode and both image digests.' >&2; return 1;
  }
  source infra/scripts/deploy-ref.sh
  verify_deploy_ref "$source_dir" "$DEPLOY_SHA" production || return 1
  export RADAR_ENVIRONMENT=production
  bash infra/scripts/deploy.sh "$DEPLOY_SHA" scheduled "$DEPLOY_BACKEND_DIGEST" "$DEPLOY_WEB_DIGEST" || return $?
  bash infra/scripts/status.sh
)
