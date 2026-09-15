"""Stripe transport and object guards; no checkout, entitlement, or transition orchestration.

The deployment selects the provider mode; object and saved-attempt modes must agree.
"""

import re
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlsplit

import httpx

from app.core.config import Settings
from app.models.stripe_sandbox import SandboxCheckout
from app.services.billing_types import ProviderObject
from app.services.stripe_catalogue_service import StripeCatalogueError as Error
from app.services.stripe_catalogue_service import check_mapping

TERMINAL = {"canceled", "incomplete_expired"}
STATUSES = {
    "incomplete",
    "incomplete_expired",
    "trialing",
    "active",
    "past_due",
    "canceled",
    "unpaid",
    "paused",
}


def utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def identifier(value: object, prefix: str) -> str:
    if not isinstance(value, str) or not re.fullmatch(
        re.escape(prefix) + r"[A-Za-z0-9_]{1,240}", value
    ):
        raise Error("Stripe returned an unexpected identifier.")
    return value


def redirect_url(value: object, host: str) -> str:
    if not isinstance(value, str):
        raise Error("Stripe did not provide a hosted page.")
    parsed = urlsplit(value)
    if (
        parsed.scheme != "https"
        or parsed.netloc != host
        or parsed.username
        or parsed.password
    ):
        raise Error("Stripe returned an unexpected hosted page.")
    return value


class StripeSandboxClient:
    def __init__(
        self, settings: Settings, *, transport: httpx.BaseTransport | None = None
    ) -> None:
        self.settings, self.transport = settings, transport
        self.key = (
            settings.effective_stripe_api_key.get_secret_value()
            if settings.effective_stripe_api_key
            else ""
        )
        if not self.key.startswith(("rk_live_", "sk_live_") if settings.stripe_livemode else ("rk_test_", "sk_test_")):
            raise Error(
                f"Configure a Stripe {settings.stripe_mode} API key on the API server. The key must match STRIPE_MODE.",
                503,
            )

    def request(
        self,
        method: str,
        path: str,
        *,
        data: dict[str, Any] | None = None,
        idempotency_key: str | None = None,
    ) -> ProviderObject:
        try:
            with httpx.Client(
                base_url="https://api.stripe.com/v1/",
                auth=(self.key, ""),
                timeout=8,
                follow_redirects=False,
                transport=self.transport,
            ) as client:
                response = client.request(
                    method,
                    path,
                    data=data,
                    headers={"Idempotency-Key": idempotency_key}
                    if idempotency_key
                    else {},
                )
                if response.status_code in (401, 403):
                    raise Error(
                        "Stripe rejected access. Check the Stripe key permissions in the setup guide.",
                        503,
                    )
                if response.status_code != 200:
                    raise Error(
                        "Stripe could not complete this operation. Retry the same action; no new checkout will be created for an unresolved attempt.",
                        503,
                    )
                result = response.json()
                if not isinstance(result, dict):
                    raise ValueError()
                # Portal sessions do not expose livemode; verify their configuration
                # separately. Invoice lists have no mode; every invoice is checked.
                if ("livemode" in result and result["livemode"] is not self.settings.stripe_livemode) or (
                    path != "billing_portal/sessions"
                    and not (
                        path.split("?")[0] == "invoices"
                        and result.get("object") == "list"
                    )
                    and result.get("livemode") is not self.settings.stripe_livemode
                ):
                    raise Error(f"Stripe did not return a {self.settings.stripe_mode} object.")
                return result
        except Error:
            raise
        except (httpx.HTTPError, ValueError, TypeError):
            raise Error(
                "Stripe is unavailable or returned an unexpected response. Retry the same action to resume safely.",
                503,
            ) from None

    def mapping(self, configuration: dict[str, Any]) -> ProviderObject:
        return check_mapping(configuration, self.settings, transport=self.transport)


def tagged(obj: ProviderObject, row: SandboxCheckout) -> None:
    metadata = obj.get("metadata") or {}
    if (
        metadata.get("radar_attempt_id") != str(row.id)
        or (metadata.get("radar_mode") != "live" if row.livemode else
            metadata.get("radar_mode", "sandbox") != "sandbox" or metadata.get("radar_sandbox") != "1")
        or obj.get("livemode") is not row.livemode
    ):
        raise Error("Stripe object does not match this checkout.")


def enabled(settings: Settings) -> None:
    if not settings.effective_stripe_checkout_enabled:
        raise Error("Checkout is disabled on this server.", 503)
    if (
        not settings.effective_stripe_webhook_secret
        or not settings.effective_stripe_webhook_secret.get_secret_value().startswith(
            "whsec_"
        )
    ):
        raise Error(
            "Configure the Stripe webhook signing secret before enabling checkout.",
            503,
        )
