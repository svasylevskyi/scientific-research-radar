"""Authenticated human workflow; simulated labels are never release evidence."""

from copy import deepcopy
from datetime import datetime, timezone
import json
from pathlib import Path
from uuid import UUID

import pytest
from sqlalchemy import func, select

from app.evaluation.models import Benchmark, Criteria, Reviews, fingerprint
from app.models.benchmark_review import BenchmarkCaseReview, BenchmarkPublication, ResearchBenchmark
from app.models.digest_run import DigestRun
from app.models.radar_request import RadarRequest
from app.models.user import User, UserRole
from test_digests import _authorization, _register, _super_admin_login

BASE = "/api/v1/admin/research-quality/benchmarks"
SEED = Path(__file__).parents[1] / "migrations/data/20260925_0032_benchmark.json"


@pytest.fixture
def setup(client, db_session_factory):
    super_auth = _authorization(_super_admin_login(client, db_session_factory))
    responses = [_register(client, f"benchmark-{i}@example.com", f"Reviewer {i}") for i in range(3)]
    with db_session_factory() as db:
        for response in responses[:2]:
            db.get(User, UUID(response.json()["user"]["id"])).role = UserRole.ADMIN
        db.commit()
    raw = json.loads(SEED.read_text())["benchmark"]
    raw["id"] = "api-test-benchmark"
    raw["sources"] = raw["sources"][:1]
    raw["cases"] = raw["cases"][:3]
    created = client.post(BASE, headers=super_auth, json={"benchmark": raw, "permissions_checked": True})
    assert created.status_code == 201, created.text
    return dict(root=super_auth, admin=_authorization(responses[0]), second=_authorization(responses[1]),
                user=_authorization(responses[2]), detail=created.json(), benchmark=Benchmark.model_validate(raw),
                url=f"{BASE}/{created.json()['summary']['id']}", admin_name="Reviewer 0")


def review_payload(version=0, state="approved", **changes):
    return dict(expected_version=version, state=state, verdict="supported", evidence_passage_ids=["s01.abstract"],
                rationale="Simulated human decision for API tests only.", human_reviewed=True, permissions_checked=True) | changes


def criteria_payload(revision, status="approved"):
    return {**Criteria().model_dump(exclude={"schema_version", "reviewer", "reviewed_at", "rationale"}),
            "status": status, "expected_revision": revision, "reason": "Simulated criteria approval."}


def get_detail(client, setup):
    return client.get(setup["url"], headers=setup["root"]).json()


def save(client, setup, case="c001", actor="admin", **changes):
    return client.post(f"{setup['url']}/cases/{case}", headers=setup[actor], json=review_payload(**changes))


def publish_ready(client, setup):
    for case in setup["benchmark"].cases:
        assert save(client, setup, case.id).status_code == 201
    revision = get_detail(client, setup)["summary"]["revision"]
    assert client.post(setup["url"] + "/criteria", headers=setup["root"], json=criteria_payload(revision)).status_code == 201
    return get_detail(client, setup)["summary"]["revision"]


def test_permissions_and_read_only_gets(client, setup, db_session_factory):
    url = setup["url"]
    endpoints = [BASE, url, url + "/cases/c001", url + "/export", url + "/history"]
    for endpoint in endpoints:
        assert client.get(endpoint).status_code == 401
        assert client.get(endpoint, headers=setup["user"]).status_code == 403
        assert client.get(endpoint, headers=setup["admin"]).status_code == 200
    for endpoint, payload in [
        (BASE, {"benchmark": setup["benchmark"].model_dump(mode="json"), "permissions_checked": True}),
        (url + "/criteria", criteria_payload(0)),
        (url + "/publications", {"expected_revision": 0, "reason": "Test"}),
        (url + "/review-imports", {"expected_revision": 0, "reviews": {"benchmark_sha256": fingerprint(setup["benchmark"]), "records": []}}),
    ]:
        assert client.post(endpoint, headers=setup["admin"], json=payload).status_code == 403
    assert save(client, setup, actor="user").status_code == 403
    assert get_detail(client, setup)["summary"]["revision"] == 0
    with db_session_factory() as db:
        assert db.scalar(select(func.count()).select_from(BenchmarkCaseReview)) == 0


