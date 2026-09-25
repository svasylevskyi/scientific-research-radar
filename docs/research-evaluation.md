# Human benchmark review and offline evaluation

## Review in the application

Open an admin digest's **Research output & history**, select a run, then use
**Run Diagnostics → Human Benchmark Review** (immediately after Research Quality).
The same shared review workspace is available on the admin Research quality
settings page.
**Costs** and **Steps** are separate diagnostics tabs; **Run Output** contains the
briefing, trends, paper summaries and feedback.

Human benchmark review labels the shared evaluation cases, not the selected digest
run. It makes no LLM calls, retrieves no additional source content and never changes
run quality, delivery holds, billing or allowances. Ordinary admins can review;
only super-admins can import datasets/proposals, approve criteria, resolve disputes
and publish revisions. Regular users cannot access these endpoints.

1. Choose a development case. Read the claim, original citations and supplied
   permitted excerpts. Source attribution, licence and permission links are shown.
2. Choose **Supported**, **Contradicted** or **Insufficient evidence**, select the
   relevant passages and explain your decision. Save a **Draft** to resume later.
3. To complete or exclude a case, explicitly confirm that you personally reviewed
   the evidence and reuse permissions. The server records your signed-in identity,
   timestamp and review version. Each save appends history; stale saves are rejected.
4. Mark unclear decisions **Disputed**. Conflicting final decisions by different
   reviewers also become disputed, including when an intermediate draft was saved.
   A super-admin must explicitly resolve the dispute with a decision and rationale.
5. Complete the reserved held-out cases for a planned evaluation. A super-admin
   reviews/approves the comparison criteria, then **Publish benchmark revision**
   freezes the completed/excluded labels and criteria. Every case must be resolved,
   and at least one must be approved. Later edits only affect the working copy.

Publishing freezes review inputs; it does **not** mean a candidate passed evaluation
or that the product is ready to launch. Dataset size/diversity, verdict coverage and
other scoring gates still apply when evaluating a saved candidate below. The seeded
held-out set is intentionally too small for the example minimum of 20 cases.

Drafts remain mounted while switching Diagnostics/Output or diagnostics tabs. Save
before leaving the page; unsaved edits are not automatically persisted. Imports are
limited to permission-checked benchmark inputs. Imported labels are draft proposals,
never authenticated approvals, and cannot overwrite existing drafts or reviews.

**Import and export** downloads a JSON bundle with `benchmark`, `reviews`, `criteria`
and optional publication metadata. Download a numbered publication for a repeatable
comparison. To use it with the existing offline CLI, split a downloaded bundle on
your local machine (no server-file editing required):

```bash
python - radar-benchmark-published-1.json ./reviewed-benchmark <<'PY'
import json, pathlib, sys
bundle = json.loads(pathlib.Path(sys.argv[1]).read_text())
folder = pathlib.Path(sys.argv[2])
folder.mkdir(parents=True, exist_ok=False)
for name in ("benchmark", "reviews", "criteria"):
    (folder / f"{name}.json").write_text(json.dumps(bundle[name], indent=2))
PY
```

Use these three files with `app.evaluation evaluate`. Candidate generation and
comparison reports remain in the offline CLI for this increment; the application
provides the human labeling and criteria workflow. The optional file-based workflow
below is retained for local development and automation.

## Offline framework

This framework compares **saved claim-review verdicts** against human-approved
labels. It does not generate research, call a model, fetch a source, connect to the
database, send email, or change production quality settings, delivery, or quotas.
It is preparation for a later optional semantic reviewer, not that reviewer itself.

The checked-in benchmark is a **draft**. Its 36 claims are AI-authored review
candidates, not established scientific labels. The packet starts every human label
as pending. An evaluator cannot report a pass until the selected cases and acceptance
criteria have been explicitly reviewed. CI validates file structure and tests scoring;
it does not claim that scientific quality has passed.

## Included material and permissions

`backend/evaluation/benchmarks/research_support_v1.json` contains ten versioned
arXiv abstract-metadata excerpts with authors, capture dates, source URLs, CC0
licence and permission records. These are copied from the existing source-content
fixtures, not newly downloaded full papers. Two extraction problems in those
fixtures were corrected against their versioned arXiv pages: the incomplete GPT-3
author list and a malformed link in the LIGO record. The latter is handled by
ending the excerpt before the malformed text, without reconstructing missing words.

