#!/usr/bin/env bash
# Source only from the trusted root-owned deployment checkout.
verify_deploy_ref() {
  local source_dir=$1 target_sha=$2 environment=$3
  [[ $target_sha =~ ^[0-9a-f]{40}$ ]] || return 1
  git -C "$source_dir" fetch origin '+refs/heads/main:refs/remotes/origin/main' || return 1
  if git -C "$source_dir" merge-base --is-ancestor "$target_sha" refs/remotes/origin/main; then
    return 0
  fi
  if [[ $environment == development ]]; then
    git -C "$source_dir" fetch origin '+refs/heads/feature/paid-subscriptions:refs/remotes/origin/feature/paid-subscriptions' || return 1
    if git -C "$source_dir" merge-base --is-ancestor "$target_sha" refs/remotes/origin/feature/paid-subscriptions; then
      return 0
    fi
  fi
  echo 'Commit is not on an approved deployment branch for this environment.' >&2
  return 1
}
