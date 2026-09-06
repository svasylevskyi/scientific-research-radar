# Stage 3 of 4 — Trend Analysis

Analyze cross-paper signals from the supplied scored papers and summaries. Do not search for or add papers. Reference only supplied `external_id` values.

## Digest configuration

```json
$digest_json
```

## Previous completed runs

```json
$history_json
```

## Current paper evidence

```json
$papers_json
```

## Requirements

1. Identify recurring themes, methods, models, tools, datasets, benchmarks, systems, limitations, unresolved problems, competing approaches, and weak signals.
2. A trend normally needs multiple papers. Mark one-paper patterns as `single_paper_signal` and do not generalize them to the field.
3. Separate observed evidence from interpretation. Include supporting paper IDs, confidence, audience relevance, and caveats.
4. Use history only for supported new, repeated, fading, stronger, or weaker signals. With no relevant history, return no historical changes.
5. Surface practical implications, useful monitoring queries, source-diversity and sample-size limitations, and what to watch next.
6. Never reference a paper not present in the supplied evidence.
