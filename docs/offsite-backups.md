# Encrypted production backups

The host helper creates fresh PostgreSQL recovery bundles and encrypts them with
Restic before uploading to a private Cloudflare R2 bucket. This supplements local
daily dumps and Hetzner backups. It does not deploy the application, change the
live database, call Stripe/OpenAI, or send application email.

## What is saved

| File | Purpose |
| --- | --- |
| `database.dump` | Fresh custom-format PostgreSQL dump, checked with `pg_restore --list` before upload. |
| `application.env` | The production application's configuration and secrets. |
| `release`, `image-digests` | Exact deployed commit, operating mode, and backend/web image pins. |
| `monitoring.json`, if configured | Host monitoring configuration. |
| `closure-manifest.json` | Cumulative account IDs and closure request times. |
| `bundle.json` | Environment, timestamp and SHA-256 checksums of the saved files. |

The closure manifest also has its own snapshot, written before each database
backup and optionally every hour. Each update retains previously uploaded closure
IDs even if the local database has been rolled back. A failed read of the previous
manifest stops the operation. Recovery combines the selected database's manifest
with the newest independent manifest, rather than resurrecting accounts closed
after that database backup.

Restic credentials and its encryption password are **not** included. Keep them in
a password manager outside the server, together with the repository URL and
bucket/account details. Losing the encryption password makes recovery impossible.
An authorized server can also decrypt or delete its backups: encryption is not
immutability or protection from compromise of that server's R2 credentials.

The bundle is application recovery data, not a whole-server image. Recreate the
OS, Docker, firewall, SSH access and Caddy certificates separately. Keep the
repository and pinned GHCR images available. Mailpit messages, host logs, and
external Stripe/OpenAI/Resend records are outside this bundle.

## Prerequisites and private configuration

- Root-owned checkout at `/opt/radar/source`, an existing deployed release, and
  its saved `image-digests` file. A tag-only legacy release needs a normal pinned
  deployment first.
- Python 3.11 or newer and Restic on the host. Restic 0.18.1 is tested. CI installs
  Ubuntu's Restic package and tests real encrypted backup/recovery locally without
  any cloud credentials.
- Private R2 Standard bucket `radar-production-backups`, EU jurisdiction. Use a
  bucket-scoped **Object Read & Write** S3 credential and the EU endpoint.
- Separate Healthchecks.io check `radar-prod-offsite-backup`, Simple schedule,
  period **1 day**, grace **1 hour**, with a tested email integration. Do not reuse
  the local backup, API, disk, or worker check URLs.

Install `infra/production.restic.env.example` as
`/etc/radar/production.restic.env`, root-owned and mode `600`, only if the file
does not already exist. Fill in the S3 credentials, endpoint/account ID, a
separate random encryption password of at least 32 characters, and the off-site
check's base ping URL. Keep the existing file/password if the repository was
already initialized. No GitHub secret or application env change is needed.

The helper reads literal `KEY=value` lines, with optional quotes/comments. It
does not execute shell expressions. The repository URL is:

```text
s3:https://YOUR_ACCOUNT_ID.eu.r2.cloudflarestorage.com/radar-production-backups/production
```

For a **new, empty** repository, initialize it once after editing the example's
literal values. Run this in a root shell; do not enable shell tracing or paste
credentials into chat:

```bash
sudo -i
set -a
. /etc/radar/production.restic.env
set +a
restic init
restic check
exit
```

Skip initialization when it has already succeeded. Do not create public bucket
access or R2 lifecycle rules that expire arbitrary Restic objects; Restic manages
shared data across snapshots.

## First upload and isolated restore drill

After merging the helper, update the trusted host checkout. An application
redeployment, image rebuild and database migration are not needed:

```bash
cd /opt/radar/source
sudo git pull --ff-only
sudo env RADAR_ENVIRONMENT=production python3 infra/scripts/offsite_backup.py validate
sudo env RADAR_ENVIRONMENT=production python3 infra/scripts/offsite_backup.py backup
sudo env RADAR_ENVIRONMENT=production python3 infra/scripts/offsite_backup.py check
```

`validate` only checks local configuration. `backup` makes a fresh dump under
the normal deployment lock, exports closures, encrypts/uploads both snapshots,
and reads back saved metadata. A nonzero Restic exit, including a partial backup,
is a failure. Only complete success refreshes the off-site heartbeat; failures
send `/fail` when configuration is available. The helper logs no provider output,
credentials, application secrets or ping URLs. `check` reads and verifies all
repository data; it does not refresh the backup heartbeat.

Verify the off-site Healthchecks check becomes green. Then fetch the actual
remote backup into a **new** directory:

```bash
sudo env RADAR_ENVIRONMENT=production python3 infra/scripts/offsite_backup.py fetch \
  --target /var/backups/radar/production/offsite-drill-20260929
sudo env RADAR_ENVIRONMENT=production bash infra/scripts/restore.sh \
  /var/backups/radar/production/offsite-drill-20260929/database.dump \
  radar_restore_offsite_20260929
```

Choose new date/name suffixes on repeat drills. `fetch` selects the latest database
snapshot for the environment; `--snapshot FULL_64_CHARACTER_ID` selects an older
one. IDs appear in successful backup logs. It verifies bundle identity/checksums
and writes a checksum sidecar referring to the downloaded dump, a cumulative
`latest-closure-manifest.json`, and `recovery-selection.json` with both snapshot
IDs. It refuses an existing destination. The directory is mode `700`, files `600`.

