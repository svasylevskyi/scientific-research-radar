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

Configurable fields: stable plan code, name, description, internal state (Draft / Reviewed / Archived), currency (EUR/USD/GBP/PLN), monthly price, optional annual price, proposed tax display, maximum digests, papers per run (1–30), monthly papers, total monthly runs, manual runs within that total, scheduling frequencies, email delivery, trial days and future display order. Monthly allowances are separate from the proposed billing interval; annual billing does not imply an annual lump-sum allowance. These are internal configuration values. The separate opt-in sandbox access layer below uses the immutable revision saved at checkout; editing this catalogue alone does not change existing access.

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

These are starting proposals, not validated commercial allowances. Monthly prices and paper/topic/manual-run limits follow the earlier discussion; total-run limits of 1/5/20/50 are provisional protections for discovery and synthesis costs. Annual prices reflect two months' discount. Professional is capped at the currently supported 30 papers per run. Quarterly schedules are included on all paid drafts. A permitted daily frequency does not promise unlimited daily runs; total allowances apply when an account is explicitly opted into sandbox subscription limits.

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

Open **Admin → Plans → Test sandbox billing**. Any admin can test their own Explorer subscription, choose monthly or annual checkout, review saved status, refresh from Stripe, and open the customer portal. Ordinary users cannot access these endpoints. This does not publish plans or enable real payments. Accounts explicitly opted into sandbox limits use the verified subscription state through the separate access layer described below. Draft and reviewed Explorer revisions may be tested; archived revisions and nonzero trials are rejected. The return page does not grant access or claim payment success.

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

Webhooks verify the original raw body with the endpoint secret, a constant-time signature comparison, and a five-minute timestamp tolerance. Keep the server clock synchronized. Processing fetches current provider state under the same per-admin lock rather than trusting event order. The HTTP endpoint acknowledges a relevant event after inbox persistence. The worker then commits provider state and the processed-event marker together; duplicate IDs are ignored. Failed provider reads retry through the local queue, while Stripe retries deliveries that were never durably received. Unknown events/unrelated sandbox objects are acknowledged without attaching them to a user. Provider operations have bounded timeouts. Events now enter the durable inbox described below. Broader invoice handling and external billing alerts remain prerequisites for public billing scale.

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

This assignment ledger is explicitly **observation only**. Effective access is managed separately; complimentary development access remains the default. An admin assignment is not a Stripe subscription or a claim of payment. Sandbox events never assign observation plans, and observation edits never modify Stripe. The separate access-policy UI controls opt-in sandbox enforcement; observation assignments do not.

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

The normal deployment applies migration `20260910_0017`; no new environment variables or provider permissions are required. Subsequent increments below add durable synchronization and opt-in sandbox entitlements with billing-aligned windows. Observation data stays separate and continues to provide comparison evidence.

## Durable sandbox synchronization

Migration `20260911_0018` adds a durable webhook inbox, recurring reconciliation jobs and an API-worker heartbeat. Deployment starts processing automatically through the API lifespan; no new container, queue service, Stripe key permissions, webhook event selections or required environment variables are needed. The existing test key and signing secret continue to apply. No provider calls occur in automated tests.

The webhook endpoint verifies its raw-body signature and then saves a minimal relevant event (event ID/type, object ID, known checkout reference). It returns success only after that database transaction commits. It never waits for Stripe API calls. Duplicate event IDs preserve the original job and do not reset attempts. Unrelated event types, untagged objects and unknown checkout references are acknowledged as ignored. Raw provider payloads, card/billing details and arbitrary metadata are not retained. Previously processed event IDs are still honored after this migration.

A background worker in each running API process claims database jobs with an exclusive two-minute lease. Multiple API processes can cooperate: compare-and-set claims and token/deadline checks prevent an expired worker from committing provider state. Current provider observations, the processed-event marker, and the completed queue state commit together. If a process dies, its saved work is reclaimed after lease expiry. API downtime pauses work without losing the inbox; Stripe retries requests that never committed.

Provider/network failures use exponential retry delays: 30, 60, 120 seconds, continuing up to a one-hour cap. After eight consecutive failed executions by default, the job stays **failed** until reviewed and manually retried. Worker interruption/lease expiry is reclaimed separately. A manual retry records the requesting admin, timestamp and cumulative manual request count; it cannot duplicate already pending/actively processing work. Completed webhook jobs cannot be replayed through this API; a current-state reconciliation can be requested instead.

