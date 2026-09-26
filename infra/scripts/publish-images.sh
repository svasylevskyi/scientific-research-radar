#!/usr/bin/env bash
# Publish the archive tested by this CI run; never rebuild during publication.
set -Eeuo pipefail
archive=${1:?Provide the tested image archive}
manifest=${2:?Provide the release manifest destination}
gunzip -c "$archive" | docker load
repository=${GITHUB_REPOSITORY,,}
for component in backend web; do
  local_image="radar-ci-$component"
  revision=$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$local_image")
  [[ $revision == "$GITHUB_SHA" ]] || { echo 'Image revision does not match this CI commit.' >&2; exit 1; }
  # A rerun has its own tag, so concurrent publication cannot change its digest.
  image="ghcr.io/$repository-$component:$GITHUB_SHA-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"
  docker tag "$local_image" "$image"
  docker push "$image"
  digest=$(docker image inspect --format '{{json .RepoDigests}}' "$image" | python3 -c '
import json, sys
prefix = sys.argv[1] + "@"
matches = [value[len(prefix):] for value in json.load(sys.stdin) if value.startswith(prefix)]
if len(matches) != 1:
    raise SystemExit("Expected exactly one published image digest")
print(matches[0])
' "ghcr.io/$repository-$component")
  [[ $digest =~ ^sha256:[0-9a-f]{64}$ ]] || exit 1
  if [[ $component == backend ]]; then backend_digest=$digest; else web_digest=$digest; fi
  # Keep the old manual SHA interface; new deployments use the manifest digests.
  docker tag "$image" "ghcr.io/$repository-$component:$GITHUB_SHA"
  docker push "ghcr.io/$repository-$component:$GITHUB_SHA"
done
python3 infra/scripts/ci_release.py write --manifest "$manifest" \
  --backend-digest "$backend_digest" --web-digest "$web_digest"
echo "Verified images published for $GITHUB_SHA. Deploy development can now reuse this release." >> "$GITHUB_STEP_SUMMARY"
