#!/usr/bin/env bash
# Source from trusted operator scripts. Keep legacy SHA releases readable.
validate_image_digests() {
  local backend=${1:-} web=${2:-}
  if [[ -z $backend && -z $web ]]; then return 0; fi
  [[ $backend =~ ^sha256:[0-9a-f]{64}$ && $web =~ ^sha256:[0-9a-f]{64}$ ]] || {
    echo 'Provide both valid backend and web SHA-256 image digests.' >&2
    return 1
  }
}

select_release_images() {
  local release=$1 repository=$2 sha=$3 backend=${4:-} web=${5:-} saved
  validate_image_digests "$backend" "$web" || return 1
  if [[ -f $release/image-digests ]]; then
    saved=$(cat "$release/image-digests")
    [[ $saved =~ ^(sha256:[0-9a-f]{64})\ (sha256:[0-9a-f]{64})$ ]] || {
      echo 'Invalid saved image digests.' >&2; return 1;
    }
    if [[ -n $backend && "$backend $web" != "$saved" ]]; then
      echo 'This release already pins different images. Deploy a new commit instead.' >&2
      return 1
    fi
    backend=${BASH_REMATCH[1]} web=${BASH_REMATCH[2]}
  fi
  if [[ -n $backend ]]; then
    export BACKEND_IMAGE="ghcr.io/$repository-backend@$backend"
    export WEB_IMAGE="ghcr.io/$repository-web@$web"
  else
    export BACKEND_IMAGE="ghcr.io/$repository-backend:$sha"
    export WEB_IMAGE="ghcr.io/$repository-web:$sha"
  fi
}

save_image_digests() {
  local release=$1 backend=${2:-} web=${3:-}
  validate_image_digests "$backend" "$web" || return 1
  [[ -n $backend ]] || return 0
  printf '%s %s\n' "$backend" "$web" > "$release/image-digests.tmp"
  mv "$release/image-digests.tmp" "$release/image-digests"
}

parse_deploy_request() {
  local command=${1:-} verb extra
  [[ $command != *$'\n'* && $command != *$'\r'* ]] || return 1
  read -r verb DEPLOY_SHA DEPLOY_MODE DEPLOY_BACKEND_DIGEST DEPLOY_WEB_DIGEST extra <<< "$command"
  [[ $verb == deploy && $DEPLOY_SHA =~ ^[0-9a-f]{40}$ && -z $extra ]] || return 1
  [[ $DEPLOY_MODE == base || $DEPLOY_MODE == research || $DEPLOY_MODE == scheduled ]] || return 1
  validate_image_digests "$DEPLOY_BACKEND_DIGEST" "$DEPLOY_WEB_DIGEST"
}
