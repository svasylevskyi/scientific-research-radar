# Research orchestration boundaries

`RadarRunner` retains the explicit discovery/relevance → paper summaries → trend
analysis → digest briefing sequence. Each stage either reuses its completed
checkpoint or constructs input, executes a request, validates the result, and
persists accepted output. The runner owns stage order and summary batching;
collaborators own policy and storage.

| Component | Responsibility |
| --- | --- |
| `radar/stage_inputs.py` | Digest snapshots (including scheduled reporting dates) and the three downstream paper payloads. Pure construction preserves discovery order and existing prompt shapes. |
| `radar/validation.py` | Named output acceptance rules: discovery cap, exact summary batch membership, and known-paper references for trends and briefing. Existing Pydantic contracts still validate structure and uniqueness. |
| `radar/submission.py` | Account locking, admission limits, quota reservation, run creation, and explicit retry transactions. |
| `radar/request_execution.py` | One provider invocation, wired to a fresh accounting collector and lease callbacks. |
| `radar/request_accounting.py` | Submitted/observed request evidence, durable response IDs, usage observations, and pricing snapshots. Evidence is persisted independently of output acceptance. |
| `radar/lease.py` | Original worker ownership checks and lease renewal at submission, response-ID, usage, and polling callbacks. |
| `radar/lifecycle.py` | Stage checkpoints, batch commits, failure recovery, and terminal status plus quota settlement. |
| `repositories/digest_run_repository.py` | Run queries, history context, and owner feedback updates. |
| `repositories/run_state_repository.py` | Queue/stage state, conditional worker claims, leases, and conditional retry claims. |
| `repositories/run_result_repository.py` | Accepted papers, summaries, trends, and briefing records. |
| `repositories/radar_request_repository.py` | Request lookup, accepted usage metadata, and rejected/interrupted outcomes. |

The repositories do not invoke billing/quota services or provider execution.
Submission and lifecycle coordinate quota policy above persistence. Pure inputs
and validation have no repository, service, or network dependencies. The public
runner admission methods and error imports remain available to existing callers;
internal writer callers now use the appropriate repository or lifecycle service.

## Transaction and recovery invariants

| Boundary | Preserved behavior |
| --- | --- |
| Admission/retry | Account lock, accepted-start rate limits, run enqueue, access reservation, and observation reservation remain in one transaction. A failed admission rolls these back. Scheduled admission can return with `commit=False` so its caller includes the schedule cursor in the same commit. |
| Provider callbacks | Submission evidence and background response IDs commit durably before subsequent polling/output acceptance. Resuming the same response updates the existing request; pre-ledger responses keep unknown original pricing. |
| Pricing | The requested model tariff is captured at submission. A returned-model tariff can replace it only if it existed at submission; an alias resolution alone does not erase known pricing. |
| Accepted output | Output records, stage progress, response IDs, and accepted usage metadata commit together. Each completed summary batch is durable before the next batch starts. |
| Rejection/interruption | Completed rejected responses retain accounting evidence and are cleared for a fresh retry. Polling interruptions retain resumable response IDs unless the client explicitly reports the response lost. Legacy rejected-response cleanup remains available on explicit retry. |
| Completion/failure | Access and observation quota settlement commit with terminal run state. Failure first rolls back uncommitted work and checks worker ownership before persisting failure. A worker that no longer owns the run leaves recovery to its replacement. |

This refactoring preserves the original concurrency checks and transaction order;
it does not introduce stronger lease fencing beyond the existing callback and
failure boundaries.

## Preparing quality gates

The named `validation.validate_*` calls are the acceptance boundary between a
completed, accounted request and persisted research output. A future gate can
produce a decision there while leaving retry mechanics, charging evidence, and
quota settlement with their current owners. Trend/briefing reference rules
currently allow any discovered paper, not just papers selected for summaries.

Research quality thresholds and evaluation policy remain a separate increment.
Re-evaluating already completed checkpoints would also need an explicit policy:
today they resume without another provider request or a new acceptance decision.

## Verification

Existing tests cover completed-stage reuse, failed-stage retries, rejected
responses, reclaimed leases, tariff snapshots, quota reservation/settlement,
schedule handling, and owner-scoped history. New focused tests cover pure input
selection, named validation rules, dependency boundaries, and a partially saved
summary stage whose second batch fails and then resumes without duplicate usage.

From `backend`, run `python -m pytest` and `python -m mypy`. CI checks the six
billing modules and thirteen research modules. The API contract freshness check
continues to verify that this internal refactoring leaves the generated API
contracts unchanged. No migration is required.
