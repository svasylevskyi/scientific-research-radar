# Admin run usage and cost estimates

Admin → Digests → select digest → run review contains a cost summary and **Usage & Cost** tab. The owner UI is unchanged. The read-only API is `GET /api/v1/admin/digests/{digest_id}/runs/{run_id}/costs`; existing admin/owner visibility restrictions apply, including protection of super-admin data.

## Deployment and pricing

Run `alembic upgrade head` (revision `20260909_0013`) before restarting the API and research worker. The normal deployment script performs migrations. No external calls are needed to initialize accounting.

Set `RADAR_PRICING` in the backend environment (on development: `/etc/radar/development.env`) to a JSON object mapping **exact model IDs** to validated price versions. This operator-owned setting is not editable by ordinary users or admins in the UI. Example flat standard-tier tariff, in USD:

```dotenv
RADAR_PRICING='{"gpt-6-astra":{"version":"2026-09-09-standard-v1","input_per_million":"10","cached_input_per_million":"1","output_per_million":"50","web_search_per_call":"0.01","max_input_tokens":272000}}'
```

Verify rates against your project billing agreement and the [official pricing page](https://developers.openai.com/api/docs/pricing) before enabling them. The example covers standard short-context text requests only. Rates are deliberately **not enabled by default**. Decimal strings avoid binary floating-point calculations. Change the version whenever rates change, then redeploy/restart the worker. Each new attempt saves the full price configuration; changing configuration cannot change an existing request's estimate. No price is inferred from model name prefixes. A different returned model, non-default service tier, reported cache writes, or input exceeding the configured limit remains unpriced. Models with fixed search-token blocks, special cache-write tariffs, regional uplifts, discounts or other special pricing require a future tariff extension; do not configure a flat tariff for them.

## What the numbers mean

The ledger saves an attempt before submission and observes response IDs, provider status, model, reasoning effort, token usage, web-search call count and timestamps before application output validation. No prompts, generated paper text, credentials or raw provider errors are stored in the ledger. Failed/rejected responses retain any observed usage. Repeated polling updates the same response record. A new submission creates a separate attempt; resuming an existing response does not.

The calculation is `(input - cached input) × input rate + cached input × cached rate + output × output rate`, with token rates divided by one million, plus observed web-search calls times their configured fee. Reasoning tokens are already part of output and are never added again. Search-content tokens are not guessed from paper counts; the token calculation uses provider-reported usage. Estimates are operational estimates, not invoices, and exclude tax, credits and unreported charges. Reconcile with OpenAI billing before using them for customer billing.

A missing response, unavailable usage or unsupported/missing price is **unknown**, never a zero-cost request. The UI shows only a known subtotal while any request is unpriced, while a run is active, or while historical coverage is incomplete. Submitted attempts without a response ID may or may not have incurred charges. A provider error before the SDK exposes a response can prevent exact usage recovery; these attempts remain visible and unknown. Worker interruption can leave an unconfirmed outcome until recovery.

Old runs are not backfilled with invented request records or current prices. Their accepted-stage usage remains visible when available; historical rejected responses and retry spend cannot be reconstructed. A resumed pre-ledger response can capture usage, but has no original pricing snapshot. No aggregate dashboard or user-facing cost display is included.
