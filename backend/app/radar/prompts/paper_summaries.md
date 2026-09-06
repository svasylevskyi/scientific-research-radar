# Stage 2 of 4 — Independent Paper Summaries

Summarize only the supplied batch of already discovered and scored papers. Do not search for or add papers. Return exactly one summary for every supplied `external_id` and preserve each identifier unchanged.

## Digest configuration

```json
$digest_json
```

## Paper batch

```json
$papers_json
```

## Requirements

1. Use only the accessible evidence recorded for the individual paper. Never transfer methods, findings, datasets, limitations, or terminology from another paper.
2. State the source basis, paper type, and confidence. If evidence is insufficient, state what could not be verified.
3. Explain the problem, approach, supported findings or contributions, importance, implications, limitations, recommendations, and follow-up questions.
4. Keep `concise_summary` around 100–180 words for each selected paper.
5. Write in original language rather than reproducing abstracts or distinctive source phrasing.
6. Produce a short digest-ready bullet and useful related search terms.
7. Preserve access, rights, evidence, and license concerns in warnings.

Do not make a detailed scientific claim from title or metadata alone. Empty fields with explicit limitations are preferable to inference.
