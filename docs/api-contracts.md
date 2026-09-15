# API contracts

FastAPI response schemas are the source of truth for subscription billing,
access, observation, synchronization, sandbox tools, plan administration,
pricing, and spending. All 46 success responses in these eight route modules
now declare a `response_model`. Authentication and error handling remain in the
existing dependencies and exception handlers.

## Updating a contract

1. Update the response schema in `backend/app/schemas/` and its service producer.
   Use named nested objects, distinguish nullable fields from conditional fields,
   and preserve compatibility unless a behavior change is intentional.
2. Install the backend and frontend dependencies, then generate the types:

   ```sh
   python -m pip install -e 'backend[dev]'
   npm ci --prefix frontend
   npm run contracts:generate --prefix frontend
   ```

   Set `PYTHON` to your virtual environment's Python executable if it is not the
   default `python`. Generation needs no running API, database, Stripe, or OpenAI
   connection and never starts application workers.
3. Review the generated diff in `frontend/src/types/api.generated.ts` and update
   consumers. `ApiResponse<Path, Method>` follows the actual operation's success
   response. Use generated `components["schemas"]` types for nested values.
4. Run the backend tests from `backend`, and `npm run contracts:check` plus
   `npm run build` from `frontend`. Commit the schemas, generated types, and
   consumer changes together.

The exporter uses the registered API routers with their production prefixes.
It exports the full OpenAPI document, so existing declared contracts are also
available for incremental adoption. The generated file contains types only;
it adds no runtime bundle or automatic frontend runtime validation. Handwritten
UI form state (for example an empty pricing input) can differ from a wire request.
Other pages' legacy types can adopt these generated types in later increments.

## Compatibility rules

- Money stored as decimal strings stays a string. Invoice minor-unit amounts
  stay integers. Missing provider spending remains `null`, not zero.
- Response routes use `response_model_exclude_unset=True`: absent conditional
  fields stay absent, while explicitly returned nulls remain null.
- Historical plan configuration is described by a read schema. Reading an old
  revision never reapplies today's publishing validators or adds new defaults.
- Timestamp serialization preserves the previous ISO spelling, including naive
  historical pricing timestamps and UTC offsets.
- User-facing access plan details contain only entitlement fields. Admin plan
  responses describe Stripe mappings explicitly; raw provider payloads and
  credentials are not part of these contracts.
- Existing lifecycle tests compare validated responses with their original
  JSON-compatible service payloads, catching silently dropped fields, injected
  defaults, or value changes. Focused tests check declarations, OpenAPI coverage,
  conditional nulls, historical configuration, and event-key notification IDs.

CI regenerates in memory and fails if the committed TypeScript file is stale.
The normal TypeScript build then checks its consumers. Generator dependencies
are locked in `frontend/package-lock.json`; backend dependency updates that
change OpenAPI output also require reviewing and regenerating the contracts.
No database migration is required for this increment.
