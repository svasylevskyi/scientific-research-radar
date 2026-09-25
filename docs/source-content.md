# Source content and traceable summaries

Discovery still uses OpenAI web search without a domain allowlist. Its purpose is
to locate and rank bibliographic records. The summarization, trend, and briefing
stages do not have web search enabled. This increment makes the content supplied
to summaries independent of discovery text and model-reported access/licence labels.

## Permission policy (version 1)

The application treats public access and permission to retain, transform, and
redistribute text as separate questions. Only the following adapters supply text:

| Source | Retained content | Required permission |
| --- | --- | --- |
| arXiv metadata API | Abstract excerpt, up to 10,000 characters | arXiv's CC0 grant for descriptive metadata, explicitly including abstracts |
| PMC OAI-PMH | Abstract and selected article paragraphs | Explicit article-level CC0 1.0 or CC BY 2.0/2.5/3.0/4.0 licence URL, with no ambiguous scope or conflicting restrictions |
| Crossref | Bibliographic facts and links only | Returned abstracts are discarded; an API response does not establish rights to them |
| Other sources, user links, unknown/custom licences | Bibliographic facts and links only | No content copied on the basis of availability or model assertions |

PMC retrieval uses its supported OAI-PMH interface. First fetch front matter to
check identity and permissions; request full XML only if approved. Check identity,
licence, notice, and OAI datestamp again before retaining text. A changed or
unconfirmed permission fails closed. NC, ND, SA, ported, custom, missing, and
ambiguous licences are excluded in this initial policy. These exclusions are
conservative product rules, not assertions that all such uses are prohibited.

PMC support requires an explicit PMCID or canonical PMC URL in discovery metadata
or citations. It does not guess identifiers from a title, scrape publishers, use
the retired PMC OA service, or follow arbitrary full-text links. arXiv PDFs are
not downloaded. Coverage is deliberately narrower for retained text than discovery.

Title/author matching is conservative. PMC must match its requested identifier
and any saved DOI; arXiv must match its requested identifier/version, title and
provided authors. Ambiguity leaves the source unavailable. Only selected article
paragraphs are retained; figures, tables, quotes, supplements and references are
excluded. Stored excerpts are limited to 24,000 characters and 24 passages per
paper. They must never be described as a complete full-text review.

Each run retains source and permission URLs, author attribution, rights notice,
retrieval time, version/datestamp, text hash, policy version, cache provenance,
section labels, and stable passage IDs. These records are immutable inputs, reused
on retry. A source change cannot silently replace text used by a saved response.

No policy can establish every underlying right automatically. Provider declarations
are the recorded basis of these safeguards; source-specific exceptions and the
product's terms/retention practices still require human legal review before launch.

## Generation and presentation

Before summary requests, the worker captures approved source content. Discovery
abstracts and factual notes are not forwarded as evidence. Unsupported sources
produce a metadata-only availability note: the server removes model-generated
methods, findings and other scientific detail when no approved text was supplied.
This rule applies even when all quality checks are Off.

The existing summary request returns passage references for its concise summary
and each key finding. The server fixes the access basis and supplies attribution;
the model cannot create permission records. Trend inputs omit discovery rationales
and carry summary limitations. Briefings and emails include source attribution,
licence links, notices and an indication of changes. Source excerpts retain their
original licence. There is no additional OpenAI reviewer request; existing prompts
can grow, so token usage and cost may increase.

Admin **Run Diagnostics → Summary evidence** displays statements beside their
referenced excerpts, plus all saved passages and permission details. This endpoint
is read-only, uses existing admin ownership restrictions, and never fetches content
or changes allowances/delivery. Old completed runs are not retrospectively given
evidence they never used. For pre-feature unfinished runs, pending summaries fall
back to metadata-only; new excerpts are never attributed to old background requests.

The super-admin **Warn about missing source content or evidence links** setting
controls observation findings only. Missing text, missing/unknown passage IDs, and
invalid finding indices produce warnings. A valid reference proves only that the
passage was supplied, not that it supports the statement. A wrong numerical claim
with a real passage ID can pass this structural check and must be reviewed by a
human. New warnings do not create additional delivery holds. Existing quality
gates retain their behavior. Rights checks and content retrieval are independent
of the quality and metadata-verification switches.

## Reliability and operation

The arXiv adapter reuses the shared metadata cache and provider throttle. PMC uses
a database-shared lease across workers; no transaction remains open during network
I/O. Each article attempt makes up to two serial requests, at least 0.35 seconds
apart, and reserves two of a conservative 96-request rolling 24-hour budget. This
keeps the interactive adapter below PMC's high-volume workflow. Budget exhaustion,
busy providers, and outages yield metadata-only results. Successful PMC captures
are cached for 24 hours; unsuccessful captures for one minute. There is no automatic
retry loop. A re-run can use a refreshed cache; a retry of the same run retains its
original inputs.

PMC requests have three-second HTTP timeouts, eight-second per-request deadlines,
an eighteen-second total retrieval deadline, and four-megabyte encoded/decoded
response limits. Gzip/deflate decoding is bounded. Redirects, XML entities and
DOCTYPE declarations are rejected. Worker ownership is renewed before retrieval
and fenced before inputs are persisted. Content URLs from model output are never
fetched directly. PMC requests contain only the public identifier; topics and
subscriber identities are not sent to the provider.

## Deployment and cleanup

Migration `20260925_0031` adds run content/cache tables and provider coordination
fields. It also removes discovery abstracts without independent permission proof
from paper records, saved stages and history context, plus Crossref abstracts from
metadata caches and verification evidence. Bibliographic records and existing
generated reports/assessments are retained. Downgrade does not restore removed text.
Earlier backups may still contain those fields: apply the normal retention/removal
policy and ensure restores run the cleanup migration before serving old data.

No new credentials are required. The research worker additionally needs outbound
HTTPS to **pmc.ncbi.nlm.nih.gov**. Existing arXiv/Crossref access requirements remain.
Check real provider connectivity after deployment; mocked tests cannot establish it.

## Evaluation and acceptance

Ten versioned arXiv abstract fixtures are stored under
`backend/tests/fixtures/source_content`, with source/permission URLs and pending
human-review labels. They cover computing, education, and physics, but are heavily
weighted toward AI and do not establish launch-quality coverage. Regression tests
seed missing/wrong passage IDs and exercise permission failures, source changes,
outages, compression bounds, retained retries, API permissions, attribution, and
unchanged model-request counts. See that directory's review guide before treating
the fixture set as a human-approved scientific benchmark.

After deployment, run a digest that selects an arXiv paper. Verify its summary is
labelled abstract-only and its evidence/CC0 provenance is visible to admins. For
a PMC paper with an approved licence, verify selected sections and attribution in
the digest and email. Check a source without approved text produces a metadata-only
note, not invented scientific findings. Review narrow desktop/mobile layouts,
old runs without evidence, and retry behavior. Keep observation warnings enabled
while collecting human feedback.

## Primary policy/interface references (checked 2026-09-25)

- https://info.arxiv.org/help/api/tou.html — descriptive metadata/abstract CC0 terms and API limits.
- https://www.crossref.org/documentation/retrieve-metadata/rest-api/ — abstracts may remain copyrighted.
- https://pmc.ncbi.nlm.nih.gov/tools/oai/ — supported front-matter/full-text interfaces, compression and rate limits.
- https://pmc.ncbi.nlm.nih.gov/tools/textmining/ — supported retrieval services and article-specific reuse terms.
- https://creativecommons.org/licenses/by/4.0/ — attribution, notice and modification requirements; other rights may remain.
