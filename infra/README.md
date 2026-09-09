# Remote development on Hetzner

This is a single-server deployment, not a high-availability production system.
The existing scheduler process also delivers briefing emails; no separate email
worker or Redis is needed. Application services run with production security
validation even in the development environment. HTTPS and strong secrets are required.

## What runs

| Mode | Processes | External effects |
| --- | --- | --- |
| `base` (default) | PostgreSQL, Mailpit, API, web proxy | No research worker or scheduler; account emails captured in Mailpit |
| `research` | Base + research worker | Accepted Run now requests make billable OpenAI calls |
| `scheduled` | Research + scheduler/delivery | Due schedules also make billable calls; briefing emails follow SMTP configuration |

The API retains its existing behavior: if a key is configured, it can accept a
run even when no worker is started. That run stays queued. Do not click Run now
in base mode. Deployment refuses queued/running work; start the existing release
in research mode to finish accepted work before upgrading (see recovery below).

Only ports 80/443 are public. Mailpit binds to server loopback port 8025; PostgreSQL
and the API have no host port mappings. The proxy has a fixed address on an
isolated network; Uvicorn trusts forwarded client addresses only from that proxy.
Caddy overwrites incoming forwarded addresses, preserving per-IP rate limits.
Temporary configuration and migration commands use a dedicated `ops` service
on the data network, so they can run while the API occupies its fixed proxy address.
The 172.29.10.0/24 subnet must not overlap an existing server/VPN network.

## 1. Before the first release

The server should already have Ubuntu, Docker Engine/Compose, key-only SSH,
`radaradmin` with sudo, and a Hetzner firewall allowing your IP to SSH and public
HTTP/HTTPS. Keep IPv6 firewall rules consistent if IPv6 is enabled.

Choose a free hostname (for example an available DuckDNS subdomain), point its A
record to this server, and only publish an AAAA record if IPv6 works. Caddy obtains
and renews the certificate when web starts. No custom domain purchase is needed.

After merging the infrastructure PR into main:

```bash
sudo git clone https://github.com/svasylevskyi/scientific-research-radar.git /opt/radar/source
cd /opt/radar/source
sudo install -m 600 infra/development.env.example /etc/radar/development.env
sudo nano /etc/radar/development.env
```

Set PUBLIC_HOST to the hostname only (no scheme or path). Set your admin email.
Generate THREE separate secrets with `openssl rand -hex 32`: database password,
JWT secret, and bootstrap admin password. Paste them into the matching fields.
Keep this file root-owned and mode 600; never paste it into chat or commit it.
POSTGRES_PASSWORD must be hexadecimal for this Compose database URL. Changing it
later requires changing the database role password too; editing the file alone
does not update an existing PostgreSQL volume. Changing the bootstrap password
does not reset an already-created super-admin account's password.

Leave OPENAI_API_KEY unset initially. Mailpit captures account verification and
recovery messages, so no SMTP credentials are needed. All actual model names are
configured in the environment; no model-access assumption is made by deployment.
The local SQLite database is untouched; this is a fresh PostgreSQL database.

## 2. Build and deploy manually

In GitHub Actions select **Deploy development**, branch **main**, mode **base**.
The workflow re-runs CI, then builds/publishes images for that exact commit. The
workflow must be on main before GitHub displays its manual trigger.

The first publication may create private GHCR packages. Either make the two
container packages public (they contain code and prompts, never environment
files), or authenticate the server with a read-only `read:packages` credential:

```bash
sudo docker login ghcr.io
```

Do not place a registry token on a command line. Use the password prompt. Package
access must be granted to the repository's GITHUB_TOKEN if publication is denied.

The workflow summary prints a command using the full 40-character commit SHA:

```bash
cd /opt/radar/source
sudo git pull --ff-only
sudo bash infra/scripts/deploy.sh FULL_COMMIT_SHA base
```

This uses published images; it does not build on the server. Images must exist
before deployment. Only commits already merged into origin/main are accepted.
The source checkout is root-owned because its scripts execute with sudo.

