# Scientific Research Radar

The first production-shaped vertical slice of the Scientific Research Radar: account registration, login, rotating JWT sessions, and a protected React workspace.

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
# Put the generated value in JWT_SECRET in .env
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

API documentation is available at `http://localhost:8000/docs`.

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
| `GET` | `/health` | Liveness check |

Register and login accept JSON, which keeps the API contract natural for a React client. Access tokens are sent as `Authorization: Bearer <token>`. Refresh tokens are never exposed to frontend JavaScript.

## Before production

- Set `ENVIRONMENT=production`, a long random `JWT_SECRET`, the real `CORS_ORIGINS`, and HTTPS.
- Set `REFRESH_COOKIE_SECURE=true` and consider `REFRESH_COOKIE_SAMESITE=none` only if the frontend and API are truly cross-site.
- Move to PostgreSQL by changing `DATABASE_URL` and installing its SQLAlchemy driver.
- Put the API behind a reverse proxy or managed platform with TLS, rate limiting, request-size limits, and centralized logs.
- Add email verification, password reset, MFA/passkeys, abuse protection, audit events, and key rotation when product requirements reach those areas.