Every known local checkout gets one reusable reconciliation job, including checkouts created before this migration. The worker discovers up to 25 missing jobs per tick, then processes one due job. Successful reconciliation repeats every 15 minutes by default for open/nonterminal attempts. Canceled/incomplete-expired subscriptions stop periodic polling after invoice history import is complete; expired checkouts without a subscription stop after being observed; signed events and explicit admin reconciliation remain available. Terminal historical attempts therefore receive an initial check, not endless polling.

Reconciliation retrieves existing checkout/subscription objects. It never issues a Stripe write or changes usage allowances. Its verified observations feed the opt-in access policy described below. It repairs locally missed state changes such as checkout completion, renewal-period advancement, payment failure and cancellation. It covers locally known attempts rather than scanning the whole Stripe account. If an ambiguous checkout creation left no provider identifier, the job shows an actionable error asking the owner to resume the original idempotent checkout. It does not create a replacement checkout or guess an association from billing email. If that original checkout cannot be resumed safely, the previously documented operator reconciliation procedure still applies.

### Admin synchronization view

Open **Admin → Plans → Billing synchronization**, or use the link from Sandbox billing/user details. The page reads the database every ten seconds and shows:

- Worker heartbeat, status counts and paginated jobs, filterable by status and owning user.
- Relevant Stripe event type or reconciliation job, owning account and checkout attempt.
- Last attempt, last successful job, last verified provider state, next retry/check, subscription status and price mismatch.
- Sanitized failure reason, attempts, consecutive failures and manual-request information.
- **Retry synchronization** for retryable failures/expired claims, and **Reconcile now** for a previously completed reconciliation job.

Ordinary admins cannot list, count, or retry protected super-admin jobs. Normal users have no access. No queue payloads, claim tokens or credentials are returned to the UI. A healthy worker heartbeat is not a claim that all jobs succeeded; failed jobs remain prominent. The API also emits a warning with job ID and exception type for failed executions, without logging provider payloads or credentials. External failure notifications/monitor alerts are not added in this increment.

API:

- `GET /api/v1/admin/billing-sync?state=failed&user_id=<uuid>&offset=0&limit=25`
- `POST /api/v1/admin/billing-sync/{job_id}/retry` — queues the job and returns 202; uses the shared per-admin sandbox-operation rate limit.

Optional settings (defaults suffice for the development deployment):

```env
STRIPE_SYNC_POLL_SECONDS=5
STRIPE_SYNC_RECONCILE_SECONDS=900
STRIPE_SYNC_MAX_FAILURES=8
```

The background processor runs only in the API application, where Stripe credentials already reside. Research and scheduler processes do not start it. Turning off `STRIPE_SANDBOX_CHECKOUT_ENABLED` continues to stop new checkout/portal sessions but deliberately does **not** stop synchronization of existing sandbox subscriptions. This is still a sandbox integration; public/live billing is not enabled.

### Acceptance checks

1. After deployment, open Billing synchronization. Confirm a recent heartbeat and reconciliation jobs for existing sandbox checkouts.
2. Complete/cancel a sandbox subscription or resend one of its actual events through Stripe Workbench. The endpoint should acknowledge promptly; the saved job should progress to processed and subscription state should update.
3. Resend the same event: no second job or duplicate subscription should appear.
4. Click Reconcile now on a completed reconciliation job; it should run once and schedule its next check if still nonterminal.
5. Review admin visibility with an ordinary admin: protected super-admin jobs must be absent from lists and counts.

