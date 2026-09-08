#!/usr/bin/env bash
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
load_release
dc ps -a
