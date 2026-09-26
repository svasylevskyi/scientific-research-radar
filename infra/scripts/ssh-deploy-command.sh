#!/usr/bin/env bash
# Install root-owned at /usr/local/sbin/radar-deploy-command.
# Used as the ONLY allowed sudo command for the dedicated radar-deploy account.
set -Eeuo pipefail
[[ $EUID == 0 ]] || exit 1
cd /opt/radar/source
# This checkout and installed command must be owned by root, not the SSH user.
source infra/scripts/release-images.sh
# Never eval or execute the incoming SSH command; accept only this grammar.
parse_deploy_request "${1:-}" || exit 1
source infra/scripts/deploy-ref.sh
verify_deploy_ref /opt/radar/source "$DEPLOY_SHA" development
exec bash infra/scripts/deploy.sh "$DEPLOY_SHA" "$DEPLOY_MODE" "$DEPLOY_BACKEND_DIGEST" "$DEPLOY_WEB_DIGEST"
