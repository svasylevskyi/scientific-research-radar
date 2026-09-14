"""Stripe transport and object guards; no checkout, entitlement, or transition orchestration.

This boundary intentionally remains sandbox-only. Moving it does not enable live payments.
"""

import re
from datetime import timezone
from urllib.parse import urlsplit

import httpx

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


def utc(value):
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def identifier(value, prefix):
    if not isinstance(value, str) or not re.fullmatch(
        re.escape(prefix) + r"[A-Za-z0-9_]{1,240}", value
    ):
        raise Error("Stripe returned an unexpected identifier.")
    return value


def redirect_url(value, host):
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
    def __init__(self, settings, *, transport=None):
        self.settings, self.transport = settings, transport
        self.key = (
            settings.stripe_sandbox_api_key.get_secret_value()
            if settings.stripe_sandbox_api_key
            else ""
        )
        if not self.key.startswith(("rk_test_", "sk_test_")):
            raise Error(
                "Configure a Stripe sandbox API key on the API server. Live keys are not accepted.",
                503,
            )

    def request(self, method, path, *, data=None, idempotency_key=None):
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
                        "Stripe rejected access. Check the sandbox key permissions in the setup guide.",
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
                # Portal sessions do not expose livemode; their configuration is
                # checked independently and only test-key requests are permitted.
                if result.get("livemode") is True or (
                    path != "billing_portal/sessions"
                    and not (
                        path.split("?")[0] == "invoices"
                        and result.get("object") == "list"
                    )
                    and result.get("livemode") is not False
                ):
                    raise Error("Stripe did not return a sandbox object.")
                return result
        except Error:
            raise
        except (httpx.HTTPError, ValueError, TypeError):
            raise Error(
                "Stripe is unavailable or returned an unexpected response. Retry the same action to resume safely.",
                503,
            ) from None

    def mapping(self, configuration):
        return check_mapping(configuration, self.settings, transport=self.transport)


def tagged(obj, row):
    metadata = obj.get("metadata") or {}
    if (
        metadata.get("radar_attempt_id") != str(row.id)
        or metadata.get("radar_sandbox") != "1"
    ):
        raise Error("Stripe object does not match this sandbox checkout.")


def enabled(settings):
    if not settings.stripe_sandbox_checkout_enabled:
        raise Error("Sandbox checkout is disabled on this server.", 503)
    if (
        not settings.stripe_sandbox_webhook_secret
        or not settings.stripe_sandbox_webhook_secret.get_secret_value().startswith(
            "whsec_"
        )
    ):
        raise Error(
            "Configure the sandbox webhook signing secret before enabling checkout.",
            503,
        )
