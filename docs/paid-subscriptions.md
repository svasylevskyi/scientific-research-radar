# Paid subscriptions implementation branch

Work continues on `feature/paid-subscriptions`, with each reviewed increment merged separately. Sandbox checkout is disabled by default, so catalogue changes can be deployed without enabling billing.

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

Stripe is the selected provider; the first sandbox test uses the configured Explorer EUR 9 monthly / EUR 90 annual prices with inclusive tax behavior. Decisions still needed before public billing: final tiers and quotas, trial and existing-user policy, upgrade/downgrade timing, and failed-run quota rules. Prices and quotas should be managed in the database rather than hardcoded. Start with test payments only.

## Implemented: internal plan catalogue

All active admins, including ordinary admins, can use **Plans** in the header (`/admin/subscription-plans`). The catalogue starts empty; create draft plans with the editor. Catalogue editing itself does not seed plans, change the public catalogue, assign users, make billing requests or enforce radar quotas. Admin-only sandbox billing is a separate explicit flow described below.

Configurable fields: stable plan code, name, description, internal state (Draft / Reviewed / Archived), currency (EUR/USD/GBP/PLN), monthly price, optional annual price, proposed tax display, maximum digests, papers per run (1–30), monthly papers, total monthly runs, manual runs within that total, scheduling frequencies, email delivery, trial days and future display order. Monthly allowances are separate from the proposed billing interval; annual billing does not imply an annual lump-sum allowance. These are planning values, not promises enforced in the product.

Every save appends a complete revision with UTC creation time, admin ID and required change note. Codes are stable; archive a plan instead of deleting audit history. Reviewed means internally reviewed, never published for user purchase. Admin sandbox testing is separately gated. Multiple administrators may collaborate: the API requires `expected_revision`, and a unique database constraint prevents concurrent revision collisions. A stale save returns 409 and the editor preserves the unsaved input. Reload the catalogue and select Edit on the latest plan to reconcile it. Previous revisions are read-only.

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

## Stripe sandbox mapping and read-only verification

Plan revisions can now hold an optional `stripe_sandbox` mapping containing `product_id`, `monthly_price_id` and optional `annual_price_id`. These are identifiers, not API credentials. There is no mapping to live payments. The admin sandbox checkout described below uses this mapping. Existing plans have no mapping until an admin saves one. Changing a mapping creates a new audited plan revision; historical mappings remain intact.

In the selected Stripe development sandbox, create a restricted API key with **Read** access to **Products** and **Prices**, leaving unrelated permissions disabled. Store it only on the server, in `/etc/radar/development.env`:

```env
STRIPE_SANDBOX_API_KEY=rk_test_your_restricted_key
```

Apply this configuration with the next deployment (recreating the API container is necessary; a simple process restart will not import changed container environment variables). Compose passes this key to the API only and clears it in research, scheduler and ops containers. No publishable key, webhook secret, new Python dependency or database migration is needed for this step. Missing or live API keys cannot trigger provider requests.

After deploying, open Plans → Edit Explorer. Set the tax-display policy to Inclusive and verify the proposed EUR 9 monthly / EUR 90 annual amounts. Enable Stripe sandbox mapping and enter the identifiers from the prepared sandbox:

| Field | Identifier |
| --- | --- |
| Product | `prod_VEaTQTY3rUT2ni` |
| Monthly price | `price_1UE7Iw6NGESYebbCG0nKIFeL` |
| Annual price | `price_1UE7Og6NGESYebbCrbdzlLve` |

Save with a change note, then click **Check saved revision in Stripe** on the Explorer card. All admins may perform this check. It issues only GET requests for that product and its mapped prices, verifying sandbox mode, active status, product ownership, expected amount/currency, non-metered monthly/yearly intervals and explicit inclusive tax behavior. The result applies to the selected saved revision at the displayed time; it is not a permanent authorization for checkout. It does not run automatically on page load or catalogue edits. The sandbox checkout validates eligibility and current provider state independently before creating each new attempt.

Endpoint: `POST /api/v1/admin/subscription-plans/{code}/revisions/{revision}/check-stripe`. This initiates read-only provider checks; it never creates or updates a Stripe object. Provider failures return sanitized messages. No secrets or full provider objects are returned to the browser.

### If the tax setting was absent in the product editor

Sandbox and live mode should not be assumed to have different tax behavior. Stripe supports a default under Stripe Tax settings → Include tax in prices, plus per-price `tax_behavior`. An unspecified price may inherit a default; an automatic default uses inclusive behavior for EUR, but the integration does not assume that the sandbox uses this setting. For now the verifier explicitly reports unspecified as needing attention rather than claiming an inclusive match.

