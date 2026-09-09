# Admin run usage and cost estimates

Admin → Digests → select digest → run review contains a cost summary and **Usage & Cost** tab. The owner UI is unchanged. The read-only API is `GET /api/v1/admin/digests/{digest_id}/runs/{run_id}/costs`; existing admin/owner visibility restrictions apply, including protection of super-admin data.

## Deployment and pricing

Run `alembic upgrade head` (revision `20260909_0014`) before restarting the API and research worker. The normal deployment script performs migrations.

Sign in as super-admin and select **Pricing** in the header (`/admin/pricing`). Enter the exact model ID, a unique version label for that model, USD rates for input/cached-input/output tokens per million, web search per call, and the maximum input size covered by that tariff. Verify against the [official pricing page](https://developers.openai.com/api/docs/pricing) and your account agreement.

**Save pricing version** publishes immediately for new requests. To update, select **Use as new version**, adjust fields, and give it a new version label. Historical versions cannot be edited or deleted through the API. The highest published database ID for a model is current; concurrent publications have a deterministic order. Each request snapshots the selected rates, so ongoing response polling and old estimates keep their original prices. No restart or deployment is needed for subsequent pricing changes. A new request within an ongoing run can use newly published prices.

Read/create APIs: `GET /api/v1/admin/pricing?offset=0&limit=50` and `POST /api/v1/admin/pricing`. Both are super-admin only, including reads. The payload is the model name (`model_name`) plus all fields from `RadarPricing`. Duplicate model/version pairs return 409. The UI shows current and historical versions with pagination. Ordinary admins can still review run estimates, but cannot manage tariffs.

### Migrating existing environment prices

Runtime no longer reads `RADAR_PRICING`. You may enter existing values through the page. Alternatively, after migrating the database, run once in an environment with access to the database and the old environment variable:

```bash
python -m app.radar.import_pricing
```

For local development, the importer also reads `backend/.env` when run from `backend`. For Docker, run this module in the Compose **ops** service using the same environment file and image configuration as the deployment. It validates the entire JSON input and publishes only models that have no database prices; it never replaces an existing model's rates. Repeating it is safe. After successful import, remove `RADAR_PRICING` from the environment file. If you skip import, accounting continues with unknown monetary estimates until tariffs are entered in the UI. Existing request snapshots require no migration or repricing.

Only flat standard-tier tariffs are currently supported. A different returned model, non-default service tier, reported cache writes, or input exceeding the configured limit remains unpriced. Models with fixed search-token blocks, special cache-write tariffs, regional uplifts, discounts or other special pricing require a future tariff extension; do not configure a flat tariff for them.

## What the numbers mean

The ledger saves an attempt before submission and observes response IDs, provider status, model, reasoning effort, token usage, web-search call count and timestamps before application output validation. No prompts, generated paper text, credentials or raw provider errors are stored in the ledger. Failed/rejected responses retain any observed usage. Repeated polling updates the same response record. A new submission creates a separate attempt; resuming an existing response does not.

The calculation is `(input - cached input) × input rate + cached input × cached rate + output × output rate`, with token rates divided by one million, plus observed web-search calls times their configured fee. Reasoning tokens are already part of output and are never added again. Search-content tokens are not guessed from paper counts; the token calculation uses provider-reported usage. Estimates are operational estimates, not invoices, and exclude tax, credits and unreported charges. Reconcile with OpenAI billing before using them for customer billing.

A missing response, unavailable usage or unsupported/missing price is **unknown**, never a zero-cost request. The UI shows only a known subtotal while any request is unpriced, while a run is active, or while historical coverage is incomplete. Submitted attempts without a response ID may or may not have incurred charges. A provider error before the SDK exposes a response can prevent exact usage recovery; these attempts remain visible and unknown. Worker interruption can leave an unconfirmed outcome until recovery.

Old runs are not backfilled with invented request records or current prices. Their accepted-stage usage remains visible when available; historical rejected responses and retry spend cannot be reconstructed. A resumed pre-ledger response can capture usage, but has no original pricing snapshot. No aggregate dashboard or user-facing cost display is included.
