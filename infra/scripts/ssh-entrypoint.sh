#!/usr/bin/env bash
# Install root-owned at /usr/local/bin/radar-deploy-entrypoint and use as an
# authorized_keys forced command (restrict,command="...").
set -Eeuo pipefail
exec sudo -n /usr/local/sbin/radar-deploy-command "${SSH_ORIGINAL_COMMAND:-}"
