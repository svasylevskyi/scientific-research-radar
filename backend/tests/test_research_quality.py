"""Synthetic evaluation fixtures and delivery/settings integration regressions."""
import copy
import json
from pathlib import Path
from types import SimpleNamespace
from uuid import UUID

import pytest
from sqlalchemy import select

from app.core.config import Settings
from app.models.digest_email_delivery import DigestEmailDelivery
from app.models.digest_run import DigestRun, DigestRunStageType
from app.models.research_quality import ResearchQualitySettings
from app.models.user import User, UserRole
from app.radar.quality import evaluate_quality
from app.repositories.digest_run_repository import DigestRunRepository
from app.scheduler.delivery import BriefingDeliveryWorker
from app.scheduler.dispatch import ScheduleDispatcher
from app.schemas.research_quality import QualityConfig
from app.services.briefing_email import briefing_email
from app.services.research_quality_service import delivery_allowed
from test_digest_runs import RecordingRadarClient, _execute_next, _runner
from test_digests import _authorization, _register
from test_scheduler_delivery import NOW, setup_schedule

BASELINE = json.loads((Path(__file__).parent / "fixtures/research_quality_baseline.json").read_text())


def evaluate(stages=None, **config):
    return evaluate_quality(digest_snapshot=BASELINE["digest_snapshot"], stages=stages or BASELINE["stages"],
        config=QualityConfig.model_validate(BASELINE["config"] | config))


@pytest.mark.parametrize("path,value,status,code", [
    ("discovery_relevance/search/papers/0/published_date", "2026-08-31", "hold", "reporting_period"),
    ("discovery_relevance/search/papers/0/published_date", "2026-09-25", "hold", "reporting_period"),
    ("discovery_relevance/search/papers/0/published_date", None, "warning", "unknown_publication_date"),
    ("paper_summaries/paper_summaries/0/summary_basis", "abstract_only", "warning", "limited_source_access"),
    ("paper_summaries/paper_summaries/0/summary_basis", "metadata_only", "warning", "limited_source_access"),
    ("paper_summaries/paper_summaries/0/summary_basis", "unclear", "warning", "limited_source_access"),
    ("discovery_relevance/search/papers/0/full_text_available", False, "hold", "inconsistent_source_basis"),
    ("digest_briefing/digest_briefing/executive_summary", "  ", "hold", "missing_content"),
    ("digest_briefing/digest_briefing/transparency_note", "", "hold", "missing_content"),
    ("paper_summaries/paper_summaries/0/concise_summary", "", "hold", "empty_summaries"),
    ("paper_summaries/paper_summaries", [], "hold", "summary_coverage"),
    ("trend_analysis/trend_analysis/themes/0/evidence_external_ids", ["unknown"], "hold", "unknown_references"),
    ("trend_analysis/trend_analysis/themes/0/evidence_external_ids", [], "hold", "missing_evidence_references"),
    ("trend_analysis/trend_analysis/themes/0/evidence_type", "multi_paper_pattern", "hold", "single_paper_pattern"),
    ("discovery_relevance/relevance/assessments/0/recommended_status", "reject", "hold", "unselected_references"),
])
def test_seeded_quality_findings(path, value, status, code):
    stages = copy.deepcopy(BASELINE["stages"])
    keys = [int(key) if key.isdigit() else key for key in path.split("/")]
    target = stages
    for key in keys[:-1]:
        target = target[key]
    target[keys[-1]] = value
    decision = evaluate(stages)
    assert decision.status == status
    assert code in {item.code for item in decision.findings}


def test_pass_inclusive_dates_and_configurable_warnings():
    assert evaluate().status == "pass"
    for day in ["2026-09-01", "2026-09-24"]:
        stages = copy.deepcopy(BASELINE["stages"])
        stages["discovery_relevance"]["search"]["papers"][0]["published_date"] = day
        assert evaluate(stages).status == "pass"
    assert evaluate(sparse_paper_threshold=3).status == "warning"
    assert evaluate(sparse_paper_threshold=0).status == "pass"
    stages["discovery_relevance"]["search"]["papers"][0]["published_date"] = "2025-01-01"
    assert evaluate(stages, check_reporting_dates=False).status == "pass"
    stages["digest_briefing"]["digest_briefing"]["title"] = " "
    assert evaluate(stages, check_reporting_dates=False, check_duplicates=False,
        check_source_access=False, sparse_paper_threshold=0).status == "hold"


@pytest.mark.parametrize("kind,expected", [("doi", "duplicate_identity"), ("url", "duplicate_identity"), ("title", "possible_duplicates")])
def test_duplicate_papers_across_distinct_provider_ids(kind, expected):
    stages = copy.deepcopy(BASELINE["stages"])
    discovery = stages["discovery_relevance"]
    original = discovery["search"]["papers"][0]
    duplicate = copy.deepcopy(original) | {"external_id": "different-provider-id", "title": "Other title",
        "doi": None, "url": "https://example.org/other"}
    if kind == "doi":
        duplicate["doi"] = "https://doi.org/" + original["doi"].upper()
    elif kind == "url":
        duplicate["url"] = original["url"] + "#abstract"
    else:
        duplicate["title"] = original["title"].upper()
    discovery["search"]["papers"].append(duplicate)
    discovery["relevance"]["assessments"].append(copy.deepcopy(discovery["relevance"]["assessments"][0]) | {"external_id": duplicate["external_id"]})
    stages["paper_summaries"]["paper_summaries"].append(copy.deepcopy(stages["paper_summaries"]["paper_summaries"][0]) | {"external_id": duplicate["external_id"]})
    assert expected in {item.code for item in evaluate(stages).findings}
    assert evaluate(stages, check_duplicates=False).status == "pass"