def test_draft_resume_approval_identity_history_and_stale_write(client, setup, db_session_factory):
    draft = save(client, setup, state="draft", verdict=None, evidence_passage_ids=[], rationale="", human_reviewed=False, permissions_checked=False)
    assert draft.status_code == 201, draft.text
    assert draft.json()["review"]["state"] == "draft"
    assert draft.json()["review"]["reviewer_name"] == setup["admin_name"]
    assert client.get(setup["url"] + "/cases/c001", headers=setup["second"]).json()["review"] == draft.json()["review"]
    assert save(client, setup).status_code == 409
    result = save(client, setup, version=1)
    assert result.status_code == 201, result.text
    record = result.json()["review"]
    assert record["version"] == 2 and record["state"] == "approved"
    assert record["reviewed_at"].endswith("Z") or record["reviewed_at"].endswith("+00:00")
    assert result.json()["history_total"] == 2
    assert get_detail(client, setup)["summary"]["counts"] == {"pending": 2, "draft": 0, "approved": 1, "excluded": 0, "disputed": 0}
    with db_session_factory() as db:
        db.get(User, UUID(record["reviewer_id"])).full_name = "Renamed reviewer"
        db.commit()
    assert client.get(setup["url"] + "/cases/c001", headers=setup["root"]).json()["history"][0]["reviewer_name"] == "Reviewer 0"


@pytest.mark.parametrize("changes", [
    {"human_reviewed": False}, {"permissions_checked": False}, {"rationale": " "},
    {"verdict": None}, {"evidence_passage_ids": []}, {"evidence_passage_ids": ["another-source.passage"]},
    {"evidence_passage_ids": ["s01.abstract", "s01.abstract"]}, {"reviewer_name": "Forged reviewer"},
    {"reviewed_at": "2000-01-01T00:00:00Z"},
])
def test_approval_requires_valid_evidence_and_server_identity(client, setup, changes):
    result = client.post(setup["url"] + "/cases/c001", headers=setup["admin"], json=review_payload() | changes)
    assert result.status_code == 422, result.text
    assert get_detail(client, setup)["summary"]["revision"] == 0


def test_conflicting_reviews_require_explicit_super_admin_resolution(client, setup):
    assert save(client, setup).status_code == 201
    conflict = save(client, setup, actor="second", version=1, verdict="contradicted")
    assert conflict.status_code == 201 and conflict.json()["review"]["state"] == "disputed"
    assert save(client, setup, version=2).status_code == 409
    assert save(client, setup, version=2, resolve_dispute=True).status_code == 403
    assert save(client, setup, actor="root", version=2).status_code == 409
    resolved = save(client, setup, actor="root", version=2, resolve_dispute=True, verdict="contradicted")
    assert resolved.status_code == 201, resolved.text
    assert resolved.json()["review"]["state"] == "approved" and resolved.json()["history_total"] == 3


def test_saving_a_draft_cannot_bypass_a_conflicting_final_decision(client, setup):
    assert save(client, setup).status_code == 201
    assert save(client, setup, actor="second", version=1, state="draft", verdict="contradicted").status_code == 201
    conflict = save(client, setup, actor="second", version=2, verdict="contradicted")
    assert conflict.status_code == 201 and conflict.json()["review"]["state"] == "disputed"


def test_publication_is_frozen_and_does_not_change_live_research(client, setup, db_session_factory):
    before_emails = len(client.outbox)
    incomplete = client.post(setup["url"] + "/publications", headers=setup["root"], json={"expected_revision": 0, "reason": "Too early"})
    assert incomplete.status_code == 409
    revision = publish_ready(client, setup)
    response = client.post(setup["url"] + "/publications", headers=setup["root"], json={"expected_revision": revision, "reason": "Freeze test labels"})
    assert response.status_code == 201, response.text
    assert response.json()["number"] == 1
    assert not get_detail(client, setup)["summary"]["unpublished_changes"]
    frozen = client.get(setup["url"] + "/export?publication=1", headers=setup["admin"]).json()
    assert all(r["status"] == "approved" for r in Reviews.model_validate(frozen["reviews"]).model_dump()["records"])
    assert save(client, setup, version=1, state="draft", human_reviewed=False, permissions_checked=False).status_code == 201
    assert get_detail(client, setup)["summary"]["unpublished_changes"]
    assert client.get(setup["url"] + "/export?publication=1", headers=setup["admin"]).json() == frozen
    assert client.get(setup["url"] + "/export", headers=setup["admin"]).json()["reviews"]["records"][0]["status"] == "pending"
    assert len(client.outbox) == before_emails
    with db_session_factory() as db:
        assert db.scalar(select(func.count()).select_from(DigestRun)) == 0
        assert db.scalar(select(func.count()).select_from(RadarRequest)) == 0


