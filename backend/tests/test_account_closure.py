from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

import pytest
from sqlalchemy import func, select

from app.core.config import get_settings
from app.models.account_closure import AccountClosure
from app.models.contact_message import ContactMessage
from app.models.digest import Digest
from app.models.stripe_sandbox import SandboxCheckout
from app.models.subscription_plan import SubscriptionPlanRevision
from app.models.user import User
from app.services import account_closure_service as closure
from app.services import billing_sync_service
from app.services.stripe_catalogue_service import StripeCatalogueError
from test_account_closure_billing import ClosureProvider
from test_digests import _register, _authorization, _super_admin_login, _digest_payload, PASSWORD
from test_stripe_catalogue import configuration


def member(client):
    response = _register(client, "closing@example.com", "Closing Member")
    return UUID(response.json()["user"]["id"]), _authorization(response)


def request(client, headers):
    return client.post("/api/v1/users/me/closure", headers=headers,
                       json={"current_password": PASSWORD, "confirmation": "CLOSE"})


def test_closure_revokes_access_and_erases_owned_data(client, db_session_factory):
    uid, headers = member(client)
    assert client.post("/api/v1/digests", headers=headers, json=_digest_payload()).status_code == 201
    assert client.post("/api/v1/contact", headers=headers, json={"name": "Member", "email": "closing@example.com", "message": "Private contact"}).status_code == 201
    result = request(client, headers)
    assert result.status_code == 202, result.text
    assert result.json()["state"] == "pending"
    assert client.get("/api/v1/users/me", headers=headers).status_code == 401
    assert client.post("/api/v1/auth/refresh").status_code == 401
    assert closure.process_one(db_session_factory, get_settings())
    with db_session_factory() as db:
        row = db.get(AccountClosure, uid)
        assert row.state == "completed" and row.data_removed_at and row.billing_resolved_at
        user = db.get(User, uid)
        assert user.full_name == "Closed account" and user.email != "closing@example.com" and not user.is_active
        assert db.scalar(select(func.count()).select_from(Digest).where(Digest.owner_id == uid)) == 0
        assert db.scalar(select(func.count()).select_from(ContactMessage)) == 0
    closure.notify_one(db_session_factory, get_settings())
    assert "Account closed" in client.outbox[-1].subject
    with db_session_factory() as db:
        assert db.get(AccountClosure, uid).notification_email is None
    assert not closure.process_one(db_session_factory, get_settings())


def test_password_confirmation_and_super_admin_protection(client, db_session_factory):
    uid, headers = member(client)
    for body in ({"current_password": "incorrect", "confirmation": "CLOSE"}, {"current_password": PASSWORD, "confirmation": "yes"}):
        assert client.post("/api/v1/users/me/closure", headers=headers, json=body).status_code in {400, 422}
    admin = _super_admin_login(client, db_session_factory)
    result = client.post("/api/v1/users/me/closure", headers=_authorization(admin), json={
        "current_password": get_settings().super_admin_password, "confirmation": "CLOSE"})
    assert result.status_code == 403
    with db_session_factory() as db:
        assert db.get(AccountClosure, uid) is None


def test_admin_closure_idempotent_and_cannot_reactivate(client, db_session_factory):
    uid, headers = member(client)
    admin = _authorization(_super_admin_login(client, db_session_factory))
    path = f"/api/v1/admin/users/{uid}"
    body = {"current_password": get_settings().super_admin_password, "confirmation": "CLOSE"}
    assert client.post(path + "/closure", headers=headers, json=body).status_code == 403
    first = client.post(path + "/closure", headers=admin, json=body)
    assert first.status_code == 202, first.text
    assert client.post(path + "/closure", headers=admin, json=body).json()["requested_at"] == first.json()["requested_at"]
    assert client.patch(path, headers=admin, json={"is_active": True}).status_code == 403
    assert client.put(path + "/role", headers=admin, json={"role": "admin"}).status_code == 403
    assert client.get(path, headers=admin).json()["closure_state"] == "pending"
    closure.process_one(db_session_factory, get_settings())
    assert client.patch(path, headers=admin, json={"is_active": True}).status_code == 403
    assert client.get(path, headers=admin).json()["closure_state"] == "completed"


def paid_attempt(factory, uid, provider):
    with factory() as db:
        plan = SubscriptionPlanRevision(code="explorer", revision=1, configuration=configuration(), change_note="Fixture")
        db.add(plan); db.flush()
        row = provider.row()
        row.user_id, row.plan_revision_id = uid, plan.id
        db.add(row); db.commit()


