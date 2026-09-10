# Paid subscriptions implementation branch

Work is isolated on `feature/paid-subscriptions`. Do not merge this branch into main until the subscription implementation is reviewed and ready.

## Development deployment

The existing manually triggered workflow now permits only `main` and `feature/paid-subscriptions`. Checks still run before images are published, and deployment uses immutable commit tags. Server-side validation permits the subscription branch only for the `development` environment. Production continues to require main ancestry.

One-time server preparation, after reviewing this branch's infrastructure changes:

```bash
cd /opt/radar/source
sudo git fetch origin feature/paid-subscriptions
sudo git switch --track -c feature/paid-subscriptions origin/feature/paid-subscriptions
sudo install -o root -g root -m 755 infra/scripts/ssh-deploy-command.sh /usr/local/sbin/radar-deploy-command
```

If the local branch already exists, switch to it and fast-forward it instead. Keep this checkout and the installed command root-owned. The installed wrapper uses the validation helper in this checkout, so keep the checkout on the subscription branch during this development period.

In GitHub Settings → Environments → development, add the exact branch `feature/paid-subscriptions` to the allowed deployment branches, retaining `main`. Then run **Deploy development**, choose **Use workflow from: feature/paid-subscriptions**, and retain the desired mode (for the current complete dev setup, `scheduled`). No workflow run or server deployment is triggered by creating this branch.

This replaces the application in the existing development environment; it does not create a second site or database. Main's code is untouched, but subsequent branch migrations can affect the shared development database. Existing deployment backups remain enabled. Do not assume deploying an older main image reverses schema changes; review downgrade compatibility or restore a compatible backup when switching back.

## Proposed implementation sequence

1. Database-managed, versioned plans and prices, with super-admin publishing and explicit quotas. Existing members need an explicit migration policy; do not silently lock them out.
2. Subscription state and atomic usage reservations shared by manual runs, scheduled runs, and retries. Define charging/refund rules for failed runs before enforcement.
3. Hosted checkout and billing management in a payment provider's test environment. Verify webhook signatures; process events idempotently and reconcile delayed or out-of-order events. Provider payment state drives access, not checkout redirects.
4. User subscription/usage pages and admin subscription review. Handle renewal, cancellation, payment failures, tier changes, and period boundaries explicitly.
5. Abuse/concurrency tests, provider test-mode lifecycle tests, deployment configuration, and operational documentation before live payments.

Business decisions still needed: payment provider; initial tiers/prices/currency/quotas; trial and existing-user policy; upgrade/downgrade timing; failed-run quota rules. Prices and quotas should be managed in the database rather than hardcoded. Start with test payments only.

## Implemented: internal plan catalogue

All active admins, including ordinary admins, can use **Plans** in the header (`/admin/subscription-plans`). The catalogue starts empty; create draft plans with the editor. There are no automatic plan seeds, public catalogue changes, user assignments, billing requests or radar quota checks.

Configurable fields: stable plan code, name, description, internal state (Draft / Reviewed / Archived), currency (EUR/USD/GBP/PLN), monthly price, optional annual price, proposed tax display, maximum digests, papers per run (1–30), monthly papers, total monthly runs, manual runs within that total, scheduling frequencies, email delivery, trial days and future display order. Monthly allowances are separate from the proposed billing interval; annual billing does not imply an annual lump-sum allowance. These are planning values, not promises enforced in the product.

Every save appends a complete revision with UTC creation time, admin ID and required change note. Codes are stable; archive a plan instead of deleting audit history. Reviewed means internally reviewed, never purchasable. Multiple administrators may collaborate: the API requires `expected_revision`, and a unique database constraint prevents concurrent revision collisions. A stale save returns 409 and the editor preserves the unsaved input. Reload the catalogue and select Edit on the latest plan to reconcile it. Previous revisions are read-only.

API (all routes require admin authentication):

- `GET /api/v1/admin/subscription-plans?offset=0&limit=25`: current revisions, including archived plans.
- `POST /api/v1/admin/subscription-plans`: create or revise using `code`, `expected_revision` (0 for new), `change_note`, and validated `configuration`.
- `GET /api/v1/admin/subscription-plans/{code}/revisions?offset=0&limit=25`: immutable history.

Apply migration `20260910_0015` before running the new API (`alembic upgrade head`; automated deployment already does this). It adds only `subscription_plan_revisions`. Downgrading this migration removes the catalogue and its history; existing users, digests and runs are unchanged. Provider credentials and existing super-admin-only cost/pricing settings are not exposed to ordinary admins.

## Create initial draft plans (optional, one-time script)

After deploying the code containing this script, run from `/opt/radar/source`:

```bash
# Preview full proposed values without writing:
sudo bash infra/scripts/seed-subscription-plans.sh
# Create only plan codes that do not exist:
sudo bash infra/scripts/seed-subscription-plans.sh --apply
```

For local backend development use `python -m app.subscriptions.seed_plans` from `backend`, adding `--apply` to write. No Stripe keys or API calls are needed. No additional migration is added by this script; the catalogue migration must already be applied.

| Draft | Monthly / annual EUR | Digests | Papers per run / month | Total / manual runs per month | Schedules |
| --- | --- | --- | --- | --- | --- |
| Preview | 0 / not proposed | 1 | 10 / 10 | 1 / 1 | None |
| Explorer | 9 / 90 | 2 | 20 / 50 | 5 / 1 | Weekly, monthly, quarterly |
| Researcher | 19 / 190 | 5 | 30 / 200 | 20 / 5 | Daily, weekly, monthly, quarterly |
| Professional | 39 / 390 | 10 | 30 / 500 | 50 / 15 | Daily, weekly, monthly, quarterly |

These are starting proposals, not validated commercial allowances. Monthly prices and paper/topic/manual-run limits follow the earlier discussion; total-run limits of 1/5/20/50 are provisional protections for discovery and synthesis costs. Annual prices reflect two months' discount. Professional is capped at the currently supported 30 papers per run. Quarterly schedules are included on all paid drafts. A permitted daily frequency does not promise unlimited daily runs; total allowances will still apply once enforcement is implemented.

Preview proposes a 14-day, one-run trial with no scheduling, rather than recurring free research. The current catalogue cannot enforce one-time trial eligibility or expiry; implement those rules before offering Preview publicly. Paid draft trial days are zero. All drafts include email and leave the tax-display policy undecided.

The script never replaces an existing code, even if archived or customized, and never adds a revision to an existing plan. Repeating it is safe. Concurrent attempts are guarded by the unique code/revision constraint. Created entries record a system-origin change note; a missing admin ID can mean a system action or a subsequently deleted admin. Review and customize all values in Plans before moving beyond the draft stage. No public pricing, access, subscriptions, or radar usage changes.
