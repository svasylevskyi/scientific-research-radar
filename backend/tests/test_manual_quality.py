"""Manual checks are audited assessments, never a research or delivery action."""
from copy import deepcopy
from uuid import UUID, uuid4

import pytest
from sqlalchemy import func, select

from app.core.config import Settings
from app.models.digest_run import DigestRun
from app.models.research_quality import ResearchQualityEvaluation
from app.models.user import User, UserRole
from app.repositories.digest_run_repository import DigestRunRepository
from app.scheduler.dispatch import ScheduleDispatcher
from app.services.research_quality_service import delivery_allowed
from test_digest_runs import RecordingRadarClient, _execute_next
from test_digests import _authorization, _register
from test_research_quality import publish
from test_scheduler_delivery import NOW, setup_schedule


@pytest.fixture
def completed(client, db_session_factory):
    owner_auth, digest = setup_schedule(client)
    fake = RecordingRadarClient()
    ScheduleDispatcher(Settings(), db_session_factory, fake).tick(NOW)
    _execute_next(db_session_factory, fake)
    admin = _register(client, "manual-quality-admin@example.com", "Quality Reviewer")
    admin_id = UUID(admin.json()["user"]["id"])
    with db_session_factory() as db:
        db.get(User, admin_id).role = UserRole.ADMIN
        run_id = db.scalar(select(DigestRun.id))
        db.commit()
    return {
        "auth": _authorization(admin), "owner_auth": owner_auth, "admin_id": admin_id,
        "owner_id": UUID(digest["owner_id"]), "digest_id": digest["id"], "run_id": run_id,
        "url": f"/api/v1/admin/digests/{digest['id']}/runs/{run_id}/quality-evaluations",
        "fake": fake,
    }


def submit(client, completed, version=0):
    return client.post(completed["url"], headers=completed["auth"], json={"expected_settings_version": version})


def test_manual_permissions_and_run_scope(client, db_session_factory, completed):
    url, auth = completed["url"], completed["auth"]
    for method in (client.get, client.post):
        kwargs = {"json": {"expected_settings_version": 0}} if method == client.post else {}
        assert method(url, **kwargs).status_code == 401
        assert method(url, headers=completed["owner_auth"], **kwargs).status_code == 403
        assert method(url.replace(str(completed["run_id"]), str(uuid4())), headers=auth, **kwargs).status_code == 404
        assert method(url.replace(completed["digest_id"], str(uuid4())), headers=auth, **kwargs).status_code == 404
    with db_session_factory() as db:
        owner = db.get(User, completed["owner_id"])
        owner.role = UserRole.ADMIN
        owner.is_super_admin = True
        db.commit()
    assert submit(client, completed).status_code == 404
    assert client.get(url, headers=auth).status_code == 404
    with db_session_factory() as db:
        db.get(User, completed["admin_id"]).is_super_admin = True
        db.commit()
    assert submit(client, completed).status_code == 201


@pytest.mark.parametrize("run_status", ["queued", "running", "failed"])
def test_only_completed_runs_can_be_assessed(client, db_session_factory, completed, run_status):
    with db_session_factory() as db:
        db.get(DigestRun, completed["run_id"]).status = run_status
        db.commit()
    response = submit(client, completed)
    assert response.status_code == 409
    assert "completed" in response.json()["detail"]
    assert client.get(completed["url"], headers=completed["auth"]).json()["total"] == 0


@pytest.mark.parametrize("damage", ["missing_stage", "pending_stage", "missing_output", "malformed_output", "bad_snapshot"])
def test_incompatible_saved_data_never_gets_a_pass(client, db_session_factory, completed, damage):
    with db_session_factory() as db:
        run = DigestRunRepository(db).get(completed["run_id"])
        if damage == "missing_stage":
            db.delete(run.stages[0])
        elif damage == "pending_stage":
            run.stages[0].status = "pending"
        elif damage == "bad_snapshot":
            run.digest_snapshot = {}
        else:
            run.stages[0].result_data = None if damage == "missing_output" else {}
        db.commit()
    assert submit(client, completed).status_code == 409
    with db_session_factory() as db:
        assert db.scalar(select(func.count()).select_from(ResearchQualityEvaluation)) == 0


@pytest.mark.parametrize("mode", ["off", "observe", "enforce"])
def test_legacy_run_can_be_evaluated_using_current_rules_in_any_mode(client, db_session_factory, completed, mode):
    with db_session_factory() as db:
        run = db.get(DigestRun, completed["run_id"])
        run.quality_config = None
        run.quality_status = "not_evaluated"
        run.quality_findings = []
        run.quality_evaluated_at = None
        db.commit()
    publish(db_session_factory, mode)
    result = submit(client, completed, 1)
    assert result.status_code == 201, result.text
    record = result.json()
    assert record["status"] == "hold"
    assert record["created_by"] == str(completed["admin_id"])
    assert record["created_by_name"] == "Quality Reviewer"
    assert record["created_at"] and record["run_id"] == str(completed["run_id"])
    assert record["config"]["version"] == 1 and record["config"]["config"]["mode"] == mode
    assert record["config"]["engine_version"] == "1"
    assert len(completed["fake"].calls) == 4
    with db_session_factory() as db:
        run = db.get(DigestRun, completed["run_id"])
        assert run.quality_config is None and run.quality_status == "not_evaluated"


@pytest.mark.parametrize("blocked", [False, True])
def test_re_evaluation_preserves_history_delivery_and_run_state(client, db_session_factory, completed, blocked):
    with db_session_factory() as db:
        run = DigestRunRepository(db).get(completed["run_id"])
        run.quality_delivery_blocked = blocked
        run.email_delivery.status = "held" if blocked else "pending"
        db.commit()
        original = {column.name: deepcopy(getattr(run, column.name)) for column in DigestRun.__table__.columns}
        delivery = {column.name: deepcopy(getattr(run.email_delivery, column.name)) for column in run.email_delivery.__table__.columns}
        allowed = delivery_allowed(run)
    first = submit(client, completed)
    assert first.status_code == 201 and first.json()["status"] == "hold"
    publish(db_session_factory, "off", check_reporting_dates=False, check_source_access=False, sparse_paper_threshold=0)
    stale = submit(client, completed)
    assert stale.status_code == 409 and "settings changed" in stale.json()["detail"]
    second = submit(client, completed, 1)
    assert second.status_code == 201, second.text
    assert second.json()["status"] == "pass"
    assert second.json()["id"] != first.json()["id"]
    history = client.get(completed["url"] + "?offset=1&limit=1", headers=completed["auth"]).json()
    assert history["total"] == 2 and history["items"] == [first.json()]
    with db_session_factory() as db:
        run = DigestRunRepository(db).get(completed["run_id"])
        assert {column.name: getattr(run, column.name) for column in DigestRun.__table__.columns} == original
        assert {column.name: getattr(run.email_delivery, column.name) for column in run.email_delivery.__table__.columns} == delivery
        assert delivery_allowed(run) == allowed
    assert len(completed["fake"].calls) == 4


def test_evaluation_input_validation(client, completed):
    for payload in [{}, {"expected_settings_version": -1}, {"expected_settings_version": 0, "release_email": True}]:
        assert client.post(completed["url"], headers=completed["auth"], json=payload).status_code == 422
