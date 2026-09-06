from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.exc import OperationalError

from app.api.router import api_router
from app.core.config import get_settings
from app.db.session import SessionLocal
from app.services.super_admin_service import ensure_super_admin
from app.services.digest_run_service import fail_interrupted_development_runs

settings = get_settings()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    if settings.environment != "test":
        try:
            with SessionLocal() as db:
                ensure_super_admin(db, settings)
                if settings.environment == "development":
                    fail_interrupted_development_runs(db)
        except OperationalError as exc:
            raise RuntimeError(
                "Database schema is not ready. Run `alembic upgrade head` before starting the API."
            ) from exc
    yield


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
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(api_router, prefix="/api/v1")


@app.get("/health", tags=["system"])
def health() -> dict[str, str]:
    return {"status": "ok"}