Deployment checks configuration and pulls images before interrupting services.
For updates it stops web/API/scheduler, checks for queued/running research, and
restores the prior services if any remain. It then stops research, creates a
backup, migrates once, and starts the selected mode. Migration or startup failure
leaves services stopped/unhealthy for inspection; no automatic database downgrade
or old-image restart occurs. Brief downtime during development deployment is expected.

A successful first deploy must pass:

- `sudo bash infra/scripts/status.sh`: API healthy, DB healthy, web running.
- Browser HTTPS opens the landing page and registration page.
- Registration and email confirmation work using Mailpit below.
- Login, refresh, logout, digest creation/editing work.
- Recreating API containers preserves account and digest data.

### Mailpit inbox

From your computer (replace the IP):

```powershell
ssh -i "$env:USERPROFILE\.ssh\radar_dev" -L 8025:127.0.0.1:8025 radaradmin@YOUR_SERVER_IP
```

Open http://localhost:8025 in your browser. Keep the tunnel open. This inbox
contains verification codes and reset links; do not expose it publicly. Messages
are retained on a volume with a 500-message cap. No email goes to actual inboxes.

## 3. Enable research and scheduling deliberately

Add OPENAI_API_KEY and your available OPENAI_RADAR_MODEL to the protected env file.
Use a separate development API project/key and provider spending controls.

Deploy the same SHA in `research` mode to test Run now. Once that succeeds, choose
`scheduled` mode to test recurrence and briefing delivery. Inspect saved schedules
before enabling: an overdue schedule can enqueue immediately under the existing
coalescing rules. CI never includes OpenAI credentials or real SMTP delivery.

API DB readiness probes run separately from /health. Worker probes use progress
heartbeats: research loop/OpenAI polling and successful scheduler ticks. They are
not independent uptime alerts. Docker marks stale probes unhealthy; it restarts
exited containers but does not automatically restart every unhealthy container.

## 4. Backups from day one

```bash
cd /opt/radar/source
sudo bash infra/scripts/backup.sh
```

Backups are custom-format PostgreSQL dumps with SHA-256 checksums under
`/var/backups/radar/development`. Files have restrictive permissions. Seven days
are retained locally; no app secrets are included. Dump files are not encrypted
at rest by this script; protect them like the database.

Add a daily job with `sudo crontab -e`:

```cron
17 3 * * * /bin/bash /opt/radar/source/infra/scripts/backup.sh >> /var/log/radar-backup.log 2>&1
```

The time is the server's time zone (check `timedatectl`). Add log rotation for this
file:

```bash
sudo install -m 644 infra/radar-backup.logrotate /etc/logrotate.d/radar-backup
```

Cron failures are visible in the log; alerting is not yet configured.

**Off-server storage is still a setup requirement.** Select an encrypted backup
destination before relying on these backups. A server disk snapshot or a dump on
the same server does not protect against account/server loss. Until an automated
remote destination is configured, download copies over SSH and keep them in
protected storage. Preserve the env file separately in a password manager or
an encrypted backup, including the JWT secret and database password.

Restore verification NEVER overwrites the live database:

```bash
sudo bash infra/scripts/restore.sh /var/backups/radar/development/FILE.dump radar_restore_check
```

It verifies the checksum, creates a new database, restores transactionally, and
prints the migration revision and row counts. Existing destinations are rejected.
If a dump is moved, regenerate its checksum sidecar using the new absolute path
only after comparing its hash with the original checksum. CI exercises this script.
A failed restore may leave an empty destination; inspect/drop it before retrying.

For disaster recovery, restore to a new database and verify with matching code;
plan the database cutover separately. Do not start workers against a restored
copy: it contains historical schedules and delivery records that could send mail
or incur costs again. Restores cannot undo externally accepted email/OpenAI jobs.
Never run `docker compose down -v` on the server; that deletes persistent data.

## 5. Optional direct deployment from GitHub

