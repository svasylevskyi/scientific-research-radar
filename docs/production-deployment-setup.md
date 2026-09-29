# Enable production deployment from GitHub

The **Deploy production** workflow is manually started from `main`. It deploys the
exact immutable images published by successful full CI for that commit, always
in `scheduled` mode. Merging this workflow does not deploy or configure the host.
Until the repository variable `PROD_SSH_DEPLOY_ENABLED` is `true`, a manual run
only verifies the release and records it in the summary; the server job is skipped.

Complete this setup once on the existing production server. Keep the existing
admin SSH session available while configuring access. The first real tunnel/SSH
connection needs a controlled acceptance run; repository tests use temporary
repositories, dummy keys, and stub deployment commands.

## 1. Install the reviewed production command

Merge this PR and wait for successful **main CI**, including image publication.
Update the root-owned `/opt/radar/source` operator checkout to that reviewed main
commit, using the checkout commands in the [manual deployment guide](production-deployment.md#manual-fallback).
Do not run the deployment command yet if only preparing automation.

From `/opt/radar/source`, install the two production wrappers:

```bash
sudo install -o root -g root -m 755 infra/scripts/ssh-production-entrypoint.sh /usr/local/bin/radar-production-deploy-entrypoint
sudo install -o root -g root -m 755 infra/scripts/ssh-production-deploy-command.sh /usr/local/sbin/radar-production-deploy-command
```

Use a dedicated locked-password account named `radar-deploy`, with a separate SSH
key pair for production. Do not add it to the `docker` group or give it ordinary
sudo access. Its authorized key must use this forced command:

```text
restrict,command="/usr/local/bin/radar-production-deploy-entrypoint" ssh-ed25519 PUBLIC_KEY
```

Keep the account's authorized-key file and its parent directory root-owned and
not writable by `radar-deploy`. With `visudo -f /etc/sudoers.d/radar-production-deploy`,
grant only this command:

```text
radar-deploy ALL=(root) NOPASSWD: /usr/local/sbin/radar-production-deploy-command
```

The wrapper accepts only `deploy FULL_SHA scheduled BACKEND_DIGEST WEB_DIGEST`.
It rejects missing image pins, other modes, extra arguments, and shell syntax;
checks that the commit belongs to `main`; and forces `RADAR_ENVIRONMENT=production`.
It runs the existing deployment and status scripts from the trusted operator
checkout. That checkout and the installed wrappers must remain root-owned and
unwritable by the deployment account.

The workflow deploys application releases without moving this operator checkout.
When a later PR changes host scripts, deliberately update the checkout and any
installed wrappers to its reviewed main commit before relying on that behavior.
Existing cron jobs also use the operator checkout.

## 2. Create a separate production tunnel

Install WireGuard on the production host. Use new server and runner key pairs;
do not reuse development's keys or addresses.

| Setting | Production value |
| --- | --- |
| Server interface | `wg-radar-prod` |
| Server address | `10.78.0.1/32` |
| Runner address | `10.78.0.2/32` |
| Server listen port | UDP `51820` |
| Server peer AllowedIPs | `10.78.0.2/32` |
| Runner peer AllowedIPs | `10.78.0.1/32` (set by the workflow) |

Keep the server WireGuard configuration root-owned with mode `600`. Allow UDP
`51820` in both the Hetzner and host firewalls. Keep public TCP `22` restricted to
the admin IP. The endpoint must resolve directly to the server, using its public
IPv4 or a DNS-only hostname; it is not an HTTP endpoint.

Restrict traffic entering the tunnel to TCP `22` from `10.78.0.2` to `10.78.0.1`.
Drop all other tunnel INPUT and tunnel forwarding, including the `DOCKER-USER`
chain. Start the server tunnel after Docker so that chain exists. No NAT, default
route, DNS override, or container-network access is needed. Confirm these rules
against the host's existing firewall before enabling the tunnel.

The runner only routes the server's VPN address through WireGuard. The workflow
checks TCP `22` before attempting SSH and removes its keys/configuration and tunnel
on exit. Production deployments are serialized because they share one runner
peer. Development retains its existing `10.77.0.1/10.77.0.2` tunnel and workflow.

## 3. Configure the GitHub production environment

Create a GitHub Environment named **production** and restrict deployment branches
to **main**. Add these environment variables:

| Variable | Value |
| --- | --- |
| `PROD_SSH_HOST` | `10.78.0.1` |
| `PROD_SSH_USER` | `radar-deploy` |
| `PROD_WG_ENDPOINT` | Production public IPv4 or DNS-only hostname followed by `:51820` |
| `PROD_WG_SERVER_PUBLIC_KEY` | Production server WireGuard public key |

Add these environment secrets:

| Secret | Value |
| --- | --- |
| `PROD_SSH_KEY` | Dedicated production deployment SSH private key, including OpenSSH/PEM boundaries |
| `PROD_SSH_KNOWN_HOSTS` | Verified production SSH host key prefixed with `10.78.0.1` |
| `PROD_WG_PRIVATE_KEY` | Production runner WireGuard private key matching the server's authorized peer |

Obtain the known-hosts entry through the existing trusted admin SSH connection:

```bash
sudo awk '{print "10.78.0.1 " $1 " " $2}' /etc/ssh/ssh_host_ed25519_key.pub
```

These are three separate key types: the SSH deployment key, SSH host key, and
WireGuard peer keys. Do not commit private keys or paste them into PRs or logs.
Application secrets remain in `/etc/radar/production.env`; the workflow does not
replace that file or enable Stripe checkout. The server retains its existing
repository/registry access used by manual deployments.

Leave the **repository** variable `PROD_SSH_DEPLOY_ENABLED` unset or `false` until
the host, tunnel, and environment are ready. An environment-only variable cannot
enable this job because its condition is evaluated before that environment loads.

## 4. Verify and enable

1. With deployment disabled, run **Actions → Deploy production → Run workflow →
   main**. Confirm the release job succeeds, shows the selected SHA and both image
   digests, and explicitly says the server was not contacted. This tests release
   selection, not connectivity. If main CI is missing, run **CI → Run workflow →
   main**, wait for success, then start a new deployment run.
2. Let queued/running research finish. Set the repository variable
   `PROD_SSH_DEPLOY_ENABLED=true` and start a new **Deploy production** run on
   `main`. The commit selected when dispatching must have successful full main CI.
3. Check the workflow summary for successful server deployment and public website
   and API checks. The public checks use HTTPS GET, including `/health`.
4. In the trusted admin session, run the verification commands in the
   [deployment guide](production-deployment.md#verify). Confirm the recorded
   production release SHA and digests match the workflow, the scheduler/research
   services are healthy, and uptime/heartbeat monitors remain green. Check the
   authenticated workspace and a representative digest run.

The existing deployment performs a database backup before migrations, waits for
container health, and persists the selected release. It briefly stops public
services and refuses to deploy while research is active. It does not provide a
zero-downtime update or automatic rollback.

If a run fails or is interrupted, inspect the failed step and server state before
retrying. A public-check failure may happen after a successful deployment; an SSH
interruption may leave its final outcome unknown. Do not restore a backup or force
an older image onto a possibly migrated schema just to make the workflow green.
Set the repository enable variable to `false` to prevent new automated server
jobs while investigating; this does not stop one already running. The existing
manual deployment path remains available.
