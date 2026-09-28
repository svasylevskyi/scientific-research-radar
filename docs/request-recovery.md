# Page loading and rate-limit recovery

HTTP 429 remains a rate-limit response. The browser client interprets it without
logging application errors or displaying raw HTTP status/messages for temporary
cooldowns. Browser developer tools can still display the actual network response.
No new deployment settings or migration are required. Server limits are unchanged.

## Reads and page state

- Each read allows at most three automatic retries within a 15-second retry window.
  Retry-After seconds and HTTP dates are respected, including long cooldowns. A
  wait extending beyond the window returns a deferred result immediately; the
  client never shortens the server's requested wait. Missing/invalid headers use
  exponential backoff and jitter. This window limits retries, not network latency.
- Shared resources release their initial loading state, retain the last complete
  result, and show an informational notice with retry availability. The notice is
  local to the affected panel. Subscription/quality actions requiring current
  observations remain disabled while those results are stale.
- Each resource allows three consecutive deferred load cycles (initial load plus
  two automatic recovery cycles), then pauses until explicit Retry. Recovery runs
  only while the page is visible. Focus changes do not bypass cooldowns. One-off
  forms/lists do not reload just because the window regains focus, preserving edits.
- Concurrent identical GETs share one in-flight request, including identical
  query parameters and request options. Different callers cancel independently;
  canceling the final caller aborts the underlying fetch. There is no response
  cache. A read after a command starts or ends cannot reuse a pre-command request.
- Resource disposal aborts its reads and ignores late results. A failed atomic
  snapshot also cancels its remaining requests. Subscription snapshots and the
  quality overview remain internally consistent, rather than merging partial
  responses from different refreshes. Other panels load independently.
- The shared recovery hook covers workspace/admin lists, digest details/history,
  selected output, subscription/access/billing panels, saved quality results,
  schedule outlook, cost panels, closure status and the Stripe-mode badge.
  Other explicit loads still receive bounded client retries and an actionable
  message through their existing reload/error controls.

## Actions and authentication

POST, PUT, PATCH and DELETE commands are not automatically replayed after 429,
including login, payment operations, contact submission and account closure.
Controls are released with a cooldown message and inputs stay in the form. A
retry before a known cooldown expires fails locally without another HTTP request.
A proxy response alone cannot establish whether an operation reached the server;
existing billing idempotency and observation safeguards remain in place.

Session restoration is the exception: the refresh endpoint can retry briefly when
Radar identifies its own request guard's 429. It shares the existing session lock
and refresh promise. A deferred refresh does not expire the session or redirect
the protected page to login. Background restoration stops after explicit login,
registration confirmation, sign-out, or session expiry. Sign-out keeps the session
visible and reports a failed attempt until the server acknowledges revocation;
it no longer leaves an unhandled rejection or claims logout on a throttled request.
Terminal verification responses marked X-Radar-Retryable: false remain actionable
errors; repeating them cannot resolve an exhausted verification challenge.

## Diagnosing recurrent throttling

The checked-in API policies allow 600 requests/minute per authenticated account
and 1,200/minute per client IP. Separate policies apply to authentication, contact
and billing commands; some cooldowns last 15 minutes or an hour. The checked-in
Caddy configuration does not add a rate limiter and explicitly forwards the client
address to the API. Deployment overrides or an upstream proxy may differ.

If ordinary navigation still triggers limits, inspect the failed request's route,
Retry-After, and X-Radar-Rate-Limit-Scope in browser network tools:

- `global`: Radar's API IP/account guard. Check concurrent tabs, aggregate polling
  volume and whether the trusted proxy configuration preserves real client IPs.
- `request`: a route/action-specific guard. Check the relevant rule in
  `backend/app/services/rate_limit_service.py` and the action being repeated.
- Missing Radar headers: investigate an upstream proxy/provider as well as the API.

Correlate request timestamps with API/proxy access logs. Do not copy cookies,
authorization headers, request bodies or personal data into support reports.
This code review does not establish which limiter caused a particular production
incident; change specific limits only after measuring the triggering traffic.

## Acceptance

Use a development/sandbox account and browser response interception (or a disposable
local API with temporarily lower test limits); do not flood production.

1. Return one GET 429 with Retry-After: 1, then success. Loading recovers quietly.
2. Return a 30-second global cooldown during workspace/subscription/quality loading.
   Navigation stays available; affected panels show an inline notice, existing
   output remains visible, and no request bypasses the cooldown.
3. Keep returning 429. After three deferred cycles, automatic recovery pauses.
   Explicit Retry works after the cooldown. Hidden tabs make no polling requests.
4. Change page, user filter, or selected run during a delay. Abandoned results do not
   populate the new selection; other subscribers sharing a GET still complete.
5. Throttle a save, contact submission, checkout or closure. The control is released,
   input is retained, and waiting does not silently resubmit the action.
6. Throttle session restoration. The page offers recovery instead of redirecting
   to login. Throttle sign-out: the user remains signed in with a clear retry message.
7. Refresh after saving. The result comes from a new read; stale subscription data
   never enables payment controls. Confirm mobile notices and keyboard navigation.
