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

- Register with name, email, and password.
- Login with email and password.
- Short-lived access JWT kept only in JavaScript memory.
- Rotating refresh JWT kept in an HttpOnly cookie.
- Refresh sessions stored as SHA-256 token hashes so raw refresh tokens are not persisted.
- Automatic access-token renewal after a page reload or one unauthorized API response.
- Protected `/api/v1/users/me` endpoint and protected React route.
- Logout revokes the refresh session and clears the cookie.
- `user` and `admin` roles, checked against the database on every protected request.
- An automatically bootstrapped, always-active super-admin account.
- An admin-only, responsive user management panel with account editing, role changes, and confirmed deletion.
- A self-service profile page for updating name, email address, and password.
- Owner-scoped digest creation, listing, editing, and confirmed deletion.
- An admin digest panel with owner filtering and the same management operations.
- A one-request radar pipeline that records search, relevance, paper-summary, trend, and briefing data as separate structured stages.
- Owner-scoped digest run history with responsive, data-driven briefing, trend, and paper-summary views.
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

API documentation is available at `http://localhost:8000/docs`.

On startup, the API creates the configured super-admin if it does not exist. `SUPER_ADMIN_PASSWORD` supplies its initial password; subsequent password changes can be made from the profile page. The defaults in `.env.example` are for local development only. Set `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_FULL_NAME`, and a unique `SUPER_ADMIN_PASSWORD` before signing in. Production mode rejects the placeholder password.

`Run now` makes one synchronous OpenAI Responses API request using the configured `OPENAI_RADAR_MODEL`, hosted web search, and the strict structured-output contract. No OpenAI request is made while viewing or editing a digest, loading history, starting the API, or using the disabled scheduling control. Set `OPENAI_API_KEY` in `backend/.env`; without it, the run endpoint returns `503 Service Unavailable`. Tests inject local clients and never contact OpenAI.

The live-run controls can be tuned through `OPENAI_RADAR_REASONING_EFFORT`, `OPENAI_REQUEST_TIMEOUT_SECONDS`, and `OPENAI_RADAR_MAX_OUTPUT_TOKENS`. Automatic SDK retries are disabled so each explicit click produces at most one OpenAI API request. A failed attempt is recorded in digest history and can be retried only through another explicit click.

The editable LLM prompt templates are deliberately kept outside the Python source:

- `backend/app/radar/prompts/system.md`
- `backend/app/radar/prompts/radar_run.md`

Previous prompt versions are retained under `backend/app/radar/prompts/archive/`. The strict response contract is defined separately in `backend/app/radar/contracts.py`, allowing the prompts to focus on research quality without embedding and paying for a duplicate JSON schema on every run.

The prompts also apply conservative copyright and access safeguards: public availability is not treated as an open license, restricted access must not be bypassed, and stored output is limited to metadata, source links, short attributed facts, and original synthesis. These prompt-level controls are defense in depth, not a substitute for source-specific terms, product policy, or legal review for the deployment jurisdictions.

Completed run summaries are retained in the database and a compact selection of recent runs is included as historical context in subsequent prompts. Historical output is labelled as context, not as evidence for new results.

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
| `POST` | `/api/v1/auth/register` | Create a user and authenticated session |
| `POST` | `/api/v1/auth/login` | Authenticate and create a session |
| `POST` | `/api/v1/auth/refresh` | Rotate the refresh token and return a new access token |
| `POST` | `/api/v1/auth/logout` | Revoke the current refresh session |
| `GET` | `/api/v1/users/me` | Return the authenticated user |
| `PATCH` | `/api/v1/users/me` | Update the authenticated user's name or email |
| `PUT` | `/api/v1/users/me/password` | Verify and change the authenticated user's password |
| `POST` | `/api/v1/digests` | Create a digest for the authenticated user |
| `GET` | `/api/v1/digests` | List the authenticated user's digests |
| `GET` | `/api/v1/digests/{id}` | Return one digest owned by the authenticated user |
| `PATCH` | `/api/v1/digests/{id}` | Update a digest owned by the authenticated user |
| `DELETE` | `/api/v1/digests/{id}` | Delete a digest owned by the authenticated user |
| `POST` | `/api/v1/digests/{id}/runs` | Run the authenticated user's digest now |
| `GET` | `/api/v1/digests/{id}/runs` | List stored runs for the authenticated user's digest |
| `GET` | `/api/v1/digests/{id}/runs/{run_id}` | Return all structured stages for one stored run |
| `GET` | `/api/v1/admin/users` | List/search users (admin only) |
| `GET` | `/api/v1/admin/users/{id}` | Return user details (admin only) |
| `PATCH` | `/api/v1/admin/users/{id}` | Update user details/status (admin only) |
| `PUT` | `/api/v1/admin/users/{id}/role` | Promote or demote a user (admin only) |
| `DELETE` | `/api/v1/admin/users/{id}` | Delete a user and their sessions (admin only) |
| `GET` | `/api/v1/admin/digests` | List digests, optionally filtered by owner (admin only) |
| `GET` | `/api/v1/admin/digests/{id}` | Return any accessible digest (admin only) |
| `PATCH` | `/api/v1/admin/digests/{id}` | Update any accessible digest (admin only) |
| `DELETE` | `/api/v1/admin/digests/{id}` | Delete any accessible digest (admin only) |
| `GET` | `/health` | Liveness check |

Register and login accept JSON, which keeps the API contract natural for a React client. Access tokens are sent as `Authorization: Bearer <token>`. Refresh tokens are never exposed to frontend JavaScript.

The admin panel is available at `/admin/users`. The super-admin cannot be deactivated, demoted, or deleted. Administrators also cannot deactivate, demote, or delete their own account; these rules are enforced by the API, with the super-admin active/admin invariant additionally protected by a database constraint.

The digest administration panel is available at `/admin/digests`. Regular administrators cannot list or manage digests owned by the protected super-admin; the super-admin can manage every digest. Deleting a user also deletes their digests through a database foreign-key cascade.

The digest details page can start an immediate radar run. Scheduling is intentionally disabled until its backend workflow is introduced. The history page is shown only after a run has been attempted. Its briefing, trend-analysis, and paper-summary tabs use stable presentation sections populated from the structured data stored for the selected run; failed and in-progress runs show status information instead of empty result templates.

The super-admin can manage every account, including editing their own account details. The super-admin account is omitted from regular admins' user lists and cannot be opened or modified by them. Regular users have no access to administration endpoints.

## Before production

- Set `ENVIRONMENT=production`, a long random `JWT_SECRET`, a unique super-admin password, the real `CORS_ORIGINS`, and HTTPS.
- Set `REFRESH_COOKIE_SECURE=true` and consider `REFRESH_COOKIE_SAMESITE=none` only if the frontend and API are truly cross-site.
- Move to PostgreSQL by changing `DATABASE_URL` and installing its SQLAlchemy driver.
- Put the API behind a reverse proxy or managed platform with TLS, rate limiting, request-size limits, and centralized logs.
- Configure OpenAI project spend/rate limits and monitor radar request duration, failures, and token usage.
- Add email verification, password reset, MFA/passkeys, abuse protection, audit events, and key rotation when product requirements reach those areas.
