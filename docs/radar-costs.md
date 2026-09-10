# Admin run usage and cost estimates

Admin → Digests → select digest → run review contains a cost summary and **Usage & Cost** tab. The owner UI is unchanged. The read-only API is `GET /api/v1/admin/digests/{digest_id}/runs/{run_id}/costs`; existing admin/owner visibility restrictions apply, including protection of super-admin data.

## Deployment and pricing

Run `alembic upgrade head` (revision `20260909_0014`) before restarting the API and research worker. The normal deployment script performs migrations.

Sign in as super-admin and select **Pricing** in the header (`/admin/pricing`). Enter the exact model ID, a unique version label for that model, USD rates for input/cached-input/cache-write/output tokens per million (cache-write rate is optional unless the request contains writes), web search per call, and the maximum input size covered by that tariff. Verify against the [official pricing page](https://developers.openai.com/api/docs/pricing) and your account agreement.

**Save pricing version** publishes immediately for new requests. To update, select **Use as new version**, adjust fields, and give it a new version label. Historical versions cannot be edited or deleted through the API. The highest published database ID for a model is current; concurrent publications have a deterministic order. Each request snapshots the selected rates, so ongoing response polling and old estimates keep their original prices. No restart or deployment is needed for subsequent pricing changes. A new request within an ongoing run can use newly published prices.

Read/create APIs: `GET /api/v1/admin/pricing?offset=0&limit=50` and `POST /api/v1/admin/pricing`. Both are super-admin only, including reads. The payload is the model name (`model_name`) plus all fields from `RadarPricing`. Duplicate model/version pairs return 409. The UI shows current and historical versions with pagination. Ordinary admins can still review run estimates, but cannot manage tariffs.

### Legacy environment configuration

`RADAR_PRICING` and its one-time importer have been retired. Prices entered through the UI remain in the database. The old environment variable can be removed; use the Pricing page for all changes.

Only flat standard-tier tariffs are currently supported. Non-default service tiers and input exceeding the configured limit remain unpriced. Requests with cache-write tokens require an explicit `cache_write_per_million` value in their saved pricing snapshot; blank is unknown, not zero. Models with fixed search-token blocks, regional uplifts, discounts or other special pricing still require a tariff extension.

At submission, the requested model's tariff is snapshotted with its model name. If OpenAI returns a different model ID (such as an alias resolving to a dated version), an exact returned-model tariff published at or before submission takes precedence; otherwise the requested-model snapshot is retained. No rate is inferred from model-name prefixes and a tariff published after submission is never substituted. Admin request details show both the returned model and the pricing model. Older releases discarded snapshots whenever the returned name differed; discarded snapshots are not automatically rebuilt for already-finished runs.

For cache-write support, use **Pricing → Use as new version**, enter the provider's applicable cache-write USD/million rate and save with a new version label. This affects new requests. Existing snapshots missing this rate remain unknown for requests containing cache writes.

## What the numbers mean

The ledger saves an attempt before submission and observes response IDs, provider status, model, reasoning effort, token usage, web-search call count and timestamps before application output validation. No prompts, generated paper text, credentials or raw provider errors are stored in the ledger. Failed/rejected responses retain any observed usage. Repeated polling updates the same response record. A new submission creates a separate attempt; resuming an existing response does not.

The calculation is `(input - cached reads - cache writes) × input rate + cached reads × cached rate + cache writes × cache-write rate + output × output rate`, with token rates divided by one million, plus observed web-search calls times their configured fee. Reasoning tokens are already part of output and are never added again. Search-content tokens are not guessed from paper counts; the token calculation uses provider-reported usage. Estimates are operational estimates, not invoices, and exclude tax, credits and unreported charges. Reconcile with OpenAI billing before using them for customer billing.

Admin **Usage & Cost** now explains each unknown estimate: missing saved pricing, missing or invalid usage, unsupported service tier, input beyond the tariff limit, unavailable search-call count, or missing cache-write rate. A missing response, unavailable usage or unsupported/missing price is **unknown**, never a zero-cost request. The UI shows only a known subtotal while any request is unpriced, while a run is active, or while historical coverage is incomplete. Submitted attempts without a response ID may or may not have incurred charges. A provider error before the SDK exposes a response can prevent exact usage recovery; these attempts remain visible and unknown. Worker interruption can leave an unconfirmed outcome until recovery.

Old runs are not backfilled with invented request records or current prices. Their accepted-stage usage remains visible when available; historical rejected responses and retry spend cannot be reconstructed. A resumed pre-ledger response can capture usage, but has no original pricing snapshot. No aggregate dashboard or user-facing cost display is included.

## OpenAI spending page

Super-admin → Pricing → **View OpenAI spending** (`/admin/spending`) shows reported project spending alongside local known estimates, daily figures, and charge-line breakdowns. All API access is super-admin only. Loading is explicit, with a five-minute bounded per-process cache and no background scheduler.

Configure these on the API server, then recreate the container through normal deployment:

```dotenv
OPENAI_ADMIN_API_KEY=your-separate-openai-admin-key
OPENAI_COSTS_PROJECT_ID=proj_your_radar_project
```

Use an OpenAI organization admin key authorized to read costs, not the ordinary research key. Keep it server-side; never add it to frontend environment variables. The supplied Compose configuration exposes this credential only to the API service and explicitly clears it for research, scheduler, and ops containers. No credentials are accepted through the page or returned by the endpoint. No new database migration is required for this page. The legacy importer and its tests are removed; persisted pricing and request snapshots are untouched.

The backend calls the [Costs API](https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/usage/methods/costs) at a fixed HTTPS URL, filters by the configured project, groups by project and charge line, and follows pagination with bounded requests/timeouts. Invalid, non-USD, wrong-project, truncated, and failed responses produce an error instead of a partial total. Provider errors are sanitized. Negative amounts (credits) are preserved. Repeated refreshes within five minutes reuse provider results; local estimates are queried anew.

`GET /api/v1/admin/spending?from_date=YYYY-MM-DD&to_date=YYYY-MM-DD` accepts inclusive UTC dates spanning at most 93 days. Missing daily buckets show “Not reported”. Billing can lag, including current-day data. Local totals cover this environment's ledger by request creation time, with unpriced requests and detectable legacy gaps identified. Provider totals may include other applications and environments in the same project; the two scopes and time attribution are not necessarily identical. The page deliberately does not claim exact reconciliation, reprice old runs, or assign provider charges to individual runs. Switching the configured project changes only the provider side, not historical local ledger scope.
