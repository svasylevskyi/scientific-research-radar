"""Request guards run before route services; they never commit application mutations."""
from urllib.parse import urlsplit

from fastapi import HTTPException, Request
from starlette.concurrency import run_in_threadpool

from app.api.dependencies import AppSettings, DbSession
from app.core.security import TokenError, decode_token
from app.services.rate_limit_service import enforce, POLICIES



def origin_of(url):
    parts = urlsplit(url)
    return f"{parts.scheme}://{parts.netloc}"


async def guard_request(request: Request, db: DbSession, settings: AppSettings):
    path = request.url.path.rstrip("/")
    if request.method not in ("GET", "HEAD", "OPTIONS"):
        origin = request.headers.get("origin")
        trusted = {origin_of(settings.frontend_base_url), *settings.cors_origins}
        if origin and origin not in trusted:
            raise HTTPException(403, "This request origin is not allowed.")
        if not origin and request.headers.get("sec-fetch-site") == "cross-site":
            raise HTTPException(403, "Cross-site requests require a trusted origin.")
        # A custom header prevents HTML forms/simple cross-origin requests from
        # using refresh cookies, including with SameSite=None. CLI clients add it too.
        if path in ("/api/v1/auth/refresh", "/api/v1/auth/logout"):
            if request.headers.get("x-radar-request") != "1":
                raise HTTPException(403, "X-Radar-Request: 1 is required for this endpoint.")

    rules = [("api-ip", request.client.host if request.client else "unknown")]
    peer = rules[0][1]  # Forwarded headers are handled only by the configured trusted proxy.
    subject = None
    authorization = request.headers.get("authorization", "")
    if authorization.lower().startswith("bearer "):
        try:
            subject = str(decode_token(authorization[7:], expected_type="access", settings=settings).subject)
            rules.append(("api-user", subject))
        except TokenError:
            pass  # Authentication remains the responsibility of get_current_user.
    if request.method == "POST" and path in ("/api/v1/auth/login", "/api/v1/auth/register"):
        try:
            body = await request.json()
        except ValueError:
            body = {}
        email = body.get("email") if isinstance(body, dict) else None
        prefix = "login" if path.endswith("/login") else "registration"
        rules.append((prefix + "-ip", peer))
        if isinstance(email, str):
            rules.append((prefix + "-email", email.strip().lower()))
    if request.method == "POST" and path.endswith(("/confirm", "/resend")):
        prefix = "verify" if path.endswith("/confirm") else "resend"
        rules.extend([(prefix + "-ip", peer), (prefix + "-challenge", str(request.path_params.get("challenge_id", "unknown")))])
    if subject and path == "/api/v1/users/me/email-verification" and request.method == "POST":
        rules.append(("email-change-user", subject))
    if subject and path == "/api/v1/users/me/password" and request.method == "PUT":
        rules.append(("password-change-user", subject))
    if path == "/api/v1/auth/refresh":
        rules.append(("refresh-ip", peer))

    def check():
        for scope, identity in rules:
            enforce(db, settings, scope, identity, *POLICIES[scope])
    await run_in_threadpool(check)
