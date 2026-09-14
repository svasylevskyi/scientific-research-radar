# Billing service boundaries

First increment on the long-lived `refactor/maintainability` branch. Billing
remains sandbox-only. Routes, response bodies, database schema, Stripe parameters
and subscription policies are unchanged.

## Dependency direction

| Layer | Modules | Responsibility |
| --- | --- | --- |
| Provider | `billing_provider`, `stripe_catalogue_service` | HTTP transport, sandbox object/identifier/redirect guards, catalogue verification. No account or transition orchestration. |
| Payment rules | `billing_payment_rules` | Parse invoice evidence, resolve historical price bindings, validate exact upgrade quotes and settlement. No command dependencies. |
| Eligibility | `billing_policy` | Catalogue eligibility, opt-in, pending-intent queries, shared access exception and limits. No transition execution. |
| Evidence | `billing_invoice_service` | Persist/reconcile invoices and assess paid coverage and grace, including prior upgrade evidence chains. |
| Entitlements | `subscription_access_service`, `free_subscription_service` | Resolve access, Free fallback, reservations and allowances from saved evidence. No Stripe requests. |
| Observation | `billing_change_observation`, `billing_upgrade_observation` | Interpret canonical observations, update local bindings, enqueue notices. Never submit Stripe changes or commit. |
| Commands and coordination | `stripe_sandbox_service`, `subscription_change_service`, `subscription_upgrade_service`, `subscriber_billing_service`, `billing_sync_service` | Coordinate checkout, changes, upgrades and retries; own external writes and durable transaction boundaries. |

Commands may use checkout reconciliation, which uses independent observers.
Observers and invoice evidence must not call commands back. Shared eligibility
queries avoid importing a command service merely to check for a pending intent.
Free enrollment imports the shared exception rather than the entitlement resolver.

Existing public helper names remain as imports for caller/test compatibility.
New lower-layer code imports the owning module directly; compatibility exports
must not become a route back to command dependencies.

## Invariants retained

- Persist exact approved intent before external writes; retry identical parameters
  and idempotency keys after ambiguous failures.
- Preserve account locks, lease checks and transaction boundaries. Observers may
  flush, but cannot commit or roll back their caller's transaction.
- Materialize elapsed Free fallback before recovery replaces the old observation.
  Interpret changes/upgrades before checking the bound price and reconciling invoices.
- Require matching ownership, periods, prices, quantities and settlement. Upgrade
  activation also requires the original paid coverage chain.
- Preserve allowances, research, renewal/undo timing, retry windows and notification
  deduplication. Continue rejecting live keys and live objects.

## Validation and follow-up

`tests/test_billing_boundaries.py` detects cycles across all service imports,
including local imports; restricts foundational dependencies; and rejects commits,
rollbacks and direct non-GET provider requests in observers/payment rules.
Behavioural verification uses the existing billing, subscription, registration,
access, scheduler and run suites. Simulated-time fixtures now set observer clocks
alongside command/access clocks.

Typed response/domain objects, provider injection and smaller command functions
can follow separately. Avoid mixing those changes with payment-policy or
transaction-boundary changes. This increment needs no migration.
