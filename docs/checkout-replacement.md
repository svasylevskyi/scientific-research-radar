# Unfinished Checkout replacement

The shared catalogue keeps **Review Subscription** on the effective current plan.
Only the original plan AND interval offer **Resume Checkout**. The saved price and
revision remain visible even when the published catalogue has changed. A withdrawn
plan or an interval hidden by the selected tab keeps a separate recovery action.
Other eligible cards keep labels relative to the effective plan, not the abandoned
purchase. Free → Researcher remains an upgrade even after abandoning Professional.

Selecting a card opens **Continue to Payment?**. Its green **Continue to Payment**
action explains replacement of the original selection. Viewing cards, switching
tabs, opening the dialog and pressing Cancel do not expire anything. Initial
registration, workspace/public catalogues and the embedded Plan changes catalogue
use the same controller. Paid-subscription upgrades, invoice payment and scheduled
renewal changes remain separate and are not cancelled by checkout replacement.

## Provider and concurrency contract

`POST /subscription/billing/checkout/replace` accepts the reviewed plan/revision/
interval and a local `expected_attempt_id`, never a browser-supplied Stripe session
or customer ID. The server checks ownership, deployment mode, account admission,
conflicting subscription changes and target availability/mapping first.

The nullable `sandbox_checkouts.replacement_intent` column records exact consent
before an external write; old Stripe parameters are never edited. A missing original
session result is recovered with its original idempotency key only within the
existing 23-hour safety window. Canonical session status must be unpaid, open or
expired, without an attached subscription or expiration-recovery cloning enabled.

The old session is expired and retrieved again. Only verified expiration permits
successor creation. The existing account lock serializes requests. The successor
intent and its predecessor link commit together before creating the new Stripe
session. Repeated identical requests resume that successor, while stale requests
or different targets from another browser tab do not expire unrelated checkouts.
A response timeout never means a payment succeeded or an expiration happened.

When expiration cannot be verified, the saved replacement is shown with a scoped
**Resume Checkout** action. The explicit resume payload binds both the attempt ID
and, for replacement recovery, its intent ID. Legacy no-body resume requests remain
supported. Unresolvable old creation attempts still require operator reconciliation.
If the original session completes first or a subscription/payment is found, no
replacement subscription is created. Webhooks keep using canonical provider reads.

A successor creation timeout retains the new attempt for idempotent retry. If the
old session expired but target validation later fails, the account may choose fresh
terms; the expired URL is never made usable again. No automatic email-recovery
links are generated. No balances, quotas, current entitlements or scheduled changes
are reset or granted by replacing checkout.

## Deployment and acceptance

Deploy backend and frontend together with migration `20261002_0035` (one nullable
JSON column; existing records remain unchanged). The migration cannot be rolled
back while a replacement intent is pending. Do not roll the API back to code
that ignores this fence while a replacement is unresolved. Reconcile first or
deploy compatible forward code. Existing Checkout Sessions write permission is used for expiration;
no new environment variable or Stripe product/price mapping is introduced.

Automated tests use PostgreSQL and a fake Stripe transport, including expiration
and creation timeouts, completion races, duplicate and competing requests,
owner-scoped resume, stale catalogue/intervals and delayed original events.
Frontend tests include all shared catalogue contexts, unchanged current-plan
controls, exact labels, saved-price presentation and cancellation without writes.

Before production acceptance, test on DEVELOPMENT with STRIPE SANDBOX: abandon
Explorer Monthly, choose Researcher Yearly, cancel once (old link remains), then
confirm (old link must no longer accept payment; only the new session is open).
Check original-plan resumption, changed interval, saved earlier revision, two tabs,
network recovery and payment completing in the old tab. Verify paid upgrade and
scheduled-change controls from #110 are unchanged. Review mobile, keyboard focus
and error/recovery messages. Automated transport tests are not live Stripe or
browser/screen-reader acceptance.
