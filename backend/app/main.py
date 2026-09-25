from contextlib import asynccontextmanager
import asyncio
import logging
from contextlib import suppress

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from fastapi.exception_handlers import request_validation_exception_handler
from sqlalchemy.exc import OperationalError

from app.api.router import api_router
from app.core.config import get_settings
from app.db.session import SessionLocal
from app.services.super_admin_service import ensure_super_admin
from app.services.email_service import EmailDeliveryError
from app.services.email_verification_service import VerificationError, cleanup_expired
from app.services.password_recovery_service import cleanup_recovery
from app.services.rate_limit_service import RateLimitExceeded, cleanup_rate_limits

settings = get_settings()


async def verification_cleanup_loop():
    def clean():
        with SessionLocal() as db:
            cleanup_expired(db)
            cleanup_recovery(db)
            cleanup_rate_limits(db)
    while True:
        try:
            await asyncio.to_thread(clean)
        except Exception:
            logging.getLogger(__name__).exception("Email verification cleanup failed")
        await asyncio.sleep(60)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    if settings.environment != "test":
        try:
            with SessionLocal() as db:
                from app.services.stripe_environment import ensure_database_mode
                ensure_database_mode(db, settings)
                db.commit()
                ensure_super_admin(db, settings)
        except OperationalError as exc:
            raise RuntimeError(
                "Database schema is not ready. Run `alembic upgrade head` before starting the API."
            ) from exc
    cleaner = asyncio.create_task(verification_cleanup_loop()) if settings.environment != "test" else None
    from app.services.billing_sync_service import worker_loop
    billing_worker = asyncio.create_task(worker_loop(SessionLocal, settings)) if settings.environment != "test" else None
    from app.services.claim_review_worker import worker_loop as claim_review_loop
    claim_worker = asyncio.create_task(claim_review_loop(SessionLocal, settings)) if settings.environment != "test" else None
    try:
        yield
    finally:
        if claim_worker:
            claim_worker.cancel()
            with suppress(asyncio.CancelledError):
                await claim_worker
        if billing_worker:
            billing_worker.cancel()
            with suppress(asyncio.CancelledError):
                await billing_worker
        if cleaner:
            cleaner.cancel()
            with suppress(asyncio.CancelledError):
                await cleaner


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    docs_url="/docs" if settings.environment != "production" else None,
    redoc_url=None,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Radar-Request"],
    expose_headers=["Retry-After", "X-Radar-Rate-Limit-Scope", "X-Radar-Retryable"],
)

app.include_router(api_router, prefix="/api/v1")

from app.api.routes.stripe_sandbox import webhook_router
app.include_router(webhook_router, prefix="/api/v1/webhooks", tags=["billing webhooks"])


@app.exception_handler(RequestValidationError)
async def validation_error(request, exc):
    if request.url.path.startswith(("/api/v1/auth/", "/api/v1/users/me")):
        return JSONResponse(status_code=422, headers={"Cache-Control": "no-store"}, content={
            "detail": [{"loc": error["loc"], "msg": error["msg"], "type": error["type"]} for error in exc.errors()]
        })
    return await request_validation_exception_handler(request, exc)


@app.exception_handler(VerificationError)
async def verification_error(_request, exc):
    headers = {}
    if exc.retry_after is not None:
        headers = {"Retry-After": str(exc.retry_after), "X-Radar-Rate-Limit-Scope": "request"}
    elif exc.status_code == 429:
        # Exhausted verification attempts require a new challenge, not retries.
        headers = {"X-Radar-Retryable": "false"}
    return JSONResponse(status_code=exc.status_code, headers=headers, content={"detail": str(exc)})


@app.exception_handler(EmailDeliveryError)
async def email_error(_request, exc):
    return JSONResponse(status_code=503, content={"detail": str(exc)})


@app.get("/health", tags=["system"])
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.exception_handler(RateLimitExceeded)
async def rate_limit_error(_request, exc):
    return JSONResponse(status_code=429, headers={"Retry-After": str(exc.retry_after), "Cache-Control": "no-store",
                        "X-Radar-Rate-Limit-Scope": "global" if exc.scope in {"api-ip", "api-user"} else "request"},
                        content={"detail": str(exc)})


@app.middleware("http")
async def private_response_headers(request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/api/v1/"):
        response.headers["Cache-Control"] = "no-store"
    return response


from app.services.subscription_access_service import AccessDenied

@app.exception_handler(AccessDenied)
async def subscription_access_error(_request, exc):
    return JSONResponse(status_code=exc.status, content={"detail": str(exc)})
