# Session lifecycle and abuse-control review

Reviewed against merged main `178bdd3` in September 2026. This is a focused code review and regression-test report, not an external penetration test or security certification.

## Findings and changes

| Finding | Resolution |
|---|---|
| Logout revoked refresh sessions, but access tokens remained valid until their own expiry. | Access tokens now carry the session ID. Every protected request checks session ownership, revocation, idle expiry and absolute expiry, as well as the existing active-user and auth-version checks. |
| Refresh replay detection attempted to revoke a session, then raised inside a transaction that rolled back the revocation. | Rejection paths explicitly commit revocation before returning an error. |
| Concurrent refresh requests could both succeed and overwrite the replacement hash. | Conditional atomic rotation allows one winner. The immediately previous token gets a 10-second conflict window: no tokens are issued and no cookie is cleared. Later replay revokes that session. |
| Renewal could extend the session indefinitely. | Refresh expiry remains a sliding seven-day window, capped at 30 days from session creation. Both values are configurable. |
| Role changes did not end existing sessions; deactivation followed by reactivation could restore old access. | Admin role changes, admin email changes and deactivation increment the auth version and revoke all sessions. Reactivation never restores those sessions. |
| Concurrent profile password changes could both validate the old password and overwrite each other. | Conditional credential/version update accepts only one. Password changes also remove pending email-change attempts. |
| Cookie-only refresh/logout had no explicit application CSRF guard. CORS alone does not block a browser from sending every request type. | Refresh/logout require `X-Radar-Request: 1`; unsafe browser requests must have a configured trusted Origin when one is supplied. Cross-site fetch metadata without an Origin is rejected. Originless independent clients work with the header. |
| Recovery throttles were isolated; login, general API traffic and run creation lacked shared abuse budgets. | One database-backed atomic limiter serves auth, verification, profile-sensitive actions, general API requests and manual/scheduled runs. Subjects are HMAC hashed, and expired buckets are cleaned every minute by the existing cleanup loop. |
| Simultaneous retries could both requeue the same failed run. | A conditional failed-to-queued update admits one retry. Run-budget reservation and enqueue commit together. |
| The browser treated transient refresh failures as loss of authentication. | A 409 gets one bounded retry; 429, network and server failures do not clear the local session. Initial restoration failures on protected pages offer Retry. Browser Web Locks serialize refresh/login/logout/registration confirmation across tabs where supported. Logout broadcasts to other tabs. |
| Some validation errors could echo secret inputs; private responses had no consistent cache policy. | Auth/profile validation responses omit submitted input and context. API responses use `Cache-Control: no-store`. |

## Central limits

Fixed windows align to UTC clock boundaries, so traffic may burst across a boundary. These are configurable application safeguards, not billing entitlements or a substitute for an edge traffic limiter. Login limits count **all attempts**, including successful ones; there is no permanent account lockout.

Policy definitions: `backend/app/services/rate_limit_service.py`. Run limits and session lifetimes: `backend/app/core/config.py`.

| Action / scope | Default |
|---|---|
| General API / IP | 1,200 requests per minute |
| General API / signed user identity | 600 requests per minute |
| Login / IP | 60 attempts per 15 minutes |
| Login / normalized email | 10 attempts per 15 minutes |
| Registration / IP and email | 20 per hour / 5 per hour |
| Code confirmation / IP and challenge | 60 per 15 minutes / 10 per 15 minutes |
| Code resend / IP and challenge | 20 per hour / 5 per hour; existing one-minute cooldown remains |
| Profile email-change start / user | 5 per hour |
| Profile password change / user | 10 per 15 minutes |
| Refresh / IP | 120 per minute |
| Recovery requests / IP | 20 per hour |
| Recovery requests / email | 1 per minute and 5 per hour |
| Password reset attempts / IP | 30 per 15 minutes |
| Accepted run starts and retries / user | 5 per hour and 20 per day, shared across all digests and manual/scheduled triggers |

Rate-limit rejections normally return 429 with `Retry-After` and a readable wait message. Recovery-specific limits retain the existing generic 202 response so they do not expose account existence. The broad API cap can still return 429. Existing verification expiry/attempt-limit responses retain their domain-specific behavior.

Scheduled occurrences blocked by an active run or run budget remain due; the scheduler retries them on later ticks. Existing missed-occurrence coalescing still applies. Rejected enqueue attempts do not charge the run budget. Subscription quotas, monthly allowances and payment integration are not implemented here.

## User experience

- Normal navigation, digest editing and progress polling remain available during runs; polling is well below the default API limits under typical use.
- Repeated sign-in/code/password attempts can produce a temporary wait message. Correct credentials do not bypass a login cooldown. Users sharing an IP can share the broader IP limit, so tune it for deployment traffic.
- Default sessions last up to seven days without renewal and at most 30 days from sign-in. Normal API activity renews expiring access tokens; this is a renewal-based idle window, not a mouse/keyboard inactivity timer.
- Logout invalidates that session immediately on the server and notifies other tabs. Other devices keep their independent sessions. Password changes/reset, administrator role/email changes, and deactivation invalidate all affected user's sessions.
- Multiple tabs normally renew serially. Browsers without Web Locks use the server race guard and one retry. If the winning refresh response is lost or requests arrive outside the short conflict window, another sign-in can still be necessary.
- A run-budget rejection does not block reading previous results. Scheduled runs may be delayed by earlier manual runs using the same allowance.
- Logging out or reaching session expiry does not cancel an already accepted digest run.

## Deployment and verification

1. Stop old API and scheduler/worker instances, run `cd backend && alembic upgrade head`, then deploy the backend and frontend together and restart all instances. Do not mix old/new API instances: old ones do not enforce session-bound access tokens and reference the old rate-limit table.
2. Migration `20260908_0012` preserves existing throttle records while renaming the table and adds nullable refresh rotation state. Existing access tokens without a session ID must be renewed; a valid existing refresh cookie can do this silently. Sessions already older than the absolute cap must sign in again.
3. All API and scheduler instances must share the database, JWT secret and limit settings. See `backend/.env.example` for `SESSION_ABSOLUTE_DAYS`, `REFRESH_RACE_GRACE_SECONDS`, `RADAR_RUNS_PER_HOUR` and `RADAR_RUNS_PER_DAY`.
4. Configure exact trusted `CORS_ORIGINS` and `FRONTEND_BASE_URL`. Keep production HTTPS and Secure cookies. Only trust forwarded client-IP headers from the actual reverse proxy; do not configure wildcard proxy trust on an internet-accessible API. Add edge request/body-size limits for malformed traffic and volumetric attacks that application route dependencies cannot economically handle.
5. Independent API clients must include `X-Radar-Request: 1` on refresh/logout, retain rotated cookies, respect Retry-After, and never retry a stale refresh token indefinitely.

Verification commands:

```sh
cd backend
PYTHONPATH=. python -m pytest
```

```sh
cd frontend
node --test tests/session-client.test.mjs
npm run build
```

Backend concurrency tests use independent sessions/connections on a file-backed SQLite database. Frontend tests exercise the actual API-client code with mocked HTTP and browser primitives; they are not a real multi-browser end-to-end test. Migration checks cover upgrade/downgrade/upgrade with existing records on SQLite. No SMTP or OpenAI calls are made. PostgreSQL concurrency and production proxy behavior still need validation in the chosen deployment environment.

Future work: session/device management UI, MFA, security-event monitoring/alerts, dedicated edge abuse protection, account-risk controls and paid-plan quotas. This review does not change paper retrieval or radar output quality gates.

References: [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html), [OWASP CSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).
