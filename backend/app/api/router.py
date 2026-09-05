from fastapi import APIRouter

from app.api.routes import admin_digests, admin_users, auth, digests, users

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["authentication"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(digests.router, prefix="/digests", tags=["digests"])
api_router.include_router(admin_users.router, prefix="/admin/users", tags=["administration"])
api_router.include_router(
    admin_digests.router,
    prefix="/admin/digests",
    tags=["administration", "digests"],
)
