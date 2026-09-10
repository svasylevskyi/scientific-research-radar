#!/usr/bin/env bash
# Install root-owned at /usr/local/sbin/radar-deploy-command.
# Used as the ONLY allowed sudo command for the dedicated radar-deploy account.
set -Eeuo pipefail
[[ $EUID == 0 ]] || exit 1
# Never eval or execute the incoming SSH command; accept only this grammar.
read -r verb sha mode extra <<< "${1:-}"
[[ $verb == deploy && $sha =~ ^[0-9a-f]{40}$ && -z ${extra:-} ]] || exit 1
[[ $mode == base || $mode == research || $mode == scheduled ]] || exit 1
cd /opt/radar/source
# This checkout and installed command must be owned by root, not the SSH user.
source infra/scripts/deploy-ref.sh
verify_deploy_ref /opt/radar/source "$sha" development
exec bash infra/scripts/deploy.sh "$sha" "$mode"
