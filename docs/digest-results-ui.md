# Digest result presentation and paper navigation

This frontend-only increment keeps the existing default briefing tab, URL-based
run history/filters, background refresh, editable settings, retry/feedback flows,
and admin diagnostics. It neither generates nor edits research output.

## Reading order and context

The selected-run overview is derived from that run's saved `digest_snapshot`,
start time, processing status and counts, never the currently edited digest.
Calendar dates retain their calendar day; timestamps follow the existing history
UTC handling and display in the viewer's local time. Missing dates are labelled.
An Earlier run badge means another run in the supplied history started later;
it is not a statement about which output is scientifically preferable.

Completed describes processing only. Running/queued output remains provisional,
failed output is explicitly partial, and a delivery hold is not presented as a
quality pass. The existing application still decides which data users can access.
AI-assessed relevance/confidence, source access and the material actually used
for a summary remain distinct. No new verified/peer-reviewed badges are inferred.

Briefings lead with the executive summary, visible quality warnings, main signal,
and highlights, followed by recommended papers/actions and transparency.
Paper cards expose publication date, source, summary basis, original-source/PDF
links, rank and AI assessment before the concise summary and key findings.
Limitations, summary warnings, search warnings and required attribution remain
visible; detailed methods, implications, recommendations, relevance assessment
and discovery metadata use labelled disclosures. Search coverage/methodology is
after the papers, but coverage notes and relevance warnings remain above them.

Trends retain every existing field and distinguish the observed pattern from AI
interpretation. Empty sections occupy less space, explicitly meaning not reported
rather than proof of absence. All previously displayed generated text and source
attributions remain accessible verbatim; inline prose identifiers are not parsed,
rewritten or guessed. The previously unused raw `content_markdown` is still not
rendered as HTML. Public hero samples and private exported data are unchanged.

## Run-scoped navigation

Structured supporting references use an exact `paper.external_id` lookup in the
selected run. Exactly one matching paper is required. Missing or ambiguous IDs
remain labelled unresolved with the original identifier and no guessed link.
Titles open an internal paper card; Original source and PDF remain separate,
validated HTTP(S) external links with new-tab labels and `noopener noreferrer`.
Credentials in source URLs and non-web protocols are rejected.

Internal URLs preserve filters, return-list context and the selected run. They add:

- `output_tab=papers`
- `paper_id=<internal paper record ID>`
- `paper_run_id=<selected run ID>`

Admin links use the admin run route and set `run_section=output`; they do not
bypass admin permissions. Paper targets only apply when `paper_run_id` matches
the selected run. Changing the selected run or explicitly leaving the Papers tab
clears the target. Pasted stale/unresolved targets do not substitute another paper.

Once the matching paper mounts, its visible heading receives focus and scrolls
into view without animation. Background data refresh does not move focus.
Back/Forward restores URL state; leaving a paper target within the same run
returns focus to the selected tab. Existing tab semantics, scroll preservation,
sidebar controls, details-form mounting, and read-only admin feedback remain.

## Layout and validation

No new narrow reading-column cap is added to the results workspace. Long titles,
source IDs, badges and links wrap, and observation/interpretation columns stack on
smaller screens. Per-run result component keys prevent disclosure state from
leaking between separate runs. MUI derives the accordion region's ID from the
summary's `aria-controls`; do not duplicate it on AccordionDetails.

Primary component reference: https://mui.com/material-ui/react-accordion/

Run focused regressions with:

```sh
cd frontend
node --test tests/results-presentation.test.mjs
```

The 22 tests use synthetic fixtures and isolated React/MUI/router/DOM doubles.
They cover date/snapshot presentation, exact reference resolution, unsafe links,
content retention, missing/partial output, state-preserving navigation and focus.
They are not a full-app browser or assistive-technology acceptance test.

Before production, review in development at narrow mobile, tablet, desktop and
wide-screen widths, including browser zoom. Follow sources from briefing and
trends to papers; exercise Back/Forward, copied URLs, an older run and stale IDs.
Verify long metadata wraps, visible warnings remain readable, collapsed details
can be opened by keyboard, and normal refresh does not steal focus. No payment or
new live-provider calls are needed to review existing runs.
