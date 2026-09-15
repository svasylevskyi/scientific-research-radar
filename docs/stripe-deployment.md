# Stripe deployment configuration

This guide supersedes sandbox-only setup notes in `paid-subscriptions.md`.
The application supports the same checkout, renewal, payment recovery, cancellation,
Free fallback, scheduled change, undo, and immediate upgrade flows in both modes.
Mode is read-only in the UI and visible to every admin in the application header.

## 1. Keep production separate

Use separate servers, hostnames, secrets, databases, and Stripe catalogues for
production and development. The existing Compose deployment uses distinct
`radar-development` / `radar-production` project names; its fixed host ports mean
these stacks should run on separate servers unless networking is redesigned.
Do not restore the development database into production to enable live billing.

Migration `20260915_0026` creates the database mode binding. Existing checkout
records bind the database to sandbox. A database without checkout records binds
on its first API, research-worker, or scheduler startup. Set `STRIPE_MODE` before
that first startup. A later mode mismatch stops startup and billing processing.
Never edit/delete the binding to bypass this check. Migration rollback is refused
for a live-bound database. Keep a live-compatible release for production rollback.

Registration continues to assign Radar Free access; paid access requires verified
payment. Existing complimentary accounts remain complimentary unless an admin
explicitly enables subscription limits. No existing account is migrated here.

## 2. Configure the Stripe account and catalogue

Complete Stripe account activation for live payments. Switch the Dashboard to
live mode and create the products and recurring prices there. Sandbox product,
price, customer, subscription, portal, and webhook identifiers are not portable.
Use the same Stripe account and supported API version you validated in sandbox;
review version changes separately rather than combining them with launch.

Supported prices are flat, licensed, per-unit monthly/yearly prices, quantity one,
with explicit **inclusive** tax behavior and no trial. Configure both intervals
when the Radar plan offers both. The integration currently supports EUR, USD, GBP,
and PLN catalogue prices.

Automatic Tax remains disabled. Inclusive price validation does not calculate tax
or establish tax compliance. Discounts, trials, manual invoice settlement and
other unsupported invoice adjustments remain subject to the existing rejection
or review rules. This increment does not add those commercial features.

## 3. Create a restricted server API key

Use a live restricted key (`rk_live_…`) with these resource permissions, including
any dependencies required by Stripe's key editor:

| Resource | Permission |
| --- | --- |
| Products and Prices | Read |
| Checkout Sessions | Write, including retrieval |
| Subscriptions | Write, including retrieval |
| Subscription Schedules | Write, including retrieval and release |
| Invoices | Write, including previews and retrieval |
| Customer portal | Session creation and configuration retrieval |

The application does not create products/prices or process card details itself.
Keep the key in the server environment file or deployment secret store. No Stripe
publishable key is needed for this server-created hosted Checkout integration.

## 4. Configure the live customer portal

Enable payment-method updates, invoice history, and cancellation **at period end**.
Disable subscription/plan/quantity updates: Radar coordinates plan changes itself.
Record the active `bpc_…` configuration ID. If needed, retrieve configurations
through Stripe Workbench or the CLI using `GET /v1/billing_portal/configurations`.
The application verifies the portal settings before creating each session.

## 5. Create the live webhook destination

In Stripe Workbench → Webhooks, create a **snapshot event** destination for
**Your account**, pointing to:

```text
https://YOUR_PRODUCTION_HOST/api/v1/webhooks/stripe
```

Select these events:

```text
checkout.session.completed
checkout.session.expired
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
customer.subscription.pending_update_applied
customer.subscription.pending_update_expired
invoice.paid
invoice.payment_failed
invoice.payment_action_required
invoice.finalized
invoice.finalization_failed
invoice.voided
invoice.marked_uncollectible
invoice.updated
```

Save this destination's `whsec_…` secret. A CLI listener or sandbox destination
has its own secret. Signature validation rejects events from the opposite mode.
The legacy `/api/v1/webhooks/stripe-sandbox` path remains an alias for existing
sandbox destinations; both paths validate the configured mode, never the URL name.
Webhook acknowledgement follows durable queue persistence, not final processing.

## 6. Set deployment configuration and deploy

In `/etc/radar/production.env` (never commit real values):

```dotenv
STRIPE_MODE=live
STRIPE_API_KEY=rk_live_REPLACE_ME
STRIPE_WEBHOOK_SECRET=whsec_REPLACE_ME
STRIPE_PORTAL_CONFIGURATION_ID=bpc_REPLACE_ME
STRIPE_CHECKOUT_ENABLED=false
```

Keep `PUBLIC_HOST` set to the production hostname. Compose derives the HTTPS
frontend URL. For deployments without Compose also set `FRONTEND_BASE_URL` to
that HTTPS URL. The API receives Stripe credentials; research/scheduler/ops
containers receive the mode but have billing credentials and checkout disabled.
Canonical settings are loaded from the environment file. Existing
`STRIPE_SANDBOX_*` settings remain supported only in sandbox mode; canonical
settings take precedence. Live mode never falls back to sandbox credentials.
`ENVIRONMENT=production` does not imply live payments: deployed development can
use production security settings and Stripe sandbox mode.

After merging and publishing tested images, use the regular deployment procedure:

```bash
sudo env RADAR_ENVIRONMENT=production bash infra/scripts/deploy.sh FULL_MERGED_COMMIT_SHA scheduled
```

Use `base` or `research` instead of `scheduled` if that is your deployment profile.
The script applies migrations. Verify the header says **Stripe: Live** for both
an ordinary admin and a super-admin. Initially checkout remains disabled.

In Admin → Plans, select each **live** Stripe product, save the revision, run its
Stripe verification, and publish the intended plans. Each product remains mapped
to one Radar tier. The Free plan needs no Stripe mapping. The persisted JSON key
`stripe_sandbox` and legacy `sandbox` entitlement enum are retained for backwards
compatibility: they are not deployment selectors. Provider mode checks validate
all selected products/prices against the actual deployment.

When configuration and the published offer are ready, set
`STRIPE_CHECKOUT_ENABLED=true` and recreate/redeploy the API using the regular
procedure. Check the mode and enabled state again.

## 7. Acceptance and operation

Complete the full payment lifecycle acceptance suite in sandbox first: successful
checkout, failures/authentication, duplicates/out-of-order webhooks, renewals,
upgrade payment failure/recovery, scheduled changes/undo, cancellation and Free
fallback. Automated live-mode tests use a fake HTTP provider and make no charges.

For production activation, verify the live catalogue, HTTPS callbacks, webhook
signature acceptance, durable job completion, admin permissions, and portal
configuration. Monitor the first legitimate live subscriber payment through its
invoice and entitlement update. Do not use test card numbers or run simulated
payments against live Stripe. Real payment acceptance remains an operator step;
this PR does not perform live transactions or alter a deployed environment.

Disabling checkout stops new/resumed checkouts, plan-change commands and new portal
sessions. It does **not** cancel subscriptions or renewals. Webhooks and canonical
reconciliation continue, and Stripe may still execute already scheduled changes.
Background change/upgrade command retries pause while checkout is disabled.
Keep credentials and webhook processing working for existing paying subscribers.

References: [Stripe keys and modes](https://docs.stripe.com/keys),
[webhooks](https://docs.stripe.com/webhooks),
[portal configuration](https://docs.stripe.com/customer-management/configure-portal).
