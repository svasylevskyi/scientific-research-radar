from fastapi import APIRouter, Depends
from app.api.security import guard_request

from app.api.routes import admin_spending, admin_pricing, admin_digests, admin_users, auth, digest_runs, digests, users

api_router = APIRouter(dependencies=[Depends(guard_request)])
api_router.include_router(auth.router, prefix="/auth", tags=["authentication"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(digests.router, prefix="/digests", tags=["digests"])
api_router.include_router(
    digest_runs.router,
    prefix="/digests/{digest_id}/runs",
    tags=["digest runs"],
)
api_router.include_router(
    digest_runs.active_router,
    prefix="/digest-runs",
    tags=["digest runs"],
)
api_router.include_router(admin_users.router, prefix="/admin/users", tags=["administration"])
api_router.include_router(
    admin_digests.router,
    prefix="/admin/digests",
    tags=["administration", "digests"],
)

api_router.include_router(admin_pricing.router, prefix="/admin/pricing", tags=["administration", "pricing"])

api_router.include_router(admin_spending.router, prefix="/admin/spending", tags=["administration", "spending"])
