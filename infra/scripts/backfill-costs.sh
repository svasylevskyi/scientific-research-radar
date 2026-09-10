#!/usr/bin/env bash
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
load_release
lock
dc exec -T api python -m app.radar.backfill_costs "$@"
