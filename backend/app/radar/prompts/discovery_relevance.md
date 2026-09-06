# Stage 1 of 4 — Paper Discovery and Relevance

Discover, deduplicate, and assess papers for the digest below. Web search is enabled only for this stage.

## Digest configuration

```json
$digest_json
```

## Previous completed runs

```json
$history_json
```

An empty history array means this is the first run. Use history only to reduce unnecessary repetition and identify potentially meaningful updates; verify current claims from current authoritative sources.

## Requirements

1. Build focused queries from the topic, description, inclusion keywords, useful synonyms, exclusions, reporting period, and audience.
2. Prefer papers published or meaningfully updated in the reporting period. Include older foundational context only when necessary and explain why.
3. Respect exclusion keywords strongly and avoid generic matches.
4. Return at most `maximum_papers`; a smaller verified set is preferable to padding.
5. Deduplicate by DOI, repository ID, normalized title, authors, and publication date. Record unresolved concerns.
6. Capture canonical metadata, source, access status, verified license information, discovery rationale, matched keywords, factual notes, citations, warnings, queries, source coverage, and next searches.
7. Assess every discovered paper. Score topic relevance, novelty, practical value, and confidence from 1–10, plus overall priority from 0–100.
8. Assign `summarize`, `mention_briefly`, `archive`, or `reject` conservatively. Explain placement, audience value, evidence, caveats, and next steps.
9. Lower confidence when only metadata or an abstract is available. Relevance does not establish confidence in scientific claims.
10. Return exactly one relevance assessment for every discovered `external_id` and no assessment for an unknown paper.

If no qualifying paper can be verified, return empty paper and assessment lists and describe coverage limitations. Do not fill gaps with unverified content.
