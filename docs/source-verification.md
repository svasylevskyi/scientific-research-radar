# Independent source verification

This increment verifies bibliographic metadata, not scientific claims. Crossref
(DOI) and arXiv records are compared with the immutable selected/cited paper
metadata saved for a run. Source URLs, retrieved metadata, lookup timestamps,
cache provenance, comparison findings, settings, and reviewer identity are retained.
This metadata checker does not retrieve full text, extract supporting passages, validate licenses,
certify peer review, or certify that a summary is accurate.
The separate generation-time [source content pipeline](source-content.md) checks
reuse permissions and captures excerpts before summaries are requested.

## Scope and outcomes

Crossref DOI and arXiv identifiers are supported. Explicit arXiv URLs/identifiers
are preferred over a related journal DOI; arXiv-issued `10.48550/arXiv.*` DOIs map
to arXiv. Other identifiers, absent records, unsupported DOI syntax, ambiguous
matches, and service outages remain **unverified**, never assumed invalid.
There is no fuzzy title search that silently substitutes a different paper.

- **Verified metadata:** requested identity, normalized title, provided authors,
  and a complete publication date are compatible with provider metadata.
- **Conflicting metadata:** substantial title difference, mismatching identity,
  incompatible full author names, or a different recorded publication date.
- **Unable to fully verify:** missing/partial metadata, ambiguous title or author
  variations, unknown identifiers, timeouts, rate limits, or unavailable services.

Title comparison removes markup, punctuation, case, and diacritics. Exact
normalized equality matches; similarity below 0.6 flags a substantial conflict;
other differences require review. Author initials and comma-form names can match;
author completeness/order is not certified. Incompatible initials/name variants
are unverified; wholly disjoint full names are conflicts. Crossref online, print,
published, and issued dates are accepted alternatives. Partial year/month metadata
never verifies a specific day. arXiv's initial publication date is used, not its
revision date. Repeated identifiers are noted on affected paper records.

Metadata availability is separate from full-text access. arXiv abstracts are
shown as excerpts of up to 10,000 characters under its CC0 metadata terms.
Crossref abstracts are discarded because deposit does not establish reuse rights.
Provider-reported full-text links
are displayed but never fetched, so they do not establish access or licensing.

## Configuration and delivery

Under **Admin → Research quality**, only super-admins can change independent
source-verification mode. All admins can review it and inspect accessible runs.
The new setting defaults to **Observe** for future settings/run snapshots.

| Source mode | Behavior |
| --- | --- |
| Off | No automatic or manual independent metadata checks. Stored evidence remains available. |
| Observe | Record evidence; conflicts and unverified fields contribute Warning findings. |
| Enforce | Conflicts contribute Hold; unavailable or incomplete metadata contributes Warning. |

Automatic checks are skipped if the overall quality mode is Off. A source conflict
blocks automatic delivery only when **both** source mode and overall quality mode
are Enforce. Settings are snapshotted at admission. Pre-feature run snapshots never
acquire network verification on retry; their missing source mode is displayed as
Off. Existing legacy runs are not backfilled.
These modes control the metadata checker, not permission enforcement or source
retrieval for new summaries. That separate pipeline remains active with checks Off.

The ordinary **Evaluate quality** action remains a local consistency check.
**Verify sources / Recheck sources**, in Run Diagnostics, is a separate action on
completed runs using current settings. It appends evidence/history without changing
an earlier automatic decision, delivery eligibility, prior source evidence,
research context, or allowance accounting. It neither generates research nor sends
or resends email. A manual Pass never releases an existing hold. Incompatible saved
paper data produces an explicit unavailable response, not a passing assessment.

## Retrieval, cache, and recovery

Only `https://api.crossref.org/works` and
`https://export.arxiv.org/api/query` are fetched. At most one batched request per
provider is made for up to 30 selected/cited papers. No user topic, email, or account
identity is sent: queries contain only public paper identifiers. Paper/publisher
URLs and redirects are never fetched by this module.

Responses are bounded to 1 MB and an 8-second total request deadline, with a
3-second HTTP operation timeout. XML entity/DOCTYPE declarations are rejected.
There are no automatic provider retries. An API-key-free public lookup is used.

Metadata and successful no-match responses are cached for 24 hours. Temporary
failures are cached for one minute. Recheck honors that cache and explicitly shows
the original retrieval timestamp; it does not promise a fresh external request.
Database-shared provider leases serialize calls across API/worker processes.
arXiv has at least a three-second cooldown, Crossref at least one second, and
429 Retry-After values extend the cooldown. A busy provider yields an unverified
result rather than another concurrent request.

No database transaction remains open during metadata network I/O. The worker lease
is renewed before lookup and fenced again before completion. One automatic evidence
record per run is persisted as a recovery checkpoint; restarting after that point
reuses it. Quality state, delivery hold, completion, and allowance settlement still
commit together. Source lookup failures do not reject an accepted paid LLM response.

## Deployment and acceptance

Normal deployment applies migration `20260925_0030` for source evidence, metadata
cache, and provider coordination. No new secrets or environment variables are
required. Allow outbound HTTPS to the two API hosts above. Metadata-only tests do
not demonstrate that your deployment's egress can reach them.

Start in Observe and review real topics before enforcing comparisons. On a completed
historical run, open **Run Diagnostics → Independent source verification** and
click Verify sources. Expand a paper to compare saved and observed metadata, date
precision, and access information. Recheck and confirm two history entries, cache
provenance, and an unchanged original delivery decision. Disable the source check
as super-admin and confirm no new lookups can be requested. Confirm ordinary admins
cannot inspect super-admin-owned digests. User digest pages omit this admin block.

Fixtures in `backend/tests/fixtures/source_metadata` contain primary-source-checked
bibliographic examples and labelled synthetic mutations. They are contract tests,
not a broad human-reviewed scientific benchmark. Tests cover caching, deadlines,
provider errors, permissions, snapshots, duplicates, mode combinations, immutable
manual history, and checkpoint reuse.

Official interface references consulted on 2026-09-25:

- https://github.com/CrossRef/rest-api-doc — DOI filters, OR semantics, metadata fields.
- https://www.crossref.org/documentation/retrieve-metadata/rest-api/access-and-authentication/ — public access and concurrency limits.
- https://info.arxiv.org/help/api/user-manual.html — id_list, Atom records, dates and versions.
- https://info.arxiv.org/help/api/tou.html — shared request rate/concurrency limits.
