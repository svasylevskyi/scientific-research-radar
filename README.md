# Scientific Research Radar

The first production-shaped vertical slice of the Scientific Research Radar: account registration, login, rotating JWT sessions, role-based access, and a protected React workspace.

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
# Put the generated value in JWT_SECRET in .env, and change SUPER_ADMIN_PASSWORD.
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

API documentation is available at `http://localhost:8000/docs`.

On startup, the API creates the configured super-admin if it does not exist. `SUPER_ADMIN_PASSWORD` supplies its initial password; subsequent password changes can be made from the profile page. The defaults in `.env.example` are for local development only. Set `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_FULL_NAME`, and a unique `SUPER_ADMIN_PASSWORD` before signing in. Production mode rejects the placeholder password.

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
| `GET` | `/api/v1/admin/users` | List/search users (admin only) |
| `GET` | `/api/v1/admin/users/{id}` | Return user details (admin only) |
| `PATCH` | `/api/v1/admin/users/{id}` | Update user details/status (admin only) |
| `PUT` | `/api/v1/admin/users/{id}/role` | Promote or demote a user (admin only) |
| `DELETE` | `/api/v1/admin/users/{id}` | Delete a user and their sessions (admin only) |
| `GET` | `/health` | Liveness check |

Register and login accept JSON, which keeps the API contract natural for a React client. Access tokens are sent as `Authorization: Bearer <token>`. Refresh tokens are never exposed to frontend JavaScript.

The admin panel is available at `/admin/users`. The super-admin cannot be deactivated, demoted, or deleted. Administrators also cannot deactivate, demote, or delete their own account; these rules are enforced by the API, with the super-admin active/admin invariant additionally protected by a database constraint.

## Before production

- Set `ENVIRONMENT=production`, a long random `JWT_SECRET`, a unique super-admin password, the real `CORS_ORIGINS`, and HTTPS.
- Set `REFRESH_COOKIE_SECURE=true` and consider `REFRESH_COOKIE_SAMESITE=none` only if the frontend and API are truly cross-site.
- Move to PostgreSQL by changing `DATABASE_URL` and installing its SQLAlchemy driver.
- Put the API behind a reverse proxy or managed platform with TLS, rate limiting, request-size limits, and centralized logs.
- Add email verification, password reset, MFA/passkeys, abuse protection, audit events, and key rotation when product requirements reach those areas.