Initially GitHub publishes images and you run the printed deployment command over
your existing SSH session. This is intentional: your current Hetzner SSH rule only
allows your home IP, not GitHub runners. No infrastructure token is needed in CI.

To enable the optional SSH deployment job, first arrange a reachable deployment
path (for example a runner with a controlled egress IP or an authenticated VPN).
Do not open SSH to all addresses merely to work around a failed workflow. The
standard hosted runner needs firewall access separately; setting secrets alone
will not establish connectivity. If using a private runner, adjust `runs-on` for
the deploy job and never use that runner for untrusted pull-request builds.

Use a separate locked-password account named `radar-deploy` and a dedicated SSH
key, not your personal admin key. Install these scripts as root-owned executables:

```bash
sudo install -m 755 infra/scripts/ssh-entrypoint.sh /usr/local/bin/radar-deploy-entrypoint
sudo install -m 755 infra/scripts/ssh-deploy-command.sh /usr/local/sbin/radar-deploy-command
```

Authorize only this forced command for its public key:

```text
restrict,command="/usr/local/bin/radar-deploy-entrypoint" ssh-ed25519 PUBLIC_KEY
```

Use `visudo -f /etc/sudoers.d/radar-deploy` to grant only:

```text
radar-deploy ALL=(root) NOPASSWD: /usr/local/sbin/radar-deploy-command
```

The wrapper accepts only `deploy FULL_SHA MODE`, checks main ancestry, and never
evals SSH input. This key still has deployment authority and must be protected.
The deployment source and wrapper must remain root-owned. Update installed
wrappers intentionally when their reviewed implementation changes.

Create a GitHub Environment `development`, restricted to main, with secrets
DEV_SSH_KEY and DEV_SSH_KNOWN_HOSTS, and variables DEV_SSH_HOST and DEV_SSH_USER.
Verify the host public key fingerprint through your existing trusted session or
Hetzner console before recording known_hosts; do not trust an unchecked ssh-keyscan.
Enable the repository variable DEV_SSH_DEPLOY_ENABLED=true only once that path is
configured. The manual workflow then publishes and deploys automatically.

## Operations and recovery

```bash
sudo bash infra/scripts/status.sh
sudo bash infra/scripts/logs.sh api
sudo bash infra/scripts/logs.sh research
sudo bash infra/scripts/logs.sh scheduler
```

Scripts use `/etc/radar/development.release` to identify the last successful SHA
and mode. A failed upgrade may have a newer database schema; inspect logs and
migration state before restarting an older release. Preserve the pre-upgrade dump.

To operate the last successful release manually, use a root shell:

```bash
sudo -i
source /opt/radar/source/infra/scripts/common.sh
load_release
# Inspect first, then use one of these as appropriate:
dc ps -a
# dc stop web api scheduler
# dc up -d --wait "${SERVICES[@]}"
```

If work was queued in base mode and you have chosen to execute it, call
`set_release "$SHA" research` then `dc up -d --wait "${SERVICES[@]}"` in this shell.
This starts billable work. Once it finishes, retry the deployment. Never delete
queued rows or clear leases just to bypass the deployment guard.

Backups/deployments/restores share a host lock. Do not manually run migrations
while these scripts or application writers are active. Docker starts enabled
services after reboot; opt-in profiles control creation, not already-created
container restart policies. To suspend research/schedules, stop their containers.

## Reuse for production

The frontend uses relative /api/v1 URLs and the same images work with another host.
RADAR_ENVIRONMENT selects a different env/release file, Compose project, and backup
folder. A separate server is required by this initial fixed-port/fixed-proxy-subnet
layout. Use production.env.example as a starting point, provide real SMTP, and set
RADAR_ENVIRONMENT=production consistently for operations and cron.

Before paid launch, add independent backup storage/alerts, restore drills,
production monitoring, provider budget controls, safe database upgrades and
retention policies. Configure separate credentials and integration accounts.
This development setup does not provide database failover or zero-downtime updates.