def test_no_results_and_rejected_old_papers_do_not_cause_a_hold():
    stages = copy.deepcopy(BASELINE["stages"])
    discovery = stages["discovery_relevance"]
    discovery["relevance"]["assessments"][0]["recommended_status"] = "reject"
    discovery["search"]["papers"][0]["published_date"] = "2020-01-01"
    stages["paper_summaries"]["paper_summaries"] = []
    stages["trend_analysis"]["trend_analysis"]["themes"] = []
    briefing = stages["digest_briefing"]["digest_briefing"]
    briefing.update(main_signal=None, top_paper_external_ids=[], secondary_paper_external_ids=[], recommendations=[])
    assert evaluate(stages).status == "warning"
    assert evaluate(stages, sparse_paper_threshold=0).status == "pass"
    discovery["search"]["papers"] = []
    discovery["relevance"]["assessments"] = []
    assert evaluate(stages).status == "warning"
    assert evaluate(stages, sparse_paper_threshold=0).status == "pass"


def publish(factory, mode, **options):
    with factory() as db:
        previous = db.scalar(select(ResearchQualitySettings.version).order_by(ResearchQualitySettings.version.desc())) or 0
        db.add(ResearchQualitySettings(version=previous + 1, config=QualityConfig(mode=mode, **options).model_dump(mode="json"),
            created_by_name="Test operator", change_reason="Fixture policy"))
        db.commit()


def test_settings_permissions_validation_audit_and_stale_writes(client, db_session_factory):
    url = "/api/v1/admin/research-quality"
    assert client.get(url).status_code == 401
    registered = _register(client, "quality-admin@example.com", "Quality Admin")
    auth = _authorization(registered)
    assert client.get(url, headers=auth).status_code == 403
    with db_session_factory() as db:
        user = db.get(User, UUID(registered.json()["user"]["id"]))
        user.role = UserRole.ADMIN
        db.commit()
    default = client.get(url, headers=auth).json()
    assert default["version"] == 0 and default["config"]["mode"] == "observe"
    payload = {"expected_version": 0, "config": {"mode": "enforce"}, "change_reason": "Enable after calibration"}
    assert client.post(url, headers=auth, json=payload).status_code == 403
    with db_session_factory() as db:
        db.get(User, UUID(registered.json()["user"]["id"])).is_super_admin = True
        db.commit()
    for invalid in [{"sparse_paper_threshold": -1}, {"sparse_paper_threshold": 31}, {"mode": "invalid"}, {"check_duplicates": "false"}, {"disable_integrity": True}]:
        assert client.post(url, headers=auth, json=payload | {"config": invalid}).status_code == 422
    assert client.post(url, headers=auth, json=payload | {"change_reason": "  "}).status_code == 422
    saved = client.post(url, headers=auth, json=payload)
    assert saved.status_code == 201 and saved.json()["version"] == 1
    assert saved.json()["created_by_name"] == "Quality Admin"
    assert client.post(url, headers=auth, json=payload).status_code == 409
    assert client.post(url, headers=auth, json=payload | {"expected_version": 1, "config": {"mode": "off"}}).status_code == 201
    history = client.get(url + "/history?limit=1&offset=1", headers=auth).json()
    assert history["total"] == 2 and history["items"][0] == saved.json()


@pytest.mark.parametrize("mode,expected,blocked", [("off", "not_evaluated", False), ("observe", "hold", False), ("enforce", "hold", True)])
def test_run_snapshots_and_delivery_survive_mode_changes(client, db_session_factory, mode, expected, blocked):
    publish(db_session_factory, mode)
    auth, digest = setup_schedule(client)
    fake = RecordingRadarClient()
    ScheduleDispatcher(Settings(), db_session_factory, fake).tick(NOW)
    publish(db_session_factory, "off" if mode != "off" else "enforce")
    _execute_next(db_session_factory, fake)
    assert len(fake.calls) == 4  # Quality evaluation never creates a provider request.
    with db_session_factory() as db:
        run = DigestRunRepository(db).get(db.scalar(select(DigestRun.id)))
        run_id = run.id
        assert run.status == "completed" and run.quality_status == expected
        assert run.quality_config["config"]["mode"] == mode and run.quality_config["version"] == 1
        assert run.quality_delivery_blocked is blocked
        assert bool(DigestRunRepository(db).build_history_context(digest_id=run.digest_id, limit=5)) is not blocked
        if blocked:
            assert run.email_delivery.status == "held" and run.email_delivery.attempts == 0
            with pytest.raises(ValueError, match="prevent delivery"):
                briefing_email(run, "reader@example.com", "https://radar.example.com")
            # Simulate a stale/recovered outbox record: delivery checks the run again.
            run.email_delivery.status = "pending"
            db.commit()
    result = client.get(f"/api/v1/digests/{digest['id']}/runs/{run_id}", headers=auth)
    assert result.status_code == 200 and result.json()["quality_delivery_blocked"] is blocked
    messages = []
    worker = BriefingDeliveryWorker(Settings(), db_session_factory, SimpleNamespace(send=messages.append))
    assert worker.run_once(NOW)
    assert len(messages) == (0 if blocked else 1)
    if mode == "observe":
        assert "Observation mode" in messages[0].text and "outside the reporting period" in messages[0].text
    with db_session_factory() as db:
        assert db.get(DigestEmailDelivery, run_id).status == ("held" if blocked else "sent")


