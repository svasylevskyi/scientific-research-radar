# Production updates

CI publishes verified images for successful `main` commits. **Deploy production**
uses those exact images, with `RADAR_ENVIRONMENT=production` and `scheduled` mode.
**Deploy development** remains separate and targets development only.

## GitHub workflow

Complete the [one-time production setup](production-deployment-setup.md) first.
The server deployment job is disabled until the repository variable
`PROD_SSH_DEPLOY_ENABLED=true` is set. Merging a PR does not trigger production
deployment.

1. Wait for successful **main CI** for the commit you intend to deploy, including
   image publication. PR checks alone do not publish a production release.
2. Let queued/running research finish, then choose **Actions → Deploy production →
   Run workflow → main**. The workflow selects the exact commit at dispatch time,
   validates its successful CI manifest, and deploys the pinned backend/web images.
3. Check the workflow summary and public website/API checks, then follow **Verify**
   below. Scheduled runs remain enabled. Production configuration and application
   secrets stay on the server.

A failed or interrupted run requires inspection before retrying. There is no
automatic rollback, including when the public checks fail after deployment.
Changes to host scripts also require an intentional update of the root-owned
operator checkout and any installed wrappers; the workflow does not update them.

## Manual fallback

### Select the release

1. Merge the PR and wait for the **CI run on the resulting main commit** to finish
   successfully, including image publication. PR checks alone do not publish a
   production release. If CI did not start, run **CI → Run workflow → main**.
2. In that successful run, download the artifact named
   `verified-release-<full-commit-sha>-<attempt>` and open `verified-release.json`.
3. Take `sha`, `backend_digest`, and `web_digest` from that same manifest. Confirm
   its repository is `svasylevskyi/scientific-research-radar`, its SHA matches the
   successful main run, and its run ID/attempt match that run. Do not reuse the
   previous release's image digests with a new commit.

### Deploy on the production server

Let any queued/running research finish first. The deployment stops web/API and
scheduler services briefly, checks for active work, backs up the database, applies
migrations, and starts the selected services. It aborts and restores current
services if research is still active. An error after migrations begin requires
inspection; do not force an older image onto a possibly changed schema.

In your SSH session, replace the three quoted placeholders with the manifest values:

```bash
RADAR_RELEASE_SHA='PASTE_MANIFEST_SHA'
RADAR_BACKEND_DIGEST='PASTE_MANIFEST_BACKEND_DIGEST'
RADAR_WEB_DIGEST='PASTE_MANIFEST_WEB_DIGEST'
```

Then update the root-owned operator checkout to the selected main release. This
works even if it is currently detached. Stop if any command fails; do not discard
local checkout changes to force an update.

```bash
cd /opt/radar/source
sudo git fetch origin '+refs/heads/main:refs/remotes/origin/main'
sudo git merge-base --is-ancestor "$RADAR_RELEASE_SHA" origin/main
sudo git checkout --detach "$RADAR_RELEASE_SHA"
sudo env RADAR_ENVIRONMENT=production bash infra/scripts/deploy.sh \
  "$RADAR_RELEASE_SHA" scheduled "$RADAR_BACKEND_DIGEST" "$RADAR_WEB_DIGEST"
```

The script also checks that the commit belongs to main and that both immutable
image digests declare that exact commit. Production configuration remains in
`/etc/radar/production.env`; do not copy development credentials or change Stripe
checkout settings for this update.

## Verify

```bash
sudo env RADAR_ENVIRONMENT=production bash infra/scripts/status.sh
curl --fail --silent --show-error https://getresearchradar.com/health
sudo env RADAR_ENVIRONMENT=production bash infra/scripts/monitor.sh
sudo cat /etc/radar/production.release
RADAR_DEPLOYED_SHA=$(sudo awk '{print $1}' /etc/radar/production.release)
sudo cat "/opt/radar/releases/$RADAR_DEPLOYED_SHA/image-digests"
```

Confirm the recorded SHA and image digests match the selected CI manifest. Check
the website, authenticated workspace, and independent uptime/heartbeat monitors.
Follow the release's acceptance checks, including a new digest run when research
behavior changes. Refreshing an older run does not regenerate its saved output.
