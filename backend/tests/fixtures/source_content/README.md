# Source evidence evaluation seed

`arxiv_benchmark.json` contains ten real-paper abstract metadata excerpts captured
from the linked arXiv abstract pages on 2026-09-25. Each record identifies its
version, authors, CC0 metadata permission source and capture date. The content is
abstract metadata, not a copy of the paper's full text. Mathematical markup and
page-link formatting may be normalized by retrieval. Fixture records are not raw
API responses and must not be represented as such.

These seeds are checked for structural traceability and supplied for **human review**.
Every `human_review_status` is deliberately `pending`. No independent human review,
factuality score, or release-quality threshold is claimed. The synthetic assertions
in tests demonstrate reference validity, not semantic entailment. The constructed
PMC XML in tests is original synthetic test content, not a publisher's article.

The [offline evaluation guide](../../../../docs/research-evaluation.md) now provides
a readable review packet, explicit approval records, and comparison reports using
these excerpts. Its 36 claim cases remain drafts until reviewed by a human. The
GPT-3 author list was completed from its versioned metadata page; the LIGO excerpt
ends before a malformed source-page link rather than reconstructing its wording.

For each fixture, a reviewer should add an original supported summary, a supported
finding and a deliberately unsupported variant (wrong number, changed population,
missing qualification or conclusion beyond the abstract). Record the relevant
passage, expected verdict, reviewer and date. Include a genuinely misleading claim
that cites a real passage: structural checks should accept the reference while the
human verdict rejects its scientific support. Do not mark model-generated labels
as human-approved.

Before using this as release evidence, add representative customer topics, sparse
results, inaccessible/rights-restricted sources and contradictory research; keep
a held-out subset. Current fixtures are heavily weighted toward AI and are an
initial review set, not evidence of general scientific reliability.
