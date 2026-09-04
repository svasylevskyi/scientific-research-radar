from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.security import hash_password, verify_password
from app.models.user import User, UserRole
from app.repositories.user_repository import UserRepository


def ensure_super_admin(db: Session, settings: Settings) -> User:
    """Create the system super-admin once and restore its protected invariants."""
    users = UserRepository(db)
    try:
        return _ensure_super_admin(db, settings, users)
    except IntegrityError:
        # Multiple API workers may race during their first startup. The unique
        # email constraint makes one creator win; the others reuse that account.
        db.rollback()
        return _ensure_super_admin(db, settings, users, create=False)
    except Exception:
        db.rollback()
        raise


def _ensure_super_admin(
    db: Session,
    settings: Settings,
    users: UserRepository,
    *,
    create: bool = True,
) -> User:
    super_admin = users.get_super_admin()
    if super_admin is None:
        configured_email = str(settings.super_admin_email).lower()
        configured_user = users.get_by_email(configured_email)
        if configured_user is None:
            if not create:
                raise RuntimeError("Super-admin bootstrap did not produce an account")
            super_admin = users.create(
                email=configured_email,
                full_name=settings.super_admin_full_name,
                password_hash=hash_password(settings.super_admin_password),
                role=UserRole.ADMIN,
                is_super_admin=True,
            )
        else:
            super_admin = configured_user

    super_admin.role = UserRole.ADMIN
    super_admin.is_active = True
    super_admin.is_super_admin = True
    if not verify_password(settings.super_admin_password, super_admin.password_hash):
        super_admin.password_hash = hash_password(settings.super_admin_password)
    db.commit()
    db.refresh(super_admin)
    return super_admin