def test_outage_does_not_delay_data_erasure_and_retry_completes(client, db_session_factory):
    uid, headers = member(client)
    provider = ClosureProvider()
    paid_attempt(db_session_factory, uid, provider)
    request(client, headers)
    class Offline:
        settings = provider.settings
        def request(self, *args, **kwargs):
            raise StripeCatalogueError("sensitive upstream error")
    closure.process_one(db_session_factory, provider.settings, client=Offline())
    with db_session_factory() as db:
        row = db.get(AccountClosure, uid)
        assert row.state == "waiting" and row.completed_at is None
        assert row.data_removed_at is not None
        assert "sensitive" not in row.last_error
        assert db.get(SandboxCheckout, provider.attempt_id) is not None
        closure.retry(db, uid)
    closure.process_one(db_session_factory, provider.settings, client=provider.client)
    with db_session_factory() as db:
        assert db.get(AccountClosure, uid).state == "completed"
        assert db.get(SandboxCheckout, provider.attempt_id) is None
        event = {"id": "evt_late", "type": "customer.subscription.updated", "data": {"object": provider.subscription}}
        assert billing_sync_service.receive(db, provider.settings, event)["ignored"] is True


def test_pending_upgrade_invoice_blocks_completion_until_dashboard_resolution(client, db_session_factory):
    uid, headers = member(client)
    provider = ClosureProvider()
    provider.invoices = [dict(id="in_upgrade", customer="cus_original", livemode=False, status="open", auto_advance=True)]
    paid_attempt(db_session_factory, uid, provider)
    request(client, headers)
    closure.process_one(db_session_factory, provider.settings, client=provider.client)
    with db_session_factory() as db:
        row = db.get(AccountClosure, uid)
        assert row.state == "needs_review" and row.completed_at is None and row.data_removed_at
        assert row.billing_issues == [{"kind": "invoice", "reference": "in_upgrade"}]
        closure.retry(db, uid)
    provider.invoices[0]["status"] = "void"
    closure.process_one(db_session_factory, provider.settings, client=provider.client)
    with db_session_factory() as db:
        assert db.get(AccountClosure, uid).state == "completed"


@pytest.mark.parametrize("decision", ["delete", "unrelated"])
def test_legacy_contact_review_survives_notification_expiry(client, db_session_factory, decision):
    uid, headers = member(client)
    with db_session_factory() as db:
        message = ContactMessage(name="Unknown", email="closing@example.com", message="Review ownership")
        db.add(message); db.commit(); message_id = message.id
    request(client, headers)
    with db_session_factory() as db:
        row = db.get(AccountClosure, uid)
        row.notification_deadline = datetime.now(timezone.utc) - timedelta(seconds=1)
        db.commit()
    closure.notify_one(db_session_factory, get_settings())
    closure.process_one(db_session_factory, get_settings())
    admin = _authorization(_super_admin_login(client, db_session_factory))
    path = f"/api/v1/admin/users/{uid}/closure"
    assert client.get(path, headers=admin).json()["state"] == "needs_review"
    result = client.post(path + f"/contact-messages/{message_id}", headers=admin, json={"decision": decision})
    assert result.status_code == 200, result.text
    closure.process_one(db_session_factory, get_settings())
    with db_session_factory() as db:
        assert db.get(AccountClosure, uid).state == "completed"
        assert (db.get(ContactMessage, message_id) is None) == (decision == "delete")


def test_active_run_waits_and_no_new_run_can_be_claimed(client, db_session_factory):
    from app.models.digest_run import DigestRun
    from app.repositories.run_state_repository import RunStateRepository
    uid, headers = member(client)
    digest_id = UUID(client.post("/api/v1/digests", headers=headers, json=_digest_payload()).json()["id"])
    with db_session_factory() as db:
        run = RunStateRepository(db).create_running(digest_id=digest_id, owner_id=uid, digest_snapshot={},
            history_context=[], feedback_context=[], model_name="test", prompt_version="test")
        run.status, run.worker_id = "running", "existing-worker"
        run.lease_expires_at = datetime.now(timezone.utc) + timedelta(minutes=2)
        db.commit(); run_id = run.id
    request(client, headers)
    closure.process_one(db_session_factory, get_settings())
    with db_session_factory() as db:
        assert db.get(AccountClosure, uid).data_removed_at is None
        assert RunStateRepository(db).claim_next(worker_id="new-worker", lease_expires_at=datetime.now(timezone.utc) + timedelta(minutes=2)) is None
        db.get(DigestRun, run_id).lease_expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        closure.retry(db, uid)
    closure.process_one(db_session_factory, get_settings())
    with db_session_factory() as db:
        assert db.get(DigestRun, run_id) is None
        assert db.get(AccountClosure, uid).state == "completed"