Automated tests simulate provider outages, backoff/exhaustion/manual retry, lost webhooks, expired/stale worker leases, atomic rollback, out-of-order events, and concurrent delivery/claiming. No real payment or OpenAI calls are needed for these tests. The design follows [Stripe's webhook guidance](https://docs.stripe.com/webhooks) on durable handling, duplicates, ordering, signature validation and prompt acknowledgments.

### Agreed access rules (implemented by the opt-in increment below)

- Allowances will reset monthly on the subscription anniversary, including annual subscriptions. The separate access ledger below provides that transition without moving historical observation reservations.
- Failed renewals will have a short, configurable grace period. The sandbox default below is three days; after grace, new research is blocked while completed results remain accessible.
- Exhausted allowances block new runs with a clear explanation and reset date; completed research stays accessible. Manual, scheduled and retry paths must use the same policy.
- Cancellation at period end preserves access through the paid period, then prevents new research. Historical results are retained and readable.
- Complimentary development access remains explicit. Verified Stripe state connects to access through the separate opt-in policy, not by manually changing observation assignments.

## Opt-in sandbox access and anniversary allowances

Migration `20260911_0019` adds an access-policy audit trail, a **separate** subscription usage ledger, subscription anchor/period observations and a scheduler deferral field. The normal deployment runs this migration. The API, research worker and scheduler must all run the new image before opting an account in.

This release deliberately requires **per-account opt-in**. Existing and newly registered accounts default to complimentary development access. It does not open checkout to ordinary users, accept live keys, or launch public billing. Observation assignments still only compare hypothetical limits; they never grant subscription access.

### Testing access limits

1. Let deployment finish, then use **Admin → Plans → Billing synchronization → Reconcile now** for your sandbox checkout. Older observations lack the newly required billing anchor/current-period fields; periodic reconciliation also populates them automatically.
2. Open **Admin → Users → your account → Subscription access**. Review the existing sandbox subscription under Sandbox billing first.
3. Select **Enforce sandbox subscription limits**, supply a reason, and confirm. This takes effect immediately for that account only. Policy changes are version checked, audited, and rejected while an account has queued/running work. Ordinary admins cannot change protected super-admin access.
4. Use **Subscription and usage** in navigation to review current access, allowance window, remaining capacity, reservations and plan features. Digest controls poll the server's admission assessment; the server always checks again when a run or retry is requested.
5. Try a small manual run, schedule and retry. Quotas are shared across all three entry points. Requests outside the allowance return an explanatory 403; saved history stays readable. Creating additional digests, increasing the paper limit, or saving unsupported schedule/email options is checked server-side, including admin digest edits.
6. To revert the test, wait for active work to finish and change the account back to **Complimentary development access**, with a reason. Switching modes does not erase previously counted subscription usage. This does not cancel a Stripe subscription or change any money/payment state.

An account can be opted in before it has a subscription to test the unavailable state. Since sandbox checkout remains admin-only, ordinary users cannot yet purchase access themselves; do not opt ordinary users in expecting a public purchase flow.

### Access decisions and periods

- Access uses the **saved, verified sandbox subscription**, its immutable checkout plan revision, matching price, current billing period and synchronization freshness. No Stripe network request occurs during run admission. Unverified/mismatched/missing period data blocks new research and directs the admin to reconciliation. Archived catalogue revisions do not retroactively remove an existing subscription's agreed limits.
- Monthly allowances reset at the UTC anniversary timestamp, for both monthly and annual subscriptions. Dates are calculated from the original Stripe billing anchor, preserving its day and time across short months and leap years: January 31 → February 28/29 → March 31. Windows are start-inclusive/end-exclusive; unused capacity does not roll over. The annual invoice period and monthly allowance window remain distinct. See [Stripe billing-cycle documentation](https://docs.stripe.com/billing/subscriptions/billing-cycle).
- The new ledger starts when a run is admitted under sandbox limits. Old UTC calendar-month observation rows remain untouched, and historical usage is not silently backfilled. A run completing after a reset settles against the window in which it was accepted.
- Active subscriptions with a verified settled invoice covering the current period permit new research until that period ends. Cancellation at period end preserves that access; terminal cancellation, unpaid, incomplete and trialing states do not admit new work. Current sandbox checkout has no trial.
- Failed renewals receive a configurable **three-day** grace period only when a verified settled invoice covers the immediately preceding period. The clock starts at the renewal period boundary and never restarts on retries or webhook arrival. Initial unpaid invoices receive no grace. The invoice verification increment below replaces the earlier subscription-status-only evidence. Refund/dispute policy remains future work.
- Observations more than 24 hours old block new sandbox research by default. Already accepted work continues; existing results, feedback and account/billing administration remain available. The subscription view distinguishes a synchronization issue from exhausted quotas.

Optional settings, read by all application processes from the environment file:

```env
SUBSCRIPTION_GRACE_DAYS=3
SUBSCRIPTION_SYNC_MAX_AGE_SECONDS=86400
```

The grace range is 0–14 days; synchronization freshness is 15 minutes–48 hours. No new Stripe permissions, webhook types, hosted services or required settings are added. Defaults are adequate for development; public billing and enforcement for all accounts remain disabled.

### Usage and recovery rules

- Admission reserves one total run, one manual run when applicable, and the requested maximum paper count. The shared account lock and transaction cover policy checks, quota checks, run enqueue, rate limits and reservation. Concurrent requests cannot spend the same remaining capacity.
- Success settles one run and the actual number of summarized papers, releasing unused paper capacity. Failure releases that run's subscription reservation, including partially completed runs. Existing per-hour/day anti-abuse limits still apply; released subscription allowance does not refund provider cost.
- A retry is a new admission against the **current** subscription and allowance window. It reserves the whole requested count because successful completion exposes all summaries, including reused ones. Repeated accepted enqueue/settlement does not double count. Scheduled retries preserve original scheduling/email intent even if the digest's current schedule was edited. Retries of pre-ledger runs are counted only when newly admitted.
- Deleting a digest/run keeps its settled usage, with the run link cleared. Deleting the owning account removes its private usage/policy records.
- Subscription-blocked scheduled work keeps its due occurrence, with a one-minute dispatch deferral so other accounts are serviced. The UI shows **Waiting for subscription access** with the reason. It resumes after access/capacity is available, coalescing missed occurrences through the existing scheduler behavior. Schedule end dates still stop future work. No backlog of every missed occurrence is generated.
- Already accepted runs and their requested email deliveries finish even if billing changes afterward. Read access to saved results is never tied to a current paid subscription.

Endpoints:

- `GET /api/v1/subscription` — own access/usage; optional owner-checked `digest_id` adds the manual-run admission assessment.
- `GET /api/v1/admin/subscription-access/{user_id}?offset=0` — effective access plus policy audit history (25 changes per page).
- `POST /api/v1/admin/subscription-access/{user_id}/policy` — `mode`, `expected_version`, `change_note`; confirmed admin UI, existing role protections and active-run guard.

Next increments: public subscriber checkout/portal and plan presentation, trials and plan changes, customer notifications, then a separately approved live rollout. This increment can be exercised entirely with sandbox subscriptions and fake provider transports in automated tests.

## Early allowance guidance

Allowance checks now appear before actions throughout the radar, while transaction-level checks remain authoritative:

- Workspace **Create research digest** waits for the subscription check and is disabled with an explanation when digest slots are full or access is unavailable. The direct creation URL performs the same check before revealing the form. A draft already being edited is retained if a subsequent poll blocks creation.
- Creation defaults Maximum papers to the lower of 20 and the current per-run limit. New and edit forms show the limit immediately, flag oversized input while typing and disable invalid saves. Existing above-plan saved values may still be retained/reduced when editing unrelated settings, as permitted by the backend. Admin edits use the owning user's access, not the admin's plan.
- Manual runs and retries wait for allowance checks and offer a subscription/upgrade link beside the explanation. Retry assessments use the original run's paper count and original scheduled/email intent through the same helper as admission, rather than the digest's current parameters.
- Scheduling shows included frequencies and email availability before editing. Unsupported options are disabled/labeled; new schedules default to an included frequency and email setting. Existing unsupported settings must be corrected before saving, but schedule deletion and Cancel remain available. Exhausted monthly research capacity warns about delayed execution without preventing valid future schedule configuration.
- Total-run, paper and manual-only exhaustion is explained before filling forms. Paper shortfalls show the requested and available count, allowing the user to reduce the request where appropriate. Monthly reset guidance is attached only to monthly limits, not to permanent plan feature or digest-slot limits.
- Access polling refreshes every ten seconds while visible and on return/focus. Dependent actions pause on a failed check with explicit feedback; API admission still handles concurrent changes between a check and submission.
- **Upgrade options** leads to the subscription page's upgrade guidance. This development version still has no self-service upgrades: the page explicitly directs users to the administrator and labels the public plans page as a preview. No checkout or plan change is implied by following the link.

No migration, new configuration or payment-provider requests are needed for this UX increment. Useful checks after deploying: fill all digest slots and try both entry paths; change an allowance from another tab; try oversized paper input; review unsupported schedule/email options; retry an older run with a larger paper snapshot; restore access or delete a digest and confirm controls recover on the next poll.


## Invoice-level verification (sandbox)

Migration `20260911_0020` adds minimized invoice observations and reconciliation progress. This increment keeps **per-account opt-in**, complimentary development access, and sandbox-only checkout unchanged. No live billing or ordinary-user checkout is enabled.

### Deployment setup

1. **Before deploying**, grant the existing restricted sandbox API key **Invoices: Read** permission. An unrestricted sandbox secret key already has this permission. No new key/environment variable is required.
2. Add these events to the **existing** sandbox webhook destination, keeping its previous events selected: `invoice.paid`, `invoice.payment_failed`, `invoice.payment_action_required`, `invoice.finalized`, `invoice.finalization_failed`, `invoice.voided`, `invoice.marked_uncollectible`, `invoice.updated`. The endpoint and signing secret remain unchanged.
3. Deploy the branch normally. The deployment runs `alembic upgrade head`; all application processes should use the new image.
4. Open **Admin → Plans → Billing synchronization** and select **Reconcile now** on existing checkout reconciliation jobs. Automatic reconciliation also imports invoices. Opted-in accounts pause new research until verified invoice evidence is present; existing results and already accepted work remain available. Complimentary accounts are unaffected.
5. Expand **Review invoices and access** to confirm the current invoice, settled period, import progress, and account access. If synchronization fails, check the displayed error and key permission, then retry the job.

No new container, queue service, scheduled task, required environment variable, or secret is introduced. The existing durable billing worker processes invoice events and reconciliation.

### Verification and access rules

- Webhook receipt stores only minimal routing data, commits before acknowledging, and makes no provider requests. Processing retrieves canonical invoice/subscription state, rather than trusting the event's payment snapshot. Duplicate events and out-of-order deliveries cannot reset allowances. Observations, event deduplication marker, and job completion share the existing fenced transaction.
- Reconciliation reads the subscription's latest invoice explicitly, the newest 100 invoices, and at most one additional 100-invoice historical page per execution. A saved cursor resumes history import. The preceding paid invoice used for grace is also refreshed if outside the recent page. Terminal subscriptions finish importing history before periodic reconciliation stops; new signed events and manual reconciliation still work afterward.
- Invoices must belong to the exact sandbox customer/subscription. Access evidence requires the expected currency, automatic collection, and one complete, non-prorated recurring line for the saved price and quantity one. Coverage comes from that subscription line's period, not invoice aggregation dates. Both legacy and current Stripe subscription/line references are supported.
- An active subscription permits new research only with a settled current invoice covering its current period. A paid zero-due invoice is valid settlement, for example after applicable credit/discount; the UI does not claim a card was charged. Manual/out-of-band settlement, credit notes, proration, multi-line or unsupported invoices are marked for review and do not grant access automatically.
- An open renewal invoice with a payment attempt can permit grace only when the immediately preceding period has verified settlement. Grace begins at the renewal boundary, not first observation, and repeated failures never extend it. Initial unpaid subscriptions receive no grace. A recovered paid invoice plus active subscription restores access; terminal cancellation/unpaid states block new research. Cancellation at period end retains verified paid-period access while the subscription remains active.
- Subscription and invoice checks must both meet the existing freshness limit. Missing evidence or failed synchronization pauses new research when existing observations become stale. Payment/access discrepancies remain visible to admins. This conservative local snapshot policy does not make an external provider call on every run request.
- Invoices never create, delete, reset, or settle usage entries. Monthly anniversary windows remain independent of annual invoice periods. Existing atomic reservation/settlement logic and concurrent admission controls are unchanged.

### Admin review

The billing synchronization page includes a paginated invoice review for each checkout: invoice ID/status, currency and amounts in minor units, payment attempts, billing reason, coverage, settlement/next-attempt timestamps, last observation and validation issues. It also shows import progress, effective account access, and discrepancies such as an active subscription without a verified settled current invoice. Invoice details refresh only while expanded and the page is visible.

`GET /api/v1/admin/billing-sync/checkouts/{checkout_id}/invoices?offset=0&limit=25` reads stored observations only. Ordinary admins retain protected-super-admin restrictions; ordinary users have no access. No raw webhook payload, card data, customer address, hosted invoice link or provider credential is retained in the invoice table or returned here.

### Acceptance checks

- Reconcile an existing settled sandbox subscription: verify invoice coverage and opt-in access.
- Simulate an unpaid initial invoice: no new research access, no renewal grace.
- Exercise a failed renewal after a paid period, repeated failures, and recovery: grace stays anchored to the renewal boundary and recovery preserves usage already spent in that allowance window.
- Resend an invoice event, including an older failure after recovery: one stored invoice per ID, canonical state retained, usage unchanged.
- Skip an invoice webhook and request reconciliation: payment state recovers from the provider.
- Confirm cancellation blocks new work when effective, while saved research stays readable.

Automated tests use fake provider transports; no payment or OpenAI calls are made. Live refunds, disputes, tax readiness, notifications, trials, multi-item/prorated plan changes, and live-billing rollout remain separate increments.
