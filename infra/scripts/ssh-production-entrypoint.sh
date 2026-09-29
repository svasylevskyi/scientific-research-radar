#!/usr/bin/env bash
# Forced command for the dedicated production deployment SSH key.
set -Eeuo pipefail
exec sudo -n /usr/local/sbin/radar-production-deploy-command "${SSH_ORIGINAL_COMMAND:-}"