def test_enforced_warning_delivers_and_evaluator_failure_holds(client, db_session_factory, monkeypatch):
    publish(db_session_factory, "enforce", check_reporting_dates=False)
    _, digest = setup_schedule(client)
    fake = RecordingRadarClient()
    dispatcher = ScheduleDispatcher(Settings(), db_session_factory, fake)
    dispatcher.tick(NOW)
    _execute_next(db_session_factory, fake)
    with db_session_factory() as db:
        run = db.scalar(select(DigestRun))
        assert run.quality_status == "warning" and delivery_allowed(run)
    messages = []
    worker = BriefingDeliveryWorker(Settings(), db_session_factory, SimpleNamespace(send=messages.append))
    assert worker.run_once(NOW) and len(messages) == 1
    from datetime import timedelta
    assert dispatcher.tick(NOW + timedelta(days=1)) == 1
    def fail(**kwargs):
        raise RuntimeError("Injected evaluator failure")
    monkeypatch.setattr("app.services.research_quality_service.evaluate_quality", fail)
    _execute_next(db_session_factory, fake)
    with db_session_factory() as db:
        runs = list(db.scalars(select(DigestRun)))
        held = next(run for run in runs if run.quality_status == "hold")
        assert held.status == "completed" and held.quality_delivery_blocked
        assert held.quality_findings[0]["code"] == "evaluation_failed"
    assert not worker.run_once(NOW + timedelta(days=1))
    assert len(messages) == 1


def test_failed_generation_retry_keeps_settings_and_legacy_is_not_evaluated(client, db_session_factory):
    publish(db_session_factory, "enforce")
    _, digest = setup_schedule(client)
    fake = RecordingRadarClient(fail_stage=DigestRunStageType.PAPER_SUMMARIES)
    ScheduleDispatcher(Settings(), db_session_factory, fake).tick(NOW)
    _execute_next(db_session_factory, fake)
    with db_session_factory() as db:
        run = db.scalar(select(DigestRun))
        assert run.status == "failed" and run.quality_status == "not_evaluated"
        run_id = run.id
    publish(db_session_factory, "off")
    fake.fail_stage = None
    with db_session_factory() as db:
        _runner(db, fake).retry_digest(digest_id=UUID(digest["id"]), run_id=run_id, owner_id=UUID(digest["owner_id"]))
    _execute_next(db_session_factory, fake)
    with db_session_factory() as db:
        run = db.get(DigestRun, run_id)
        assert run.quality_config["config"]["mode"] == "enforce" and run.quality_delivery_blocked
        # Legacy records have no snapshot. They are never backfilled with a pass.
        from app.services.research_quality_service import assess_run
        legacy = SimpleNamespace(quality_config=None, quality_status="not_evaluated", quality_delivery_blocked=False)
        assess_run(legacy)
        assert legacy.quality_status == "not_evaluated" and delivery_allowed(legacy)


def test_incomplete_enforcement_decision_fails_closed():
    run = SimpleNamespace(quality_config={"config": {"mode": "enforce"}}, quality_status="not_evaluated",
        quality_evaluated_at=None, quality_delivery_blocked=False)
    assert not delivery_allowed(run)
    run.quality_config["config"]["mode"] = "unexpected"
    assert not delivery_allowed(run)


def test_off_never_disables_existing_reference_validation(client, db_session_factory):
    publish(db_session_factory, "off")
    setup_schedule(client)

    class InvalidReferences(RecordingRadarClient):
        def execute(self, *args, **kwargs):
            result = super().execute(*args, **kwargs)
            if hasattr(result.output, "trend_analysis"):
                result.output.trend_analysis.themes[0].evidence_external_ids = ["invented-id"]
            return result

    fake = InvalidReferences()
    ScheduleDispatcher(Settings(), db_session_factory, fake).tick(NOW)
    _execute_next(db_session_factory, fake)
    with db_session_factory() as db:
        run = db.scalar(select(DigestRun))
        assert run.status == "failed" and "unknown papers" in run.error_message
        assert run.quality_status == "not_evaluated"
    messages = []
    assert not BriefingDeliveryWorker(Settings(), db_session_factory, SimpleNamespace(send=messages.append)).run_once(NOW)
    assert not messages
