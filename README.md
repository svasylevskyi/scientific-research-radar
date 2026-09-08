# Scientific Research Radar

A production-shaped foundation for the Scientific Research Radar: account authentication, role-based access, persisted research-digest configuration, structured radar-run orchestration, and responsive user/admin management interfaces.

## Architecture

```text
frontend (React + Material UI)
    │  JSON over HTTP; access JWT in Authorization header
    │  refresh JWT in HttpOnly cookie
    ▼
backend (FastAPI)
    ├── API routes and dependencies
    ├── application services
    ├── repositories
    └── SQLAlchemy models ──► SQLite (development)
```

The API, service, repository, and persistence layers are separate. SQLite is selected only through `DATABASE_URL`, so PostgreSQL can replace it later without changing the API contract or frontend. The frontend reads its API location from `VITE_API_URL`.

## Included auth flow

- Register with name, email, and password, then confirm a 6-digit email code.
- Login with email and password.
- Short-lived access JWT kept only in JavaScript memory.
- Rotating refresh JWT kept in an HttpOnly cookie.
- Refresh sessions stored as SHA-256 token hashes so raw refresh tokens are not persisted.
- Automatic access-token renewal after a page reload or one unauthorized API response.
- Protected `/api/v1/users/me` endpoint and protected React route.
- Logout revokes the session immediately, including its access tokens, and clears the cookie.
- `user` and `admin` roles, checked against the database on every protected request.
- An automatically bootstrapped, always-active super-admin account.
- An admin-only, responsive user management panel with account editing, role changes, and confirmed deletion.
- A self-service profile page for updating name, email address, and password.
- Owner-scoped digest creation, listing, editing, and confirmed deletion.
- An admin digest panel with owner filtering and the same management operations.
- A request-triggered, four-stage radar workflow with persisted progress, partial results, and failure details.
- Owner-scoped digest run history with responsive, data-driven briefing, trend, and paper-summary views.
- Optional latest-run feedback that refines subsequent runs and becomes read-only when a newer run starts.
- Live OpenAI Responses API execution with hosted web search and a strict Pydantic output contract.

## Run locally

Prerequisites: Python 3.12+ and Node.js 20+.

### 1. Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows PowerShell: .venv\Scripts\Activate.ps1
pip install -e ".[dev]"
cp .env.example .env
python -c "import secrets; print(secrets.token_urlsafe(64))"
# Put the generated value in JWT_SECRET in .env, change SUPER_ADMIN_PASSWORD,
# and add OPENAI_API_KEY before using Run now.
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

Start the durable radar worker in a second terminal using the same virtual
environment and `.env` file:

```bash
cd backend
python -m app.radar.worker
```

API documentation is available at `http://localhost:8000/docs`.

Configure SMTP before testing registration or profile email changes. See [email setup and verification behavior](backend/EMAIL.md). Registration requires a code from the delivered email before an account and session are created.

On startup, the API creates the configured super-admin if it does not exist. `SUPER_ADMIN_PASSWORD` supplies its initial password; subsequent password changes can be made from the profile page. The defaults in `.env.example` are for local development only. Set `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_FULL_NAME`, and a unique `SUPER_ADMIN_PASSWORD` before signing in. Production mode rejects the placeholder password.

`Run now` creates a queued, persisted run and immediately returns `202 Accepted`. The separate worker claims queued manual or scheduled runs and executes four stages: discovery/relevance, batched paper summaries, trend analysis, and briefing preparation. OpenAI Background mode is used for each request so browser and reverse-proxy timeouts do not terminate model work. Hosted web search is enabled only for discovery; later stages consume compact structured handoffs from the database. No OpenAI request is made while viewing or editing a digest, loading history, starting the API, or saving schedule preferences. Set `OPENAI_API_KEY` in `backend/.env`; without it, the run endpoint returns `503 Service Unavailable`. Tests inject local clients and never contact OpenAI.

