#!/usr/bin/env bash
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
load_release
dc logs --tail 100 "${1:-api}"