Check the actual returned behavior before changing anything. Once a price explicitly has inclusive or exclusive tax behavior, Stripe does not allow switching between them; a replacement price is needed if the explicit choice was wrong. Setting inclusive behavior alone neither enables automatic tax calculation nor establishes tax registrations.

References: [Stripe tax behavior](https://docs.stripe.com/tax/products-prices-tax-codes-tax-behavior), [restricted keys](https://docs.stripe.com/keys/restricted-api-keys), [retrieve prices](https://docs.stripe.com/api/prices/retrieve).

## Admin-only sandbox checkout and subscription lifecycle

Open **Admin → Plans → Test sandbox billing**. Any admin can test their own Explorer subscription, choose monthly or annual checkout, review saved status, refresh from Stripe, and open the customer portal. Ordinary users cannot access these endpoints. This does not publish plans, assign user entitlements, enforce quotas, enable real payments, or change radar usage. Draft and reviewed Explorer revisions may be tested; archived revisions and nonzero trials are rejected. The return page does not grant access or claim payment success.

Each attempt pins the immutable plan revision, Stripe price, and creation parameters. New attempts re-check current prices, including explicit inclusive tax behavior. Pending attempts resume their original revision even if the catalogue has changed. Completed work is not silently re-priced. A changed subscription price/quantity in Stripe is shown as a mismatch. A pending or nonterminal subscription blocks a second checkout for that admin. Only `canceled` and `incomplete_expired` subscriptions permit another; cancellation scheduled for period end does not yet permit one.

### Server setup (development sandbox only)

1. Deploy this revision. Migration `20260910_0016` creates isolated sandbox account-lock, checkout, and processed-event tables. The usual deployment script runs migrations. Local development needs `alembic upgrade head`.
2. In the **same Stripe sandbox** used for the mapped prices, extend or replace the read-only restricted key. The application now calls these resources:

   | Resource | Access needed |
   | --- | --- |
   | Products and Prices | Read |
   | Checkout Sessions | Write, including retrieval |
   | Subscriptions | Read |
   | Customer portal | Write for sessions, Read for configurations |

   Permission labels may be grouped in Stripe's key editor. Checkout creates its test customer and subscription; use the sandbox key editor's required dependencies if it requests additional permissions. Keep unrelated permissions disabled. The app itself never creates products/prices, updates subscriptions directly, or accepts live keys. Store the key only as `STRIPE_SANDBOX_API_KEY` on the API server; do not paste it into chat or the browser.
3. Configure the **sandbox customer portal** in Stripe. Enable cancellation (preferably at period end), payment-method updates and invoice history. Disable subscription/plan/quantity updates. Save the configuration and record its `bpc_…` ID. If the Dashboard does not show the ID, use the authenticated Stripe Workbench API explorer or CLI to list `GET /v1/billing_portal/configurations` in that sandbox; choose the active configuration whose settings you just saved. No new Radar secret is needed for this ID. The API validates the configuration before opening each portal session. A billing-email change in Stripe does not change the verified Radar login email.
4. In Stripe Workbench → Webhooks, create a **snapshot event** destination for **Your account** in that sandbox, with this public HTTPS endpoint:

   ```text
   https://research-radar-dev.duckdns.org/api/v1/webhooks/stripe-sandbox
   ```

   Subscribe to:

   ```text
   checkout.session.completed
   checkout.session.expired
   customer.subscription.created
   customer.subscription.updated
   customer.subscription.deleted
   ```

   Copy this endpoint's `whsec_…` signing secret to the server. A CLI listener uses a different signing secret; do not mix them. Thin events and Connect account events are not part of this integration.
5. Update `/etc/radar/development.env`:

   ```env
   STRIPE_SANDBOX_API_KEY=rk_test_your_restricted_key
   STRIPE_SANDBOX_WEBHOOK_SECRET=whsec_your_sandbox_endpoint_secret
   STRIPE_SANDBOX_PORTAL_CONFIGURATION_ID=bpc_your_sandbox_configuration
   STRIPE_SANDBOX_CHECKOUT_ENABLED=true
   ```

   Keep `FRONTEND_BASE_URL=https://research-radar-dev.duckdns.org`. Redeploy/recreate the API to load environment changes. Compose passes the Stripe credentials and enable flag only to the API, not research/scheduler/email workers. Setting checkout to false prevents new/resumed checkout and new portal sessions; webhook processing and explicit status refresh remain available for reconciliation. It does **not** cancel existing Stripe sandbox subscriptions or their test renewals.

No new Python/JavaScript dependency or paid middleware is needed for this increment. It uses the existing HTTP client and database. Stripe-hosted Checkout and portal handle test card data; Radar stores no card details, raw webhook payloads or customer billing addresses. Automatic tax is explicitly **disabled** in this sandbox checkout: the inclusive price is charged as configured, but no tax calculation or registration validation is implemented. Do not treat a successful sandbox payment as tax or production readiness.

### Manual acceptance tests after deployment

- As an admin, open Plans → Test sandbox billing; test the monthly Explorer price. In hosted Checkout use Stripe's successful test card `4242 4242 4242 4242`, a future expiry and any valid test CVC. Never use a real card. Return to Radar and wait for `active`; verify the event destination reports successful deliveries.
- Confirm repeated clicks/refreshes resume the same open Checkout session. Returning via Cancel leaves it open; it expires after one hour. Use **Refresh from Stripe** after expiry, or wait for the expiry webhook, to start a different interval.
- With a separate admin account, try Stripe's generic decline card `4000 0000 0000 0002`. Checkout should report the decline; Radar must not claim an active subscription. Correcting the card may complete that same checkout. Initial card-decline reasons stay in hosted Checkout; this page tracks checkout/subscription state, not a payment-attempt ledger.
- Open the portal after success. Update the test payment method, view invoices, and cancel at period end. On return, the cancellation notice should appear after the webhook or an explicit refresh. Immediate cancellation in the sandbox Dashboard should yield `canceled` and allow a new annual test checkout.
- Resend an actual event for this checkout from Workbench. Duplicate delivery should be acknowledged without duplicate data. Resending an older event after cancellation must still show the current canceled state.
- Renewal and failed-renewal state transitions are covered with mocked provider data in automated tests. For provider-level renewal tests, use Stripe Billing's sandbox simulation/test-clock tools. This checkout creates customers without a test clock, so existing checkout customers cannot simply be attached to a clock afterward. A separate clock-backed test fixture is a future addition; do not claim the automated tests performed a Stripe renewal. Ordinary sandbox renewals will be reflected through subscription updates and the current billing period.
- Confirm normal users have no sandbox page access and their digests/runs still work without subscription checks.

### Recovery and operational boundaries

The database records the exact checkout intent before the external POST. An ambiguous timeout is retried with the same Stripe idempotency key and parameters; concurrent requests serialize on a per-admin database row. If an unresolved intent is older than 23 hours, the app refuses to replay it because Stripe may prune keys after 24 hours. An operator must reconcile that attempt's `radar_attempt_id` metadata in the sandbox before clearing it; do not delete pending database rows to bypass this protection. If an unissued intent's one-hour expiry has already elapsed, Stripe can reject the frozen creation parameters; this also requires reconciliation rather than changing the idempotent request. Known sessions can be refreshed regardless of age.

Webhooks verify the original raw body with the endpoint secret, a constant-time signature comparison, and a five-minute timestamp tolerance. Keep the server clock synchronized. Processing fetches current provider state under the same per-admin lock rather than trusting event order. State and the event ID commit together; duplicate IDs are ignored, and a failed provider request is not acknowledged as processed, allowing Stripe to retry. Unknown events/unrelated sandbox objects are acknowledged without attaching them to a user. Provider operations have bounded timeouts. This small admin test handles events inline; a durable webhook inbox/worker and broader invoice/reconciliation monitoring should precede public billing scale.

Status polling reads only the database every ten seconds. **Refresh from Stripe** reconciles the latest attempt explicitly if events are delayed. A successful return URL alone has no effect. Deleting a Radar test account does not cancel its Stripe sandbox subscription; cancel it in Stripe before removing the account. Full invoices, tax outcomes, refunds, disputes, trials, plan switching, public checkout, entitlements and dunning policies remain future work.

API surface:

- `GET /api/v1/admin/subscription-testing` — own sandbox state and recent 20 attempts.
- `POST /api/v1/admin/subscription-testing/checkout` — `{ "revision": 1, "interval": "monthly" }` (or `annual`); uses server-side Explorer mapping.
- `POST /api/v1/admin/subscription-testing/refresh` — retrieve current Stripe state for own latest attempt.
- `POST /api/v1/admin/subscription-testing/portal` — own customer, fixed server-controlled return URL.
- `POST /api/v1/webhooks/stripe-sandbox` — public, signed Stripe snapshot events only.

Admin write/refresh operations share a limit of 20 attempts per minute per admin, in addition to existing API guards. Checkout URLs and customer IDs cannot be supplied by the browser. API errors exclude provider error bodies and secrets.

References: [Stripe webhooks](https://docs.stripe.com/webhooks), [idempotent requests](https://docs.stripe.com/api/idempotent_requests), [portal configurations](https://docs.stripe.com/api/customer_portal/configurations/retrieve), [Billing tests](https://docs.stripe.com/billing/testing), [test cards](https://docs.stripe.com/testing).

## Observation assignments and monthly usage accounting

**Admin → Plans → Assignments and usage** is the next development increment. A link on user details opens the same page with that user selected. All admins can assign a plan for comparison and inspect usage; ordinary admins cannot access the protected super-admin's records. Regular users have no observation endpoints or UI changes.

This is explicitly **observation only**. Everyone retains complimentary development access. An admin assignment is not a Stripe subscription or a claim of payment. Sandbox events never assign observation plans, and observation edits never modify Stripe. There is no enforcement switch in this implementation.

### Assignments

Choose a user, then a non-archived plan revision (draft or reviewed), and supply a reason. Each save appends an audited assignment with actor, timestamp and version. Concurrent edits using a stale version return 409. Existing assignments keep their exact plan revision when the catalogue changes. Select Complimentary to stop plan comparison for subsequent new runs. Existing run reservations and retries keep their original assignment.

Existing users start with an explicit complimentary development default (assignment version 0). Migration `20260910_0017` records their tracking start. New users also default to complimentary access; their observation account is created with the first tracked run or admin assignment. Assignment changes do not reset usage or delete history.

### Accounting rules for this phase

- Allowance windows are **UTC calendar months**, from the first day inclusive until the next first day exclusive. This applies equally to monthly and annual billing proposals. These are observation windows, not Stripe billing-cycle dates. No rollover.
- Each accepted enqueue reserves **one run**, one manual run if manually triggered, and the digest's requested maximum paper count. Scheduled runs consume total runs and papers, but not the manual-run allowance.
- A successful briefing settles one run and the number of actual persisted paper summaries. Unused reserved papers are released. A successful zero-paper briefing still counts as a completed run.
- A failed run releases all subscription allowances. Its actual partial-summary count remains visible for investigation, but does not consume monthly papers. Existing hourly/daily abuse limits and provider-cost recording are unchanged; failed work is not free of provider cost.
- A retry re-reserves the **same ledger entry and original allowance month**, using its original assignment, requested paper limit, trigger, and scheduling/email preferences. It adds an assessment/attempt count, not another charged run. Even a next-month retry adjusts the original month. A scheduled run retried manually remains scheduled for subscription accounting, while existing retry rate limits still apply.
- Per-user database locks serialize assignments and ledger transitions; the ledger has a unique run key. Enqueue and reservation commit together, including scheduler dispatch. Success/failure and settlement commit together. Rolled-back enqueue leaves no reservation.
- A deleted digest/run loses its navigation link but retains its usage, so deletion cannot reset monthly consumption. Deleting the whole user removes their observation records.
- **No historical backfill** is performed. Runs enqueued before deployment are excluded, even if they complete afterward. An explicit retry of an untracked old run starts observation in the retry's current month; its earlier attempts are not guessed. The admin page shows tracking coverage.

### Reading the admin page

The current assignment, completed/reserved runs and papers, manual allowance, failed/released runs, current digest inventory and remaining comparison allowances are shown together. Select a UTC month to review older usage. Remaining allowances always compare the selected month's total recorded usage against the **current** assignment, even if some runs used older assignments. Previously recorded per-attempt decisions retain their original plan context.

Every accepted run/retry records reasons it **would** be blocked by its assigned plan: monthly run/manual/paper allowances, per-run paper count, existing digest count above the plan maximum, disallowed schedule frequency, or email delivery not included. Those reasons never stop execution or sending email. Complimentary entries have no comparison limits. The inventory count/remaining digest allowance is current, not a reconstructed historical inventory. Digest creation/editing is not intercepted; this phase assesses the inventory when a run is enqueued.

The run ledger and assignment history are paginated. Over-limit run assessments can be inspected alongside the existing admin run details. Partial failures, retries and revisions remain distinguishable.

API (admin-only, same protected-user rules as user management):

- `GET /api/v1/admin/subscription-observation/{user_id}?period=2026-09-01&offset=0&limit=25` — monthly usage and run ledger; defaults to the current UTC month.
- `POST /api/v1/admin/subscription-observation/{user_id}/assignments` — `{ "plan_revision_id": 1, "expected_version": 0, "change_note": "Observe Explorer limits" }`; null plan ID selects complimentary comparison.
- `GET /api/v1/admin/subscription-observation/{user_id}/assignments?offset=0&limit=25` — append-only assignment audit.

The normal deployment applies migration `20260910_0017`; no new environment variables or provider permissions are required. Before paid access enforcement, we still need an explicit mapping from verified billing state to entitlements, decisions about billing-aligned allowance windows, user-facing subscription/usage pages, payment-failure policy, durable webhook processing and reconciliation. Observation data provides evidence for those choices without changing existing access.