Four additional source scenarios are explicitly fictional: conflicting classroom
trials, an unavailable/rights-unconfirmed record with **no retained text**, and
source-text instructions that must be treated as data. Their text was created for
this repository; they are not real studies. Reports separate real-paper and
synthetic/unavailable results. A numerical score dominated by synthetic cases is
not evidence of broad scientific reliability.

The importer accepts only versioned arXiv abstract metadata under its recorded
CC0 terms or clearly identified original synthetic scenarios. It rejects arbitrary
publisher URLs, unapproved licence records and text attached to unavailable sources.
Do not paste restricted source text into claims, rationales, or synthetic scenarios.
The schema cannot prove the actual origin of user-entered text; the human review
includes checking identity, excerpt integrity and permissions. Future PMC or other
source imports require an explicit permission-aware adapter; they must not be
relabeled as synthetic. Production content safeguards remain unchanged.

## 1. Prepare a review packet

From `backend`, with backend dependencies installed:

```bash
python -m app.evaluation validate \
  --benchmark evaluation/benchmarks/research_support_v1.json

python -m app.evaluation prepare \
  --benchmark evaluation/benchmarks/research_support_v1.json \
  --split development \
  --output /tmp/radar-review-development
```

This creates a new directory, refusing to overwrite an earlier packet:

| File | Purpose |
| --- | --- |
| `review.md` | Readable claims, excerpts, identities, provenance and review instructions |
| `reviews.json` | Pending labels to complete after human review |
| `inputs.json` | Candidate inputs without expected labels, failure tags, severity or split names |
| `candidate.json` | Empty saved-verdict template for a later reviewer experiment |

There are 29 development cases and seven reserved heldout cases. All variants of
one paper stay in the same split, including across source versions. Use development
cases for tuning. Generate a separate packet with `--split heldout` only for a
planned evaluation. The repository is public and these examples are already visible:
this split is a **workflow boundary, not secret unseen test data**. Before launch,
add independently reviewed, representative heldout papers not used during tuning.
The seven-case seed heldout split does not meet the example minimum dataset size.

## 2. Review and approve labels

For each claim, read only the provided evidence. Select:

| Verdict | Meaning |
| --- | --- |
| `supported` | The evidence supports the claim with its stated population, numbers and qualifications |
| `contradicted` | The evidence conflicts with the claim |
| `insufficient_evidence` | The evidence does not establish the claim; this does not prove the claim false |

Original claim citations may be misleading; evaluate the actual evidence rather
than treating citation presence as support. No access to a full paper should be
implied by an abstract-only record. Statements embedded in excerpts are source data,
never instructions to the reviewer.

Edit the matching record in `reviews.json`. Keep `case_id` and `case_sha256` intact.
Only after actual human review:

- Set `status` to `approved`, choose the verdict and add a concise original rationale.
- Supply relevant `evidence_passage_ids`. Supported and contradicted verdicts require
  at least one passage from that case. Insufficient evidence can have none.
- Record the reviewer's name and an ISO timestamp with timezone, for example
  `2026-09-25T14:00:00+02:00` (use the actual review time).
- Set `human_reviewed` and `permissions_checked` to true only for work actually done.
- For an ambiguous or defective case, use `excluded` with identity, date and reason.
  Exclusions remain visible in reports and reduce the available benchmark coverage.

These are self-attested offline records, not authenticated admin signatures. Store
approved benchmark/label revisions in version control, reviewed through a PR. Do not
overwrite old reports or silently replace another reviewer’s labels. Use a second
reviewer for disputed cases and record the adjudication in the rationale/PR. Model
labels are proposals until a human has checked them.

The benchmark and every case/evidence set have content hashes. Changing evidence,
claims, split assignments or other benchmark fields invalidates prior input bindings.
Regenerate packets and explicitly review the new revision; never just change a hash
to make old approval records validate. Store approved labels separately from model
inputs to avoid leaking the answers.

## 3. Supply saved reviewer results

Complete `candidate.json` with a meaningful candidate ID, method, evaluator version,
and model/prompt versions (required for nonempty saved-model results). `judgments`
contains one object per case:

```json
{
  "case_id": "copy-from-inputs",
  "case_sha256": "copy-the-64-character-hash-from-inputs",
  "verdict": "supported",
  "evidence_passage_ids": ["copy-relevant-passage-id"],
  "rationale": "Explain the decision using the supplied evidence.",
  "cost_usd": null,
  "latency_seconds": null
}
```

