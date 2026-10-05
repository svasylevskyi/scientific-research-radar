# Account closure

Closure ends access immediately and cannot be undone. Ordinary subscription
cancellation remains available for customers who want access through the paid
period and Free access afterward. Temporary admin deactivation is a separate
action and does not cancel billing.

## User and admin workflow

- Profile → Close account explains data removal, immediate loss of paid access,
  billing resolution and refunds. The user enters their current password and
  explicitly confirms. All sessions are revoked in the request transaction.
- Admin → Users shows closure progress. The user's detail page replaces its
  editing controls with closure status, completion dates and actionable issues.
  An administrator can request closure using their own password. The super-admin
  cannot be closed; admins close their own accounts through Profile.
- The former raw DELETE endpoint refuses deletion. There is no force-complete,
  bypass-billing or reactivate action.
- The API runs a durable closure worker, independent of the checkout-enabled
  setting. PostgreSQL account and queue locks serialize processing across replicas.
  Restarting resumes stored work. Failed verification uses bounded backoff and
  eventually requires admin review; the account remains inaccessible.
- New research, checkout, upgrades and scheduled changes stop. Workers check the
  closure marker before further research calls; already-started provider work or
  mail cannot be recalled. Erasure waits for active worker leases to finish/expire.

## Billing and refunds

The worker expires known open Checkout sessions, discovers subscriptions from
completed sessions, cancels attached schedules and subscriptions immediately,
with `invoice_now=false` and `prorate=false`, and reads Stripe again to verify the
result. It creates no checkout, charge, refund or credit note. Unknown submissions
are never replayed. Once their original expiry has elapsed, a bounded, fully
paginated Checkout inventory can recover the original session or verify its
absence; incomplete inventories remain unresolved. Admins can also link the
original session ID, verified against mode and Radar attempt metadata.

Open/draft invoices have automatic advancement paused and remain explicit review
items. Payments already in flight might still settle. Pending invoice items also
require review. Use the correct Stripe Dashboard mode to decide how to handle
them; then select **Recheck and continue closure**. The app does not waive debts,
void invoices, cancel payment intents or issue refunds on an administrator's behalf.

Refunds are handled **through Stripe**, initially with human approval in its
Dashboard. Locate the customer's original invoice/payment (ask for an invoice
reference if needed), check whether it is already refunded, pending or disputed,
apply the approved refund policy and issue the full/partial refund there. Track
its actual status and notify the customer; pending is not completed. Stripe
normally sends refunds to the original payment method. Failed refunds need
support follow-up. Enable Stripe's refund emails if desired. Do not promise a
refund, an amount or a deadline merely because a Radar account was closed.

This increment does not add Refunds API permissions, automatic refund rules,
refund webhooks, refund accounting or a Radar refund approval queue. Stripe
remains the payment/refund record. Closed-account support can use invoice/payment
references and Stripe customer details even after local billing identifiers are
erased. A future in-app refund workflow would need explicit authorization,
idempotent requests, webhook reconciliation and audit/retention requirements.

## Data removal and retention boundaries

| Data | Handling |
|---|---|
| Profile, credentials, sessions, recovery/verification tokens | Revoke immediately; erase once work is quiescent. Replace the profile with an inactive technical tombstone and an unreachable random password. |
| Digests, schedules, results, feedback, per-run costs, source evidence, AI reviews of owned runs | Delete through ownership FKs. Historical spending totals can decrease when per-run evidence is erased. Shared bibliographic metadata remains. |
| Authenticated contact submissions | Ordinary owned messages are deleted with the account. Messages explicitly marked **Retention hold** are detached from the account and preserved under the manual legal/accounting policy. |
| Historical/anonymous contacts matching the verified email | Require admin ownership review; delete confirmed owned messages, explicitly exclude messages belonging to someone else. Do not infer authorship from an email match alone. |
| Shared admin review/settings attribution | Remove user FKs and saved author names; replace structured reviewer names. Privacy redaction changes affected publication hashes and invalidates dependent AI comparisons; scientific findings remain. Free-text mentions in shared records require manual privacy review. |
| Local billing records | Remove unnecessary data without waiting for Stripe availability. Retain saved checkout/customer/subscription IDs and actionable issue references while needed for cancellation; erase them on successful closure. |
| Closure emails | Retry with a stable Message-ID; SMTP is at-least-once. Remove recipient on successful completion notice or seven days after request. After expiry, support follows up manually. Email delivery failure never reopens the account or undoes erasure. |
| Closure record/tombstone | Keep the live inactive-account guard needed to make closure irreversible. Recovery manifests retain UUID/request time for 65 days (35-day backup window + 30-day safety margin), then omit older markers. No original name, email, password or billing payload remains after completion/notification expiry. |
| Stripe, OpenAI, logs, off-site backups and exported files | Outside the live database eraser. Apply the approved provider/log/backup policies and privacy-request process. Already-submitted provider requests cannot be recalled by this workflow. |