The existing restore script creates a separate database and prints its schema
revision/user/run counts. It never switches the live application. Do not connect
workers, mail delivery or public access to the restored database. A failed fetch
or restore may leave a private directory or an empty database; inspect it and use
a new name rather than overwriting it automatically.

This drill proves remote retrieval, decryption, integrity and PostgreSQL restore.
Before real recovery, also test closure reconciliation and the application with
the matching code. Keep the recorded result/date and repeat the drill after
material schema/deployment changes and at least monthly. Remove the isolated
drill database and decrypted files after review so they do not become untracked
copies of retained personal data.

## Schedule and alerts

After a successful remote restore drill, retain the existing local backup and
monitor jobs. Add this **once** to root's `sudo crontab -e`:

```cron
37 3 * * * /usr/bin/env RADAR_ENVIRONMENT=production /usr/bin/python3 /opt/radar/source/infra/scripts/offsite_backup.py backup >> /var/log/radar-offsite.log 2>&1
```

The time is the server's time zone (`timedatectl`). Each job makes its own fresh
dump; it does not depend on the local 03:17 dump. Host off-site operations use a
separate lock to prevent overlapping uploads/recovery. Staging also takes the
shared deployment lock. A lock collision fails visibly; rerun after the other
operation completes. Network operations have timeouts. The default private
temporary directory needs enough free space for one fresh dump; files are
removed after success or failure during normal process exit.

For closure checkpoints every hour, create a **separate** Healthchecks check
`radar-prod-closure-checkpoint`, Simple schedule, period **1 hour**, grace
**15 minutes**, and the same tested alert integration. Add its base ping URL to
the existing protected file as `RADAR_CLOSURE_PING_URL='https://hc-ping.com/UUID'`.
Then run and verify it before scheduling:

```bash
sudo env RADAR_ENVIRONMENT=production python3 infra/scripts/offsite_backup.py validate
sudo env RADAR_ENVIRONMENT=production python3 infra/scripts/offsite_backup.py closures
sudo install -o root -g root -m 644 infra/radar-backup.logrotate /etc/logrotate.d/radar-backup
```

```cron
7 * * * * /usr/bin/env RADAR_ENVIRONMENT=production /usr/bin/python3 /opt/radar/source/infra/scripts/offsite_backup.py closures >> /var/log/radar-closures.log 2>&1
```

The hourly job sends no full database dump and does not refresh the daily backup
check. The daily backup does not mask a broken hourly job. Verify both automatic
heartbeats after their first scheduled runs. Keep only one writer per environment
and repository; this is a single-server workflow, not cross-host replication.

Daily backups imply up to approximately one day of lost database changes; hourly
closure checkpoints reduce the closure-record gap to approximately one hour
when jobs succeed. Alerts and restore review still matter: neither interval
guarantees zero loss. The last successful checkpoint's age is visible in its
snapshot/bundle metadata. Missed jobs extend those gaps.

## Recovery and retention decisions

During recovery, use a current closure export from the original database if it is
still available, plus the downloaded cumulative manifest. Apply migrations and
reapply closures only to the **isolated restored database**, using the application
container/dependencies and its `DATABASE_URL` explicitly pointed at that restored
database. Follow [account closure restoration](account-closure.md#backups-and-restoration).
Finish erasure and billing review before promotion. Do not copy historical
production settings over the running deployment or start its old schedules.
If closure records since the last checkpoint may be missing, investigate those
requests before reopening service.

The approved policy retains complete database snapshots for **35 days**. Independent
closure checkpoints use **65 days**: the same 35-day restorable-backup window plus
a 30-day recovery safety margin. Marker content is not removed merely because 65 days elapsed. The retention
command first prunes database snapshots, re-reads the surviving database inventory,
and drops an old marker only when its 65-day horizon has passed **and** no surviving
database snapshot predating that closure request remains. If retention has fallen
behind, the marker is kept fail-safe.

Retention is an explicit command, separate from backup success. It invokes Restic
`forget --prune` with the exact environment host, separate `radar-database` and
`radar-closures` tags, and `--group-by host,tags`. Never delete R2 objects or
Restic pack files directly.

Create a separate Healthchecks.io check for retention, add its base ping URL as
`RADAR_RETENTION_PING_URL`, verify it manually, then schedule daily after the
normal backup window:

```bash
sudo env RADAR_ENVIRONMENT=production python3 infra/scripts/offsite_backup.py retention
```

```cron
17 4 * * * /usr/bin/env RADAR_ENVIRONMENT=production /usr/bin/python3 /opt/radar/source/infra/scripts/offsite_backup.py retention >> /var/log/radar-offsite.log 2>&1
```

The command runs under the same off-site lock and has its own success/failure
heartbeat. A failed retention run does not falsify the earlier backup success and
must be investigated. Restic's keep-window semantics favor recoverability if no
new snapshot is produced, so monitoring remains part of enforcement. Continue to
run `check --read-data` regularly and before recovery, and perform actual restore
drills. A checksum alone does not establish application-level recoverability.

References: [Restic S3 repository setup](https://restic.readthedocs.io/en/stable/030_preparing_a_new_repo.html),
[repository checking](https://restic.readthedocs.io/en/stable/045_working_with_repos.html),
[retention](https://restic.readthedocs.io/en/stable/060_forget.html),
[R2 credentials](https://developers.cloudflare.com/r2/api/tokens/).