This is a shape example, not a scored judgment. Verdicts also accept
`contradicted`, `insufficient_evidence`, or explicit `abstain`. Missing judgments
remain missing. Neither missing results nor abstentions are counted as correct.
Unknown/duplicate case IDs and changed inputs are rejected. Incorrect passage IDs
are reported as an evaluation failure, not silently ignored.

Costs and latency are optional **measured per-case allocations**. For a batched
review request, allocate totals once across its cases; do not repeat the full batch
cost for every case. Null means unknown, not free or instantaneous. The framework
does not independently verify these measurements. Producing candidate outputs with
a model later will incur that model’s normal costs; evaluating saved outputs here
does not. The framework has no model runner or API-key setting.

## 4. Evaluate and compare

Copy `evaluation/benchmarks/criteria.example.json` to your experiment directory.
Its draft values illustrate engineering thresholds, not approved product policy.
A human must agree the dataset size, source diversity, coverage, accuracy and
false-acceptance limits, then record their identity, timestamp and rationale and
set the criteria status to `approved`. Critical false acceptance and invalid
required evidence references always fail regardless of aggregate thresholds.

```bash
python -m app.evaluation evaluate \
  --benchmark evaluation/benchmarks/research_support_v1.json \
  --split development \
  --reviews /tmp/radar-review-development/reviews.json \
  --candidate /tmp/radar-review-development/candidate.json \
  --criteria /tmp/radar-review-development/criteria.json \
  --output /tmp/radar-evaluation-first
```

Add `--baseline /path/to/earlier-candidate.json` to compare two saved candidates
against the **same** benchmark, split, human labels and acceptance criteria. The
report names per-case regressions/improvements and shows both metric sets. A
baseline for a different benchmark revision is rejected.

`report.md` provides a readable summary; `report.json` includes hashes, complete
criteria, case results, confusion matrices and breakdowns by scope, case tag and
real/synthetic sources. Reports are deterministic for the same inputs.

| Metric | Denominator and interpretation |
| --- | --- |
| Accuracy | Approved cases with correct verdict **and valid required references**, divided by all approved cases |
| Verdict accuracy | Correct verdicts divided by all approved cases, independent of reference validity |
| Prediction coverage | Approved cases with a non-abstained verdict, divided by all approved cases |
| False acceptance | Unsupported human-labeled cases predicted supported, divided by all unsupported cases |
| False rejection | Supported cases predicted contradicted/insufficient, divided by all supported cases |
| Unsupported detection | Unsupported cases predicted contradicted/insufficient, divided by all unsupported cases |

Missing/abstained cases stay in accuracy and coverage denominators; they are shown
separately from positive/negative errors. An empty denominator is null/not measurable,
never 100%. Pending labels are unscored and block readiness. Every verdict class and
at least one critical unsupported case must be represented by approved labels.

| Exit code | Meaning |
| --- | --- |
| `0` | Command succeeded; for `evaluate`, the supplied benchmark criteria passed |
| `1` | Evaluation completed but criteria failed |
| `2` | Evaluation is not ready: pending reviews/policy, insufficient coverage or no substantive verdicts |
| `3` | Invalid input, incompatible hashes, or file error |

A not-ready report still lists known failures. A benchmark pass does not certify
scientific truth, validate every reference’s semantic relevance, or approve launch.
The sample’s computing-heavy coverage needs expansion across customer topics.

## Remaining work and deployment

Normal deployment applies migration **20260925_0032**, creating the benchmark,
append-only review/criteria history and frozen publication tables. It seeds the
existing 36-case benchmark with all labels pending and criteria in draft. The frozen
seed asset is included in the backend image. No additional environment variables,
LLM credentials or outbound access are needed. Existing runs and automatic quality
settings remain unchanged. Backups now include review history; downgrading below
this migration deletes that history and publications, so export/back up first.

Review work is ongoing: add representative cases and revisit labels/criteria as
prompts, models, evidence or product expectations change. Import a new benchmark
revision when changing claims/evidence; existing publications stay bound to their
original input hashes. Keep held-out data out of tuning and candidate prompts.

Next: complete human review, broaden the dataset, then add an optional bounded
semantic reviewer in Observe mode and evaluate it through this contract. Separate
digest-level evaluation must measure discovery coverage, relevance, synthesis and
usefulness with representative readers; a claim-review score does not measure those.