def test_criteria_and_publish_reject_stale_revision_and_duplicate_publication(client, setup):
    assert save(client, setup).status_code == 201
    assert client.post(setup["url"] + "/criteria", headers=setup["root"], json=criteria_payload(0)).status_code == 409
    assert get_detail(client, setup)["summary"]["revision"] == 1
    for case in ["c002", "c003"]:
        assert save(client, setup, case).status_code == 201
    criteria = client.post(setup["url"] + "/criteria", headers=setup["root"], json=criteria_payload(3))
    assert criteria.status_code == 201 and criteria.json()["criteria"]["reviewer"]
    assert client.post(setup["url"] + "/publications", headers=setup["root"], json={"expected_revision": 3, "reason": "Stale"}).status_code == 409
    assert client.post(setup["url"] + "/publications", headers=setup["root"], json={"expected_revision": 4, "reason": "Publish"}).status_code == 201
    assert client.post(setup["url"] + "/publications", headers=setup["root"], json={"expected_revision": 5, "reason": "Duplicate"}).status_code == 409
    history = client.get(setup["url"] + "/history", headers=setup["admin"]).json()
    assert len(history["criteria"]) == len(history["publications"]) == 1


def test_imported_approvals_are_proposals_and_cannot_overwrite_reviews(client, setup):
    benchmark = setup["benchmark"]
    case = benchmark.cases[0]
    reviews = Reviews(benchmark_sha256=fingerprint(benchmark), records=[dict(case_id=case.id,
        case_sha256=benchmark.case_hash(case), status="approved", verdict="supported", evidence_passage_ids=["s01.abstract"],
        reviewer="Untrusted external identity", reviewed_at=datetime.now(timezone.utc), rationale="Imported proposal",
        human_reviewed=True, permissions_checked=True)]).model_dump(mode="json")
    response = client.post(setup["url"] + "/review-imports", headers=setup["root"], json={"expected_revision": 0, "reviews": reviews})
    assert response.status_code == 201, response.text
    current = client.get(setup["url"] + "/cases/c001", headers=setup["admin"]).json()["review"]
    assert current["state"] == "draft" and current["imported"]
    assert not current["human_reviewed"] and not current["permissions_checked"]
    assert current["reviewer_name"] != "Untrusted external identity"
    assert client.post(setup["url"] + "/review-imports", headers=setup["root"], json={"expected_revision": 1, "reviews": reviews}).status_code == 409
    assert get_detail(client, setup)["summary"]["revision"] == 1
    reviews["benchmark_sha256"] = "0" * 64
    assert client.post(setup["url"] + "/review-imports", headers=setup["root"], json={"expected_revision": 1, "reviews": reviews}).status_code == 422


def test_import_permission_and_content_bounds(client, setup):
    raw = setup["benchmark"].model_dump(mode="json")
    assert client.post(BASE, headers=setup["root"], json={"benchmark": raw, "permissions_checked": False}).status_code == 422
    assert client.post(BASE, headers=setup["root"], json={"benchmark": raw, "permissions_checked": True}).status_code == 409
    raw["sources"][0]["license_url"] = "https://example.com/unconfirmed"
    assert client.post(BASE, headers=setup["root"], json={"benchmark": raw, "permissions_checked": True}).status_code == 422


def test_import_conflict_rolls_back_every_proposal(client, setup):
    assert save(client, setup, "c002").status_code == 201
    benchmark = setup["benchmark"]
    records = [dict(case_id=case.id, case_sha256=benchmark.case_hash(case), rationale="Imported draft")
               for case in benchmark.cases[:2]]
    response = client.post(setup["url"] + "/review-imports", headers=setup["root"], json={
        "expected_revision": 1, "reviews": {"benchmark_sha256": fingerprint(benchmark), "records": records}})
    assert response.status_code == 409
    assert client.get(setup["url"] + "/cases/c001", headers=setup["root"]).json()["review"] is None
    assert get_detail(client, setup)["summary"]["revision"] == 1


def test_review_history_paginates_without_replacing_latest_review(client, setup):
    for version in range(21):
        assert save(client, setup, version=version, state="draft", rationale=f"Draft {version}").status_code == 201
    history = client.get(setup["url"] + "/cases/c001?offset=20", headers=setup["admin"]).json()
    assert history["review"]["version"] == 21
    assert [row["version"] for row in history["history"]] == [1]
    assert history["history_total"] == 21


def test_excluding_every_case_does_not_allow_publication(client, setup):
    for case in setup["benchmark"].cases:
        assert save(client, setup, case.id, state="excluded", verdict=None, evidence_passage_ids=[]).status_code == 201
    response = client.post(setup["url"] + "/publications", headers=setup["root"], json={"expected_revision": 3, "reason": "No usable cases"})
    assert response.status_code == 409 and "approved case" in response.text


def test_migration_seed_matches_offline_benchmark_and_is_unreviewed():
    seed = json.loads(SEED.read_text())
    benchmark = Benchmark.model_validate(seed["benchmark"])
    offline = Benchmark.model_validate_json((Path(__file__).parents[1] / "evaluation/benchmarks/research_support_v1.json").read_text())
    assert fingerprint(benchmark) == fingerprint(offline)
    assert len(benchmark.cases) == 36
    assert Criteria.model_validate(seed["criteria"]).status == "draft"