These are implementation rules, not a jurisdiction-specific legal retention
schedule. Radar-controlled recovery markers now use the operator-approved 65-day
window; local/off-site backup and ordinary support retention are documented in
[data retention](data-retention.md). Accounting/provider/legal-case retention,
human privacy-review responsibilities and response deadlines remain adviser-led.
The app does not delete Stripe financial records. Inspect closure issues daily.

## Deployment and acceptance

Normal deployment applies migration `20260928_0034`; no new environment variables
or service are needed. Ensure SMTP is configured. Keep Stripe credentials enabled
even when `STRIPE_CHECKOUT_ENABLED=false`.

Restricted Stripe keys need Checkout Sessions **Read/Write**, Subscriptions
**Read/Write**, Subscription Schedules **Read/Write**, Invoices **Read/Write**, and
Invoice Items **Read** in the selected mode. Existing catalogue permissions remain
needed for the rest of billing. No Refunds write permission is required by Radar.

Sandbox acceptance:

1. Close a Free account with saved digests and contact messages; verify logout on
   another device, research removal and completion email.
2. Close a paid account, including an open checkout and a scheduled plan change;
   verify terminal Stripe status and that no refund/final invoice was created.
3. Close with a pending upgrade invoice; verify immediate access loss, paused
   invoice collection and admin review. Resolve the invoice in Stripe and retry.
4. Simulate unavailable Stripe/SMTP and restart the API; work resumes without
   duplicate charges, and errors remain visible to admins.
5. Close while research/AI review is running; no later stage may start. Check a
   late webhook cannot restore entitlements. Admin reactivation must be refused.
6. Review an old anonymous contact; verify unrelated messages are preserved and
   confirmed owned messages are removed.

Automated tests use fake Stripe/SMTP. Real Stripe acceptance and browser acceptance
remain deployment checks. A migration downgrade refuses to remove the closure
guard when closure records exist; deploy forward-compatible fixes in that case.

## Backups and restoration

Backups retain old personal data until they expire. Keep the closure manifest
separately from backup generations so restoring an old backup cannot undo erasure.
Export it regularly and before a restore while the current database is available.
Run commands with the application's installed dependencies/container, not an
unconfigured system Python:

```bash
python -m app.account_closure export > closure-manifest.json
```

The manifest contains only account IDs and request times; protect it as operational
data and retain it at least across the applicable backup-restoration window. On
an **isolated restored database**, apply current migrations, point `DATABASE_URL`
at that database and reapply the latest manifest before allowing any public access
or research/scheduler workers:

```bash
python -m app.account_closure reapply < closure-manifest.json
```

This revokes restored sessions, disables schedules and queues erasure without
sending notices or contacting Stripe. Run closure processing in isolation with
the correct Stripe mode, resolve its issues, and verify erasure before promotion.
The existing restore script creates a separate database and does not switch
production. The optional [Restic/R2 workflow](offsite-backups.md) automates encrypted
off-site exports and preserves cumulative markers across database rollbacks. Its
recovery command downloads the latest manifest even when selecting an older
database. Reapplication, erasure review and promotion remain operator steps; if
closure records since the last checkpoint may be missing, investigate before
promotion.

References: [Stripe cancellation](https://docs.stripe.com/billing/subscriptions/cancel),
[subscription cancellation API](https://docs.stripe.com/api/subscriptions/cancel),
[schedule cancellation API](https://docs.stripe.com/api/subscription_schedules/cancel),
[refunds](https://docs.stripe.com/refunds).