Stage reasoning effort, output limits, web-search context/tool calls, background polling, and summary batch size are configurable through the settings shown in `backend/.env.example`. Automatic response-creation retries are disabled to avoid accidentally duplicating paid work after an ambiguous network timeout; each OpenAI response ID is persisted as soon as creation succeeds, allowing a replacement worker to resume polling it. Token usage and the number of successfully created response jobs are stored per stage/run. The four logical stages normally use `3 + ceil(selected papers / summary batch size)` OpenAI response jobs. A failed stage can be retried without removing completed stages or saved summary batches.

Only one queued or running run may be active per user, across all of their digests. This is enforced by the database as well as the API; it does not prevent other users from running their own digests. Workers use renewable database leases, so an expired claim can be recovered after a worker restart. Run the worker as a supervised service in production; multiple workers may safely compete for queued or expired work.

The editable LLM prompt templates are deliberately kept outside the Python source:

- `backend/app/radar/prompts/shared_system.md`
- `backend/app/radar/prompts/discovery_relevance.md`
- `backend/app/radar/prompts/paper_summaries.md`
- `backend/app/radar/prompts/trend_analysis.md`
- `backend/app/radar/prompts/digest_briefing.md`

The previous consolidated `system.md` and `radar_run.md` files remain in the same folder as a legacy backup, and older versions are retained under `prompts/archive/`. Strict stage response contracts are defined separately in `backend/app/radar/contracts.py`, allowing prompts to focus on research quality without embedding and paying for duplicate JSON schemas.

The prompts also apply conservative copyright and access safeguards: public availability is not treated as an open license, restricted access must not be bypassed, and stored output is limited to metadata, source links, short attributed facts, and original synthesis. These prompt-level controls are defense in depth, not a substitute for source-specific terms, product policy, or legal review for the deployment jurisdictions.

Completed run summaries are retained in the database and a compact selection of recent runs is included as historical context in subsequent prompts. Historical output is labelled as context, not as evidence for new results.

Users may add or update feedback only on a digest's latest completed run. Starting a newer run immediately freezes older feedback. Relevant feedback is passed to later radar stages as compact, untrusted preference context so it can improve selection, emphasis, explanation depth, and recommendations without being treated as scientific evidence or prompt instructions. Administrators can review run output, OpenAI response-job counts, and feedback but cannot change feedback.

### 2. Frontend

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Open `http://localhost:5173`. Vite proxies `/api` to the FastAPI server in development.

## Verify

```bash
cd backend
pytest

cd ../frontend
npm run build
```

