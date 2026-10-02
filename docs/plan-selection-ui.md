# Unified subscription plan selection

The public/workspace catalogue and Subscription → Plan changes render the same
`PlansContent` implementation, with the same card prices, feature rows, interval
tabs, current-plan indication, labels and actions. The embedded version reuses
`SubscriptionData` rather than issuing a second group of account reads. It has
no additional application header or nested main landmark.

## Actions and billing boundaries

- Current tier: **Review Subscription**, opening the existing billing section.
- Free → paid: **Upgrade to [name]**, then the initial Checkout confirmation.
- Eligible immediate paid → higher paid tier: **Upgrade to [name]**, opening a
  server-priced prorated quote for the existing billing interval.
  **Continue to Payment?** and a contained success/green **Continue to Payment**
  button identify the payment action. Continuing can charge the saved Stripe
  payment method; this is explicit before consent. Additional authentication or
  payment uses the existing saved-upgrade invoice endpoint, not a second
  Checkout subscription.
- Eligible higher tiers can also start at renewal, including a different billing
  interval. A cross-interval upgrade opens the renewal confirmation directly;
  the same-interval payment preview offers scheduling at renewal instead.
  **Schedule upgrade** does not charge now. Higher benefits require verified
  renewal payment. See [Scheduled upgrades](scheduled-upgrades.md).
- Eligible paid downgrade: **Downgrade to [name]**, opening a renewal confirmation
  with exact recurring price, effective date, lower allowances and selection of
  digests to keep active. No payment or proration is requested now, so this dialog
  deliberately says **Confirm change at renewal**, not Continue to Payment.
- Paid → Free: **Downgrade to [name]**, with the existing cancellation confirmation
  and redirect to Stripe to confirm cancellation. No new subscription or payment
  is created. Free digest preferences remain in their existing tab; opening the
  modal does not change them. The target must match the server's fallback plan.
- Current-tier interval switching remains available from its card (or a compact
  fallback when the current tier is no longer published). The server's purchased
  revision/price is used, even when the public catalogue has a newer revision.

The backend upgrade/change option lists authorize transitions. Price, currency,
revision and interval must match an offered option. Benefit comparisons in the
browser label cards; they never authorize a transition. Incomparable plans say
Change rather than inventing a hierarchy. Unsupported choices stay visible and
disabled with guidance. Only immediate paid upgrades require the existing billing
interval; scheduled higher-tier upgrades can change interval. Pending checkout
retains Resume existing checkout. Complimentary or unverified access is not
converted into paid access by this interface.

## Safety and recovery

Only explicit selection requests an upgrade preview. Payment, renewal scheduling,
and cancellation require a further confirmation. In-flight guards are synchronous.
Reviewed terms and server quotes are copied so polling cannot replace consented
values. Renewal confirmations retain expected_period_end and exact digest IDs;
changed options, renewal dates, account identity or quote expiry block stale
confirmation. The server remains the final authority and rechecks all rules.

Saved preview, pending payment, retry, undo and verification status are accessible
in both catalogue locations. Existing #upgrade and #changes links are retained.
Requested renewal changes also appear at the bottom of Current plan, where
Cancel requested change uses the same owner-scoped undo flow. Cancellation keeps
the current plan and interval; it does not cancel the subscription. Wait for
confirmed cancellation before choosing another target.
No browser return grants access and no client-side proration or quota accounting
is added. Failures remain visible; temporary resource errors disable mutations.

## Validation

`node --test tests/plan-selection.test.mjs tests/plan-presentation.test.mjs tests/scheduled-upgrades.test.mjs`
uses synthetic account/offer fixtures with React/MUI/router substitutes. Existing
price, layout, enrolment and checkout regressions use a shared harness.
These tests do not replace full TypeScript/build checks or browser acceptance.

Review on development with sandbox billing: Free/paid/monthly/yearly, unavailable
annual prices, historical revisions, pending upgrade/checkout, failed reads and
writes, expiry/renewal drift, active-digest selection, undo and cancellation.
Check keyboard focus and mobile wrapping. Use sandbox payment details only;
never simulated payments or test cards in live mode. Deploy the scheduled-upgrade
backend and frontend together; see the linked acceptance checklist.
