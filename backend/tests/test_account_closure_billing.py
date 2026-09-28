"""Exercise real transport, mode guards and closure commands without live Stripe."""
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs
from uuid import uuid4

import httpx
import pytest

from app.core.config import Settings
from app.models.stripe_sandbox import SandboxCheckout
from app.services.account_closure_billing import close_attempt, listed
from app.services.billing_provider import StripeSandboxClient
from app.services.stripe_catalogue_service import StripeCatalogueError


class ClosureProvider:
    def __init__(self, *, live=False):
        self.settings = Settings(environment="test", stripe_mode="live" if live else "sandbox",
            stripe_api_key="rk_live_fake" if live else "rk_test_fake", stripe_checkout_enabled=False)
        self.attempt_id = uuid4()
        self.metadata = {"radar_attempt_id": str(self.attempt_id), "radar_mode": self.settings.stripe_mode}
        if not live:
            self.metadata["radar_sandbox"] = "1"
        self.session = dict(id="cs_live_original" if live else "cs_test_original", object="checkout.session", livemode=live,
            metadata=self.metadata, client_reference_id=str(self.attempt_id), mode="subscription", status="complete", subscription="sub_original")
        self.subscription = dict(id="sub_original", object="subscription", livemode=live, metadata=self.metadata,
            customer="cus_original", status="active", schedule=None)
        self.schedule = dict(id="sub_sched_original", object="subscription_schedule", livemode=live,
            customer="cus_original", subscription="sub_original", status="active")
        self.invoices = []
        self.items = []
        self.calls = []
        self.fail_after_cancel = False
        self.no_sessions = False
        self.client = StripeSandboxClient(self.settings, transport=httpx.MockTransport(self.handle))

    def row(self):
        return SandboxCheckout(id=self.attempt_id, user_id=uuid4(), plan_revision_id=1, interval="monthly", price_id="price_original",
            checkout_id=self.session["id"], subscription_id="sub_original", customer_id="cus_original",
            parameters={f"metadata[{key}]": value for key, value in self.metadata.items()}, created_at=datetime.now(timezone.utc))

    def handle(self, request):
        path = request.url.path.removeprefix("/v1/")
        data = {key: values[0] for key, values in parse_qs(request.content.decode()).items()}
        self.calls.append((request.method, path, data))
        if path == "checkout/sessions":
            assert request.method == "GET", "Closure must not create checkouts"
            result = {"object": "list", "data": [] if self.no_sessions else [self.session], "has_more": False}
        elif path.endswith("/expire"):
            self.session["status"] = "expired"
            result = self.session
        elif path.startswith("checkout/sessions/"):
            result = self.session
        elif path.startswith("subscription_schedules/"):
            if path.endswith("/cancel"):
                assert data == {"invoice_now": "false", "prorate": "false"}
                self.schedule["status"] = "canceled"
                self.subscription["status"] = "canceled"
            result = self.schedule
        elif path == "subscriptions/sub_original":
            if request.method == "DELETE":
                assert data == {"invoice_now": "false", "prorate": "false"}
                self.subscription["status"] = "canceled"
                if self.fail_after_cancel:
                    self.fail_after_cancel = False
                    raise httpx.ReadTimeout("response lost")
            result = self.subscription
        elif path in {"invoices", "invoiceitems"}:
            result = {"object": "list", "data": self.invoices if path == "invoices" else self.items, "has_more": False}
        elif path.startswith("invoices/"):
            result = next(item for item in self.invoices if item["id"] == path.split("/")[1])
            if request.method == "POST":
                assert data == {"auto_advance": "false"}
                result["auto_advance"] = False
        else:
            raise AssertionError(path)
        return httpx.Response(200, json=deepcopy(result))


