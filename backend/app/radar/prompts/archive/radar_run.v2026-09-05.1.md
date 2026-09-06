# Radar Run Request

Perform one complete scientific research radar run using the configuration and prior-run context below.

## Digest configuration

```json
$digest_json
```

## Previous completed runs

```json
$history_json
```

An empty history array means this is the first run.

## Required workflow

1. Search for scientific papers matching the topic, description, inclusion keywords, exclusion keywords, target audience, and reporting period.
2. Return no more papers than `maximum_papers`. Record the search queries, coverage limitations, discovery rationale, stable identifiers, canonical URLs, and citations.
3. Score every returned paper from 0 to 100 for relevance. Explain the criteria and provide recommendations for the next analysis step.
4. Produce one concise, evidence-grounded summary per returned paper, including methods, findings, limitations, implications, and recommendations.
5. Analyze trends across the returned papers. Identify themes, emerging signals, contradictions, confidence, and next-step recommendations. Use previous-run context only to describe supported changes or recurring themes.
6. Prepare structured digest briefing data and a reusable Markdown briefing suitable for later rendering into web, email, or messaging templates.

If no qualifying paper can be verified, return empty paper, relevance, and summary lists and clearly explain the search coverage and limitations. Do not fill gaps with unverified content.
