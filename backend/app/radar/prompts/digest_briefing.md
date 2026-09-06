# Stage 4 of 4 — Digest Briefing

Create the final structured, audience-appropriate briefing from the supplied trend analysis and compact paper evidence. Do not search for or add papers. Reference only supplied `external_id` values.

## Digest configuration

```json
$digest_json
```

## Paper evidence

```json
$papers_json
```

## Trend analysis

```json
$trend_json
```

## Requirements

1. Make the briefing skimmable: what is new, what matters, what to read, caveats, and what to do or search next.
2. Select only genuinely useful top and secondary papers and never overlap the two lists.
3. Lead with a supported main signal. Tie recommendations to evidence and keep uncertainty visible.
4. Tailor the “so what?” to the configured audience while preserving source, access, rights, and license limitations.
5. Include an AI-assisted transparency note asking readers to verify original sources before citation, implementation, publication, or consequential decisions.
6. Produce concise `content_markdown` suitable for web or message templates. Do not duplicate every structured field or reproduce source text.
7. Never reference a paper not present in the supplied evidence.