## API contract

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/api/v1/auth/register` | Send verification code; return pending challenge (`202`), no session |
| `POST` | `/api/v1/auth/register/{id}/confirm` | Submit `{ "code": "123456" }`; create user and session (`201`) |
| `POST` | `/api/v1/auth/register/{id}/resend` | Replace the code after the 60-second cooldown |
| `POST` | `/api/v1/auth/login` | Authenticate and create a session |
| `POST` | `/api/v1/auth/refresh` | Rotate the refresh token and return a new access token |
| `POST` | `/api/v1/auth/logout` | Revoke the current session and its access tokens |
| `GET` | `/api/v1/users/me` | Return the authenticated user |
| `PATCH` | `/api/v1/users/me` | Update the authenticated user's name; email changes require verification |
| `GET` | `/api/v1/users/me/email-verification` | Return the current pending email change or null |
| `POST` | `/api/v1/users/me/email-verification` | Send code to `{ "email": "new@example.com" }` (`202`) |
| `POST` | `/api/v1/users/me/email-verification/{id}/confirm` | Submit code and apply the verified email change |
| `POST` | `/api/v1/users/me/email-verification/{id}/resend` | Resend a profile email-change code after 60 seconds |
| `PUT` | `/api/v1/users/me/password` | Verify and change the authenticated user's password |
| `POST` | `/api/v1/digests` | Create a digest for the authenticated user |
| `GET` | `/api/v1/digests` | List the authenticated user's digests |
| `GET` | `/api/v1/digests/{id}` | Return one digest owned by the authenticated user |
| `PATCH` | `/api/v1/digests/{id}` | Update a digest owned by the authenticated user |
| `DELETE` | `/api/v1/digests/{id}` | Delete a digest owned by the authenticated user |
| `POST` | `/api/v1/digests/{id}/runs` | Start the authenticated user's digest run and return `202` |
| `POST` | `/api/v1/digests/{id}/runs/{run_id}/retry` | Requeue the failed stage of an owned run and return `202` |
| `PUT` | `/api/v1/digests/{id}/runs/{run_id}/feedback` | Create or update feedback for the latest completed owned run |
| `GET` | `/api/v1/digests/{id}/runs` | List stored runs for the authenticated user's digest |
| `GET` | `/api/v1/digests/{id}/runs/{run_id}` | Return all structured stages for one stored run |
| `GET` | `/api/v1/digest-runs/active` | Return the authenticated user's active run, if any |
| `GET` | `/api/v1/admin/users` | List/search users (admin only) |
| `GET` | `/api/v1/admin/users/{id}` | Return user details (admin only) |
| `PATCH` | `/api/v1/admin/users/{id}` | Update user details/status (admin only) |
| `PUT` | `/api/v1/admin/users/{id}/role` | Promote or demote a user (admin only) |
| `DELETE` | `/api/v1/admin/users/{id}` | Delete a user and their sessions (admin only) |
| `GET` | `/api/v1/admin/digests` | List digests, optionally filtered by owner (admin only) |
| `GET` | `/api/v1/admin/digests/{id}` | Return any accessible digest (admin only) |
| `GET` | `/api/v1/admin/digests/{id}/runs` | List accessible digest runs and feedback (admin only) |
| `GET` | `/api/v1/admin/digests/{id}/runs/{run_id}` | Review one accessible run and its feedback (admin only) |
| `PATCH` | `/api/v1/admin/digests/{id}` | Update any accessible digest (admin only) |
| `DELETE` | `/api/v1/admin/digests/{id}` | Delete any accessible digest (admin only) |
| `GET` | `/health` | Liveness check |

Register and login accept JSON, which keeps the API contract natural for a React client. Access tokens are sent as `Authorization: Bearer <token>`. Refresh tokens are never exposed to frontend JavaScript.

The admin panel is available at `/admin/users`. The super-admin cannot be deactivated, demoted, or deleted. Administrators also cannot deactivate, demote, or delete their own account; these rules are enforced by the API, with the super-admin active/admin invariant additionally protected by a database constraint.

The digest administration panel is available at `/admin/digests`. Regular administrators cannot list or manage digests owned by the protected super-admin; the super-admin can manage every digest. Deleting a user also deletes their digests through a database foreign-key cascade.

The digest page can start an immediate radar run and continues polling its persisted progress while the user remains free to navigate. Once a digest has a successful run, it shows briefing, trend analysis, paper summaries, run steps, feedback, and digest details together. A collapsible run list remembers its state per user in the current browser, with inclusive local-date filters. The latest successful run is selected by default; explicit run links preserve the selected run. Old user history URLs redirect to the digest page. Digests without successful runs retain their existing layout, and admin run review remains separate and read-only. Saved schedules are dispatched by the separate scheduler process described below.

The super-admin can manage every account, including editing their own account details. The super-admin account is omitted from regular admins' user lists and cannot be opened or modified by them. Regular users have no access to administration endpoints.

## Before production

- Set `ENVIRONMENT=production`, a long random `JWT_SECRET`, a unique super-admin password, the real `CORS_ORIGINS`, and HTTPS.
- Set `REFRESH_COOKIE_SECURE=true` and consider `REFRESH_COOKIE_SAMESITE=none` only if the frontend and API are truly cross-site.
- Move to PostgreSQL by changing `DATABASE_URL` and installing its SQLAlchemy driver.
- Put the API behind a reverse proxy or managed platform with TLS, rate limiting, request-size limits, and centralized logs.
- Configure OpenAI project spend/rate limits and monitor radar request duration, failures, and token usage.
- Add password reset, MFA/passkeys, broader abuse protection, audit events, and key rotation when product requirements reach those areas.

## Scheduling and briefing emails

Run `alembic upgrade head` from `backend` before using this version (migration `20260907_0010`). Configure `OPENAI_API_KEY`, SMTP (see `backend/EMAIL.md`), and `FRONTEND_BASE_URL` with the public website URL used in digest email links. Start both supervised processes alongside the API:

```bash
cd backend
python -m app.radar.worker
# In a separate terminal/service:
python -m app.scheduler.worker
```

The scheduler process dispatches schedules and delivers briefing emails; the radar worker generates the research. The API process alone does not dispatch schedules. Starting the scheduler enables existing saved schedules, including those created during the preview. Existing schedules default to email delivery enabled. Review/delete old schedules or uncheck email delivery before starting the process if needed. Scheduled generation uses billable OpenAI requests.

The schedule form stores daily/weekly/monthly/quarterly frequency, a first-run instant, an optional exclusive end instant, the browser’s IANA time zone, and `send_email` (default true). Dates are stored as UTC instants. Daily/weekly recurrence preserves local clock time across daylight saving; nonexistent times shift forward and ambiguous times use their first occurrence. Monthly/quarterly recurrence uses the original day, clamped to the last day of shorter months, then returns to the original day. An end excludes runs at or beyond that instant.

Saving/editing starts from the next future occurrence; past starts do not immediately enqueue work. On restart or delay, the dispatcher coalesces missed occurrences to the latest due occurrence, not an unbounded backlog. No catch-up runs start after the schedule end. While the owner has another active run, dispatch is deferred; other users can proceed. Inactive accounts are skipped. Deleting a schedule stops future dispatch but does not cancel already queued/running work or its snapshotted email choice.

Scheduled research uses a rolling reporting window ending on the occurrence’s local calendar date, preserving the original reporting period length. It does not rewrite the digest form’s dates. Run snapshots retain the effective dates and `scheduled_for`; feedback and history feed later runs as before. Manual runs retain the selected form dates and do not automatically send emails.

Schedule cursor advancement, run creation, and its email-outbox record commit atomically. Multiple dispatchers use conditional database updates and the existing per-user active-run constraint. The scheduler stores no Redis/Celery dependencies. Supervise both worker processes; use centralized logging and backups for production.

Email is generated from the stored completed briefing, using an escaped HTML template and plain-text alternative. The recipient is the owner’s current verified profile address at each attempt. Partial/failed runs are not emailed; a successfully retried scheduled run can then be delivered. Disabling an account cancels its pending delivery. Editing a schedule’s email choice applies to future runs only. The briefing tab exposes email delivery status; reload to refresh it.

Delivery retries independently of research generation, up to five attempts with exponential delays. Expired delivery claims recover after five minutes. Failed mail never regenerates the research. SMTP cannot guarantee exactly-once delivery if a process dies after provider acceptance but before recording success; a stable Message-ID is reused, and normal successful attempts are not resent. A `sent` status means SMTP accepted the message, not that it reached the inbox; bounce/complaint webhooks are not implemented. Exhausted delivery failures remain stored for operator investigation. Current throughput is one email per scheduler tick (default 10 seconds, configurable with `SCHEDULER_POLL_SECONDS`).

Owner-authenticated `PUT /api/v1/digests/{digest_id}/schedule` creates/replaces one schedule; `DELETE` on the same path removes it. Read responses include `schedule` and `schedule_next_at` (null when no further dispatch remains). Legacy digest frequency stays optional and does not create a schedule. Schedule preferences are excluded from LLM prompt snapshots.

## Password recovery

The sign-in page links to `/forgot-password`. `POST /api/v1/auth/forgot-password` accepts an email and always returns the same 202 message for syntactically valid addresses, including missing, inactive, and throttled accounts. The email task runs after the response, using the configured SMTP service and `FRONTEND_BASE_URL` (public HTTPS required in production). It does not rely on the inbound Host header. No scheduler process is required for recovery.

Links expire after 30 minutes and are single-use. Only a SHA-256 token hash and a fingerprint of the email/password state are stored. A later request replaces the earlier token; changing the password or confirmed email invalidates it. The `/reset-password` page reads the token from a URL fragment, removes it from history, keeps it in memory only, and submits it in the body of `POST /api/v1/auth/reset-password` with password and password_confirmation. Reopening the email link is required after refreshing the reset page. Viewing the link does not consume it. Do not log request bodies on recovery endpoints.

Successful recovery changes the password, invalidates existing access and refresh tokens, clears pending profile email changes, and sends a best-effort password-change notification. It does not automatically sign in. Profile password changes now also invalidate access tokens immediately. Legacy access tokens without a session ID must be renewed after the security migration; valid refresh cookies can renew them silently unless the session exceeds its absolute lifetime. Deploy the updated API instances together so older instances cannot continue accepting revoked access tokens.

Database-backed fixed-window request limits: 20 requests per source IP per hour, 1 per email per minute, 5 per email per hour; reset submissions: 30 per source IP per 15 minutes. Throttled recovery requests keep the generic response; throttled reset submissions return 429. IP addresses and email addresses in rate-limit keys are HMAC-hashed, and expired records are cleaned by the API's cleanup loop. Configure trusted proxy forwarding correctly; do not trust arbitrary client-supplied forwarding headers. Add edge request limits for volumetric protection.

SMTP failures do not reveal account existence. Post-response mail tasks are best-effort and are not a durable queue: an API crash may require requesting a new link. Failures are logged without tokens or email bodies. Run `alembic upgrade head` for migration `20260907_0011`, then restart the API. No new dependency or OpenAI call is required.


## Session and abuse-control hardening

See [SECURITY_REVIEW.md](SECURITY_REVIEW.md) for findings, fixes, default limits, deployment instructions, verification and user-experience impact.

Run `alembic upgrade head` for migration `20260908_0012`, and deploy the API, frontend and scheduler together. Refresh/logout API calls now require `X-Radar-Request: 1`; the frontend supplies it automatically. Browser origins must match configured trusted origins.

Sessions have a default seven-day renewal window and a 30-day absolute lifetime. Role changes and deactivation invalidate existing sessions. Shared database limits cover auth requests, API traffic, and accepted manual/scheduled run starts and retries (default 5/hour and 20/day per user). Rate-limited scheduled runs remain due. Subscription billing quotas remain future work.


## Active-run and schedule awareness

Digest details checks for an account-wide active run every five seconds while idle and every 2.5 seconds during a run. Polling pauses in hidden tabs and refreshes immediately on focus/visibility return. An observed scheduled run disables Run now (including an open confirmation) for that user; the existing server-side conflict check remains the final safeguard between polls.

Digest responses expose `schedule_exhausted`, derived from the saved dispatch cursor and exclusive cutoff. Once the last scheduled occurrence has been dispatched, no next occurrence remains, even if the cutoff is still in the future. The schedule details then show a message suggesting an update/extension or deletion; an already accepted run continues. Expired schedules also show the message when the dispatcher has not yet cleared a stale cursor. A deferred occurrence before its cutoff remains pending, not exhausted. Extending or deleting the schedule refreshes this state immediately. The field is excluded from LLM prompt snapshots, and no database migration is needed.


## Upcoming scheduled runs

`GET /api/v1/digests/{digest_id}/schedule/preview` is owner-scoped and returns the next three planned occurrences, the schedule time zone and email setting, and an observed state: scheduled, due, waiting for another run, waiting for usage allowance, queued, running, or ended (or not scheduled). It uses the same recurrence and missed-occurrence coalescing as the dispatcher, and reads the same hourly/daily run-allowance windows without incrementing them. Merely viewing a preview does not enqueue runs or contact OpenAI.

The schedule panel shows the next date and an expandable Upcoming runs list. It refreshes every five seconds on visible pages and immediately on return to the tab. An actual active scheduled run is displayed as queued/running even if it is the final occurrence. Future dates remain separate from that accepted run. Due dates are not presented as queued until a run record exists; a stopped scheduler may therefore leave a due/waiting state visible. Planned times are not guaranteed execution, completion or delivery times. Shared allowances, other active runs and scheduler/worker availability can delay execution; existing missed-date coalescing and exclusive cutoff rules still apply.

The preview is computed from existing data. No database migration or new dependencies are needed.
