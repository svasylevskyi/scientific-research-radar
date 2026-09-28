"""Export closure IDs and reapply them to an isolated restored database.

Run with the application's dependencies and DATABASE_URL. Reapply blocks access
and queues erasure; it never contacts Stripe or starts workers itself.
"""
import argparse
import json
import sys
from datetime import datetime, timezone
from uuid import UUID

from pydantic import BaseModel, ConfigDict
from sqlalchemy import select, update

from app.db.session import SessionLocal
from app.models.account_closure import AccountClosure
from app.models.auth_session import AuthSession
from app.models.contact_message import ContactMessage
from app.models.digest import Digest
from app.models.user import User


class ClosureMarker(BaseModel):
    model_config = ConfigDict(extra="forbid")
    user_id: UUID
    requested_at: datetime


def export_markers(db):
    return [ClosureMarker(user_id=row.user_id, requested_at=row.requested_at).model_dump(mode="json")
            for row in db.scalars(select(AccountClosure).order_by(AccountClosure.requested_at, AccountClosure.user_id))]


def reapply_markers(db, markers):
    stamp = datetime.now(timezone.utc)
    for marker in markers:
        user = db.get(User, marker.user_id, with_for_update=True)
        if user is None:
            continue
        if user.is_super_admin:
            raise ValueError("Closure manifest contains the protected super-admin; stop and investigate the restore.")
        user.is_active, user.closure_requested_at = False, marker.requested_at
        user.auth_version += 1
        row = db.get(AccountClosure, user.id)
        if row is None:
            row = AccountClosure(user_id=user.id, requested_at=marker.requested_at, notification_deadline=stamp,
                billing_issues=[], unrelated_contact_ids=[])
            db.add(row)
        contact_ids = list(db.scalars(select(ContactMessage.id).where(ContactMessage.user_id.is_(None),
            ContactMessage.email == user.email, ContactMessage.created_at <= marker.requested_at)))
        saved_contacts = {issue["reference"] for issue in row.billing_issues if issue["kind"] == "contact_review"}
        row.billing_issues = [{"kind": "contact_review", "reference": value} for value in sorted(saved_contacts | {str(value) for value in contact_ids})]
        row.state, row.attempts, row.next_attempt_at = "pending", 0, stamp
        row.data_removed_at, row.billing_resolved_at, row.completed_at = None, None, None
        row.last_error = "Closure reapplied after database restore. Keep the deployment isolated until erasure and billing checks finish."
        row.notification_email, row.notice_state, row.notice_next_at = None, "suppressed_after_restore", None
        db.execute(update(AuthSession).where(AuthSession.user_id == user.id).values(revoked_at=stamp))
        db.execute(update(Digest).where(Digest.owner_id == user.id).values(schedule_paused=True, schedule_next_at=None))
    db.commit()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["export", "reapply"])
    args = parser.parse_args()
    with SessionLocal() as db:
        if args.action == "export":
            json.dump(export_markers(db), sys.stdout, indent=2)
            print()
        else:
            values = json.load(sys.stdin)
            if not isinstance(values, list):
                raise ValueError("Expected a closure manifest array")
            reapply_markers(db, [ClosureMarker.model_validate(item) for item in values])
            print("Closure markers reapplied. Keep public access and research workers disabled until closure processing is complete.")


if __name__ == "__main__":
    main()
