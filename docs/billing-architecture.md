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

## Typed payment rules and transition invariants

The second increment adds immutable `ProrationLine`, `VerifiedUpgradeInvoice`,
`PriceBinding`, and `PlanEntitlements` values in the dependency-free
`billing_types` module. `UpgradeQuoteRecord` and `InvoiceReview` describe the
existing dictionary contracts. ORM JSON and API serialization remain unchanged.
Raw `ProviderObject` dictionaries intentionally contain `Any`: provider fields
must pass named validation rules before becoming verified evidence. Type
annotations do not replace runtime checks.

Invoice validation reads in order: require ownership, require supported setup,
validate each proration line, require the source credit and target charge, then
require an exact positive total. The snapshot adapter retains the original keys
and price ordering so existing saved quotes remain comparable. Database
references guaranteed by intent foreign keys or a preceding evidence refresh are
documented where narrowed for type checking.

| Transition | Invariants preserved |
| --- | --- |
| Immediate paid upgrade | Higher price, same currency/interval, no lost quota/capability, and at least one improved benefit. Evidence matches the saved quote. Activation still requires settlement and original paid coverage. |
| Scheduled downgrade | Different tier, lower monthly catalogue price, no increased quota/capability. The command still checks normalized interval price, current coverage and renewal boundary. |
| Interval switch | Retain the purchased revision; change at renewal. Existing schedule identity, phase and payment checks remain authoritative. |
| Undo / expiry | Preserve cutoff, retry identity and verified provider state. A voided unpaid optional upgrade retains prior paid terms. |
| Free fallback / recovery | Retain usage and allowance anchors; subscription status alone cannot establish payment evidence. |

Observer/shared-policy arguments are annotated and keyword-only after the session
argument; quote validation uses entirely keyword-only arguments. Callers name the
checkout, upgrade/change, user and evidence explicitly. HTTP contracts are
unaffected; internal helper signatures changed.

Run `python -m mypy` from `backend` to check six typed boundary modules. CI runs it
alongside both database variants. Scope can grow in future increments; legacy
command/API dictionaries are not claimed as fully typed. Added payment tests
cover quote serialization, adjustment rejection, monetary non-coercion,
period/total matching, preview ownership and entitlement preservation.
