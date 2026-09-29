#!/usr/bin/env bash
# Install root-owned at /usr/local/sbin/radar-production-deploy-command.
set -Eeuo pipefail
[[ $EUID == 0 && $# == 1 ]] || exit 1
source /opt/radar/source/infra/scripts/production-deploy.sh
run_production_deploy /opt/radar/source "$1"
