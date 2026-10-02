# Scheduled upgrades and requested-change cancellation

## Supported timing

The shared plan catalogue offers server-authorized higher paid tiers at the
current subscription's next renewal, including Monthly -> higher Yearly and
Yearly -> higher Monthly. A higher tier must retain all existing capabilities
and increase at least one allowance/capability; a higher price alone does not
qualify. The target remains subject to publication, revision, currency, mapping,
paid-coverage and conflicting-change checks. A yearly discount does not change
the tier hierarchy. Existing downgrade price safeguards are unchanged.

Same-interval upgrades still default to the existing prorated-payment preview.
Where a renewal option is offered, the preview includes an explicit
"Schedule this upgrade at renewal instead" alternative. Switching to it does
not confirm or collect the previewed payment. Cross-interval higher-tier cards
open the renewal confirmation directly. Both catalogue locations use the same
implementation. Initial purchases and paid-to-Free cancellation are unchanged.

Scheduled upgrades use the existing subscription and two-phase schedule, with
no immediate charge or proration. The confirmation pins the exact target
revision/interval and renewal timestamp. Higher benefits require verification
of the first target invoice. Yearly billing does not grant twelve months of
research allowance; monthly reset anchors and counted usage are preserved.

## First-upgrade payment safety

Canonical schedule observation can bind the new billing price before payment.
That must not itself grant higher limits. For the exact first invoice period of
a scheduled higher-tier change, the invoice assessment cannot use payment for
the old lower tier to grant grace at the new tier. Unpaid/authentication-pending
upgrades remain gated; failed payments follow existing paused/Free fallback
rules until payment is verified. Later ordinary renewals of the now-paid higher
tier retain normal grace. Same-tier switches and downgrades retain their existing
grace behavior. There is no second subscription or client-side activation.

## Current plan summary

Requested renewal changes are visible at the bottom of Current plan, above the
remaining-allowance cards and independently of the selected subscription tab.
The summary includes target, recurring price/interval, requested renewal and
saved status. Preparing, cancelling, awaiting-payment and needs-review states
remain explicit; terminal records are not described as scheduled.

"Cancel requested change" opens a confirmation for the saved request ID. The
copy explains that cancellation keeps the existing plan and interval, does not
cancel the subscription or refund payment, and must finish before another target
can be selected (for example Professional -> Explorer rather than Researcher).
The safer "Keep requested change" action has initial focus. The operation uses
the existing owner-scoped undo/release API and shared subscription action lock.
Server permission, the 30-second renewal cutoff, exact request and account
origin are checked again before submission. A pending or ambiguous undo is not
announced as completed. Users can review/retry the saved request via the existing
change details. Stripe cancellation for a move to Free remains a distinct flow.

## Validation

Frontend tests use isolated React/MUI/router/API doubles. Backend integration
tests use the existing real service/database fixtures with the fake Stripe
schedule provider: both target intervals, yearly source, exact phase parameters,
no early access, payment failure/recovery, later renewal grace, preserved quotas,
retries, owner-scoped undo, alternate downgrade targets and forged observations.
They do not replace browser, assistive-technology or end-to-end Stripe sandbox
acceptance. No live payment or production mutation is needed for acceptance.

No schema migration, new API fields, credentials, deployment settings or provider
permissions are required. Deploy backend and frontend together. Test on sandbox
before production; never use test cards against live Stripe.