@pytest.mark.parametrize("live", [False, True])
def test_close_paid_account_with_checkout_disabled_and_no_refund(live):
    provider = ClosureProvider(live=live)
    row = provider.row()
    assert close_attempt(provider.client, row) == []
    assert row.subscription_status == "canceled"
    assert sum(method == "DELETE" for method, _, _ in provider.calls) == 1
    assert not any("refund" in path for _, path, _ in provider.calls)
    assert close_attempt(provider.client, row) == []
    assert sum(method == "DELETE" for method, _, _ in provider.calls) == 1


def test_lost_cancel_response_is_verified_before_retrying():
    provider = ClosureProvider()
    provider.fail_after_cancel = True
    with pytest.raises(StripeCatalogueError):
        close_attempt(provider.client, provider.row())
    assert close_attempt(provider.client, provider.row()) == []
    assert sum(method == "DELETE" for method, _, _ in provider.calls) == 1


def test_open_checkout_expires_without_creating_subscription():
    provider = ClosureProvider()
    provider.session.update(status="open", subscription=None)
    row = provider.row()
    row.subscription_id = None
    assert close_attempt(provider.client, row) == []
    assert row.checkout_status == "expired"
    assert not any(path.startswith("subscriptions/") for _, path, _ in provider.calls)


def test_scheduled_change_cancelled_with_subscription():
    provider = ClosureProvider()
    provider.subscription["schedule"] = "sub_sched_original"
    assert close_attempt(provider.client, provider.row()) == []
    assert provider.schedule["status"] == "canceled"


@pytest.mark.parametrize("status", ["open", "draft"])
def test_unsettled_invoice_paused_and_reported_not_voided_or_refunded(status):
    provider = ClosureProvider()
    provider.invoices = [dict(id="in_outstanding", livemode=False, customer="cus_original", status=status, auto_advance=True)]
    assert close_attempt(provider.client, provider.row()) == [{"kind": "invoice", "reference": "in_outstanding"}]
    assert provider.invoices[0]["auto_advance"] is False
    provider.invoices[0]["status"] = "void"
    assert close_attempt(provider.client, provider.row()) == []


def test_pending_invoice_item_requires_review():
    provider = ClosureProvider()
    provider.items = [dict(id="ii_pending", livemode=False)]
    assert close_attempt(provider.client, provider.row()) == [{"kind": "pending_invoice_item", "reference": "ii_pending"}]


def test_unknown_attempt_never_replays_creation():
    provider = ClosureProvider()
    row = provider.row()
    row.checkout_id, row.subscription_id = None, None
    assert close_attempt(provider.client, row)[0]["kind"] == "unknown_checkout"
    assert provider.calls == []


@pytest.mark.parametrize("no_sessions", [False, True])
def test_expired_unknown_attempt_uses_complete_bounded_inventory(no_sessions):
    provider = ClosureProvider()
    provider.no_sessions = no_sessions
    row = provider.row()
    row.checkout_id, row.subscription_id = None, None
    row.created_at -= timedelta(hours=3)
    row.parameters["expires_at"] = str(int((row.created_at + timedelta(hours=1)).timestamp()))
    assert close_attempt(provider.client, row) == []
    assert not any(method == "POST" and path == "checkout/sessions" for method, path, _ in provider.calls)
    assert row.checkout_status == ("expired" if no_sessions else "complete")


@pytest.mark.parametrize("field,value", [("livemode", True), ("customer", "cus_other"), ("metadata", {})])
def test_wrong_mode_or_ownership_never_cancelled(field, value):
    provider = ClosureProvider()
    provider.subscription[field] = value
    with pytest.raises(StripeCatalogueError):
        close_attempt(provider.client, provider.row())
    assert not any(method == "DELETE" for method, _, _ in provider.calls)


def test_incomplete_inventory_is_not_treated_as_clear():
    class BrokenList:
        settings = Settings(environment="test")
        def request(self, *args, **kwargs):
            return {"object": "list", "data": [], "has_more": True}
    with pytest.raises(StripeCatalogueError):
        list(listed(BrokenList(), "invoices"))
