# Scheduling and subscription usage presentation

This frontend increment builds on the existing schedule preview and subscription
snapshot. It does not change recurrence, payment verification, admission rules,
reservations, plan transitions, research execution, or email delivery.

## Schedule outlook

- Use the server's state, next_scheduled_at and upcoming_runs; do not calculate
  recurring occurrences or infer worker health from an overdue date.
- Display the saved timezone. Invalid dates/zones display an unavailable label,
  never a guessed browser-zone conversion.
- A failed first load displays unavailable; a failed refresh keeps the previous
  data with an explicit last-known label and the existing ResourceNotice.
- Distinguish a saved email preference from actual dispatch. In particular the
  paused-preview response can use a default false send_email; the summary shows
  the saved preference and does not imply a paused schedule will deliver email.
- Use active_run_id only for queued/running scheduled work. waiting_digest_id is
  a different digest to open, not a run ID. Usage and subscription actions link
  to the existing subscriber page; Review schedule opens the existing editor.
- An ended schedule may still have an active job. Keep its progress link and
  explain that deleting a schedule does not cancel a job already in progress.
- Announce only compact state changes politely, not every polling timestamp.

## Schedule editing

The form is still one step, now centered with a 960px maximum inner width. The
wide digest workspace and its Run now action remain unchanged. Required fields,
optional cutoff, timezone and the distinction between start and delivery are
explicit. Existing browser-local date conversion and DST round-trip validation
remain; there is no timezone selector or new recurrence algorithm.

Pin the initial editor timezone and drafts for the lifetime of the editor. Warn
when it differs from the saved timezone: saving adopts the editor timezone as
before, while cancelling leaves the saved schedule alone. Background prop
refreshes must not replace drafts or move focus.

User-initiated validation/save failures focus an error summary with field links.
The form remains mounted after a failed save. Save and delete use a synchronous
in-flight guard as well as disabled buttons. A failed deletion remains in its
confirmation with a focused error rather than looking like a successful delete.
Save/delete success is announced and returns focus to the schedule control.
Deleting is still available when an existing schedule cannot be saved because
subscription access is blocked. Turning off a saved but now-disallowed email
preference remains possible. No automatic writes or automatic manual runs.

## Subscription overview

Keep current plan, billing interval/period end, and monthly allowance reset
separate. The current interval must not be taken from a pending paid checkout
when current access is Free or complimentary. All dates and quotas come from
the existing account snapshot, not public catalogue prices/revisions.

Keep subscriptionAction's existing priority ordering and destination hashes.
Place scheduled plan changes alongside the current plan. Do not change the
subscriber tabs, transaction dialogs, portal, checkout, cancellation or recovery.
The existing SubscriptionData resource notice and stale-action guard remain.

For every usage card, display remaining directly from access.remaining. Do not
subtract reservations again, calculate a forecast, or derive a percentage.
Compare with the current snapshot's configuration limits where known. Manual
usage is completed and reserved combined (UsageRead.manual_runs), not a separate
completed-only counter. Runs/papers expose their separate completed/reserved
fields. Available digest slots, active digests and retained saved digests are
separate quantities; capacity does not reset monthly. Zero is not missing;
complimentary null allowances are not the same as unverified data. A zero limit
is labelled Not included rather than implying an allowance was consumed.

## Validation and development acceptance

`node --test frontend/tests/recurring-use.test.mjs` uses synthetic fixtures and
isolated React/MUI/router/DOM doubles. Run with Europe/Warsaw, UTC and
America/Los_Angeles timezones to exercise date presentation and DST validation.
These are not full browser or screen-reader acceptance tests.

Review at mobile, tablet and wide desktop widths, including 320px and zoom.
Check long email addresses, status labels and action wrapping. Use an existing
saved schedule to inspect next occurrence/timezone/email, upcoming runs,
waiting/ended states and a simulated failed preview refresh. Edit then cancel
without dispatching research. In development only, exercise invalid dates,
failed saves, loss of access while editing and deletion failure; verify retained
values and keyboard focus. Check Free, yearly, complimentary, no-limit,
zero/missing usage, reservations, cancellation, grace and pending-plan-change
fixtures. No real payment or new paid research is needed for presentation review.
