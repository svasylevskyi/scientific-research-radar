# Manual AI claim-support review

The optional reviewer starts **Off**. **Observe** permits explicit, paid admin
reviews. It never runs automatically during research, changes a quality decision
or email hold, grants human approval, or consumes subscriber research allowances.

## Deployment and setup

1. Deploy normally, including migration **20260925_0033**. It adds review jobs,
   a request ledger and a daily reservation counter. Existing runs, source records,
   human labels and quality decisions are unchanged.
2. Reuse **OPENAI_API_KEY**. No new environment variables, outbound destinations,
   source-fetching permissions or separate service are required. The API supervises
   the worker; database leases coordinate multiple API processes.
3. In **Admin → Pricing**, publish accurate, nonzero standard input/output rates
   and an appropriate input-token ceiling for the reviewer model.
4. As super-admin, open **Admin → Research quality → AI claim review**. Choose a
   Responses API model supporting structured output and low reasoning effort,
   configure limits, select **Observe**, provide a reason and save. The initial
   model is `gpt-6-astra`; use one available to your project. Defaults are 40
   claims, 1,500 output tokens per claim, $1 per review, $5 in daily reservations,
   and 100 daily reserved calls. These are starting controls, not measured cost
   recommendations.
5. Test one small completed run. For benchmark comparison, complete human review
   and publish a revision first. AI observations cannot fill pending human labels
   or approve comparison criteria.

All admins can read settings and review accessible runs. Only super-admins can
change controls. Super-admin-owned digest protections apply to review history and
exports too. The settings revision, requesting admin and time are recorded.

## Review a run

Open **Research output & history → Run Diagnostics → Research Quality**, select
**Review claims with AI**, and confirm the paid action. The job continues if the
browser closes. Refreshing history only reads saved results.

One request assesses one saved summary statement or key finding. Results are
**Supported**, **Contradicted**, **Insufficient evidence**, or **Abstain**, with a
short rationale and passage IDs. Supported/contradicted require valid saved passage
references. Malformed responses, refusals, incomplete output and invalid references
are unsuccessful attempts, never passing verdicts.

The first configured number of claims is selected in saved paper/statement order.
The UI reports total, selected and completed counts; omitted claims are not assessed.
Metadata-only disclosure messages are excluded. This increment does not extract
atomic claims or review the complete trends/briefing. Compound summaries require
support for all material parts, but the AI judgment can itself still be wrong.

Expand a review and claim to inspect its evidence, attribution, licence, permission
record, rationale, latency and cost. Download retains the review and, for benchmarks,
candidate output. The original deterministic decision remains authoritative for
the existing delivery policy. An AI result never releases held output.

## Evidence boundaries

Only saved, permission-checked excerpts are sent. There are no fresh metadata/source
lookups, publisher scraping, full-paper downloads or search tools. Run admission
rechecks the source adapter, supported licence/provenance, content hash, policy
version and bounds. Missing/incompatible evidence prevents the paid review. Reuse
is limited to the existing arXiv abstract and explicitly permitted PMC section
adapters. Abstracts are never represented as full papers; model licence claims do
not grant rights.

Benchmarks retain the permission-aware import contract and published human permission
attestations. Only approved cases in the chosen publication/split are sent. Excluded
cases are omitted. Human verdicts/rationales, criteria, tags, severity and split names
never enter the model input. The prompt treats claims and excerpts as untrusted data.

Requests use `store=false`, no tools and no SDK retries. This flag does not promise
zero provider retention; provider account terms/settings and privacy disclosures
still apply.

## Compare with the human benchmark

Open **Human Benchmark Review → AI benchmark comparison**, select a published
revision and Development or Held-out, then **Compare AI with benchmark**. Every
approved case in that split must fit the configured claim limit; no convenient
subset is selected. Use held-out cases only for planned evaluation, not tuning.

Scoring uses the publication's frozen labels/criteria even if working reviews change
afterward. The UI shows accuracy, coverage, false acceptance, readiness reasons and
failures. Downloads include the full evaluation report and per-case measurements.
Failed/unknown request costs remain in the review ledger. Inadequate benchmark
size/diversity stays **Not ready** despite high scores. The seed held-out set is
still too small for the example acceptance criteria.

To compare versions, use exported `candidate` objects with the offline evaluator's
`--baseline` and the same published benchmark bundle. Side-by-side baseline comparison
in the UI is not included. A benchmark pass does not establish scientific truth or
launch readiness. Reader usefulness, discovery coverage and synthesis need separate
evaluation.

## Budgets, interruptions and accounting

Admission reserves selected calls and a conservative cost ceiling before network
requests. The ceiling uses UTF-8 input bytes plus schema/framing allowance, the
maximum applicable configured input rate and output-token cap. Oversized inputs
are rejected without truncating evidence. Missing/zero pricing or insufficient
limits prevents submission.

These are **estimated spending controls using your tariffs**, not a guarantee of
the provider invoice. Keep prices accurate and configure provider spending alerts
separately. Unpriceable usage or costs exceeding the reservation stop further calls.

Reservations are retained after cheaper responses, failure or deletion to cover
uncertain charges. Daily counters reset on the next admission after midnight UTC.
Jobs stop before further submissions when their reservation day ends or they are
over two hours old. A previously submitted call may finish after a boundary. Only
one review job is active across API processes.

Each request intent commits before submission. Response ID, model, usage, tariff,
latency and outcome are retained independently of verdict acceptance. Submission
has a 60-second transport timeout and no automatic retry. Recovery stops an
interrupted, potentially charged attempt rather than submitting it again. Starting
another review is an explicit new paid action using a new reservation.

Switching AI review **Off** blocks new jobs and stops further requests in existing
jobs; an in-flight call may finish. The main quality gate mode is separate. Jobs
retain their model, limits, price, input hash, prompt and settings revision. A
changed deployed prompt or incompatible saved inputs stops further calls.

Run review costs appear in **Costs → AI claim review** and digest totals. Run and
benchmark requests both appear in Spending estimates. Benchmark work is not
attributed to a subscriber digest. Unknown cost is never represented as zero.
Reload Costs after a review to see its latest accounting.

Before downgrading below migration 0033, switch AI review Off, wait for work to stop,
and export/back up history. Downgrade removes these review/accounting tables while
preserving existing automatic delivery decisions.

## Acceptance

- Confirm deployment starts Off and ordinary admins cannot change controls.
- Enable Observe with valid pricing; review a small run, inspect evidence/costs,
  and verify allowances, output and delivery are unchanged.
- Try a low budget or a legacy run without evidence: no paid request should start.
- Switch Off mid-review: the current call may finish; no later calls should start.
- Publish human labels and compare a split. Later working-label edits must not
  alter its saved comparison.
- Check desktop/mobile dialogs, expandable evidence, exports and the digest-owner
  Search button; three-character suggestions remain available.

Automated provider tests are mocked. They verify workflow/failure handling, not
scientific accuracy. Live calibration remains an explicit paid acceptance step.
