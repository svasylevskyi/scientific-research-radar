# Registration plan selection

Verified registration creates the account, assigns the latest reviewed Radar Free
revision, and enables subscription limits in the same transaction. The browser
then opens `/radar/register/plan`, with Free selected. Continuing with Free opens Radar
without a checkout request. No existing accounts or policies are migrated.

The authenticated `GET /api/v1/subscription/enrolment-plans` returns the account's
saved Free revision and the currently published paid plans. This keeps the screen
accurate if the Free catalogue entry is subsequently edited or hidden. It exposes
only public plan fields and does not change assignments. The public `/plans` page
continues to show the published catalogue.

Selecting a paid plan offers monthly or annual billing where available, then uses
the existing checkout confirmation and API. The server still validates the exact
plan code, revision, publication status, and Stripe prices. Merely selecting a
plan, starting checkout, or returning from Stripe never grants paid allowances.
Free access remains until the billing evidence permits paid activation.

Canceled and completed checkouts return to Subscription and usage through the
existing Stripe return URLs. An unfinished checkout can be resumed there. Users
can continue with Free or choose an upgrade later; this screen is an initial
onboarding step, not a mandatory gate on every login. Existing paid or
complimentary accounts opening the URL go to Subscription and usage.

This replaces the proposed administrator-selected registration default. There is
no new default-plan setting or database migration in this increment.

## Review checks

- Verify a new registration: the next screen selects Free; continue to Radar.
- Choose a paid monthly plan, review its price, and confirm Stripe checkout.
- Repeat with annual billing; plans without annual prices cannot be selected.
- Cancel checkout or leave it pending: Free access remains and billing offers resume.
- Simulate an unavailable billing service: Free remains usable and Retry reloads status.
- Reload the selection page and test keyboard selection and a narrow mobile viewport.
