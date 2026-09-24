# Research quality foundation

New runs default to **Observe**. The new deterministic checks make no OpenAI or
source-fetching requests and are not a factual-accuracy certification.

## Settings and rollout

Admin → Research quality is available to all administrators. Only super-admins
can save changes. A reason is required; immutable revisions record the actor,
timestamp, complete settings, and version. Stale edits receive a conflict rather
than overwriting another administrator's work. Version 0 is the built-in policy.

| Mode | New run behaviour |
| --- | --- |
| Off | Skip the new checks; Not evaluated. Existing schema, security, and reference-integrity validation still applies. |
| Observe (default) | Record Pass / Warning / Hold and findings; do not block email delivery. Emails disclose findings and observation mode. |
| Enforce | Record decisions and prevent held output from automatic delivery. Missing or failed required evaluation also prevents delivery. |

Each run captures the active settings and check-engine version **at admission**,
including scheduled runs. Retries retain that snapshot. Later configuration
changes affect new runs only: switching Off never releases an existing hold.
Legacy runs, including already queued/running runs at upgrade, keep a null
snapshot and remain Not evaluated. No historical run is assigned an assumed pass.

Start in Observe. Review representative topics, no/sparse results, inaccessible
sources, and false positives. Adjust optional checks and the sparse threshold,
then enable Enforce after accepting the results and customer allowance policy.

**Allowances are unchanged:** generation completes and settles the existing run
allowance even if the quality decision is Hold. Checks add no extra run or paid
request. Automatic corrections, manual release, refunds of research allowances,
and retrospective re-evaluation are not implemented in this increment. A held
run is not an execution failure and cannot use the failed-stage retry endpoint.
Agree the treatment of permanently held output before enforcing for paying users.

## Rules

| Check | Result | Configurable |
| --- | --- | --- |
| Blank briefing title, executive summary, content, transparency, trend overview, or selected-paper summary | Hold | No, in Observe/Enforce |
| Selected-paper and summary sets differ | Hold | No, in Observe/Enforce |
| Trend/briefing reference absent from discovery or selected summaries | Hold | No, in Observe/Enforce |
| Theme/main signal lacks supporting IDs; multi-paper pattern cites one ID | Hold | No, in Observe/Enforce |
| Included paper publication date outside the snapshot interval, inclusive | Hold | Reporting-date switch |
| Included paper date missing | Warning | Reporting-date switch |
| Included papers share normalized DOI or source URL | Hold | Duplicate switch |
| Same normalized title or reported possible duplicate | Warning | Duplicate switch |
| Abstract-only, metadata-only, or unclear summary basis | Warning | Source-access switch |
| Full-text summary basis conflicts with discovery availability | Hold | Source-access switch |
| Selected count below threshold | Warning only | 0–30, default 3; 0 disables |

Date and duplicate checks apply to selected or cited papers, not rejected search
candidates. Unknown dates are not invented; update dates do not replace
publication dates. Title similarity only flags possible duplicates. Source-access
checks compare saved declarations; they do not independently establish what was
read. Empty research can pass with the sparse warning disabled, provided the
briefing explains its result and does not claim unsupported themes/signals.

## Completion, delivery, and visibility

Run completion, quality findings, delivery hold, and quota settlement commit in
one transaction. Existing response IDs, partial batches, accounting records, and
retry boundaries remain intact. Unexpected evaluator errors record an explicit
Hold; details stay in server logs rather than being exposed in the UI.

Enforced holds set the outbox to `held` without an SMTP attempt. The delivery
worker and email renderer independently check the saved decision before sending,
including recovered outbox claims. Holds remain terminal for automatic delivery.
Enforced held output and its feedback are excluded from subsequent research history
context, so it is not reused as accepted previous research.

Owners and admins can inspect held output with a visible delivery-blocked notice;
completed generation is not described as quality approval. Admin run views expose
the detailed findings, affected paper IDs, mode, and settings/check versions.
Normal Off/legacy runs show Not evaluated. A Pass only means these checks passed.

## Deployment and verification

Migration `20260924_0028` adds settings revisions and run quality fields. No new
environment variables or provider permissions are needed. Deploy the API, worker,
and scheduler together using the regular maintenance deployment procedure. Older
code does not enforce these rules; do not run it alongside quality-aware services.
The migration refuses downgrade while delivery-blocked runs exist. Retain a
quality-aware release for rollback.

`tests/fixtures/research_quality_baseline.json` is a synthetic contract fixture.
`tests/test_research_quality.py` seeds date, duplicate, missing-content, source,
reference, sparse, and failure cases and tests permissions, settings conflicts,
snapshots, retries, and delivery. These regression fixtures are **not** the later
human-reviewed scientific benchmark.

Validation commands:

```bash
cd backend
python -m pytest tests/test_research_quality.py tests/test_digest_runs.py tests/test_scheduler_delivery.py tests/test_research_boundaries.py
python -m mypy
```

Visual acceptance: review owner/admin results in all modes, a long finding/ID on
mobile, a read-only ordinary-admin settings page, a super-admin settings change
and audit entry, and an enforced held scheduled run with no delivered email.
