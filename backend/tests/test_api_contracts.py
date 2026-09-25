"""Coverage and compatibility of the API contract boundary."""

from datetime import datetime, timezone

import pytest
from app.schemas.api_common import PlanConfigurationRead, Timestamp
from app.schemas.subscriber_responses import ChangeOptionsRead, NotificationRead
from fastapi.encoders import jsonable_encoder
from pydantic import TypeAdapter, ValidationError
from scripts.export_api_contracts import CONTRACT_MODULES, contract_routes, schema


def test_contracted_route_modules_declare_success_models():
    routes = contract_routes()
    assert {
        route.endpoint.__module__.split(".")[-1] for route in routes
    } == CONTRACT_MODULES
    assert len(routes) == 68
    for route in routes:
        assert route.response_model is not None, route.path
        if route.endpoint.__module__ not in {"app.api.routes.contact", "app.api.routes.research_quality", "app.api.routes.benchmark_review", "app.api.routes.claim_reviews"}:
            assert route.response_model_exclude_unset, route.path


def test_openapi_exposes_nested_success_contracts_and_request_types():
    document = schema()
    checkout = document["paths"]["/api/v1/subscription/billing/checkout"]["post"]
    assert checkout["responses"]["200"]["content"]["application/json"]["schema"][
        "$ref"
    ].endswith("/RedirectRead")
    assert checkout["requestBody"]["content"]["application/json"]["schema"][
        "$ref"
    ].endswith("/Selection")
    assert "/api/v1/webhooks/stripe-sandbox" in document["paths"]
    access = document["components"]["schemas"]["AccessRead"]
    assert "remaining" in access["required"]
    assert "run_allowed" not in access["required"]
    assert "active_digest_ids" in access["properties"]


def test_absent_fields_stay_absent_and_explicit_null_stays_null():
    payload = {"items": [], "change": None, "digests": [], "reason": "Unavailable"}
    assert (
        ChangeOptionsRead.model_validate(payload).model_dump(
            mode="json", exclude_unset=True
        )
        == payload
    )
    payload["effective_at"] = None
    assert (
        ChangeOptionsRead.model_validate(payload).model_dump(
            mode="json", exclude_unset=True
        )
        == payload
    )


def test_historical_configuration_does_not_inject_fields_or_republish():
    payload = dict(
        name="Old plan",
        description="",
        state="reviewed",
        currency="EUR",
        monthly_price="1.00",
        annual_price=None,
        tax_display="undecided",
        max_digests=1,
        max_papers_per_run=10,
        papers_per_month=10,
        runs_per_month=1,
        manual_runs_per_month=1,
        schedule_frequencies=[],
        email_delivery=True,
        trial_days=0,
    )
    assert (
        PlanConfigurationRead.model_validate(payload).model_dump(
            mode="json", exclude_unset=True
        )
        == payload
    )


@pytest.mark.parametrize(
    "stamp", [datetime(2026, 1, 1), datetime(2026, 1, 1, tzinfo=timezone.utc)]
)
def test_timestamp_wire_spelling_is_unchanged(stamp):
    assert TypeAdapter(Timestamp).dump_python(stamp, mode="json") == jsonable_encoder(
        stamp
    )


def test_missing_required_fields_fail_response_validation():
    with pytest.raises(ValidationError):
        ChangeOptionsRead.model_validate({"reason": ""})


def test_notification_ids_are_event_keys_not_uuids():
    payload = dict(
        id="change:abc:scheduled",
        subject="Scheduled",
        text="Done",
        email_status="pending",
        created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
    )
    assert NotificationRead.model_validate(payload).model_dump(
        mode="json"
    ) == jsonable_encoder(payload)
