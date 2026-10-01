# Landing-page digest samples

The landing hero uses nine owner-reviewed, real-flow development digests approved
for public use on 2026-10-01. They are stored as a **static, allowlisted projection**
in `frontend/src/data/hero-samples.json`, not fetched from either environment.
Repeated topics are separate historical runs; all nine approved examples are kept.

## Content and provenance

- Preserve the supplied titles, executive summaries, highlights, transparency
  notes, and briefing warnings verbatim. The compact card uses the first complete
  summary sentence and the second highlight; the dialog contains the full saved
  summary, all highlights, caveats, and paper links. It is not labelled a full digest.
- Retain generation dates, the **requested** reporting period, original source
  links, reported publication dates, and reported source basis. Dates are formatted
  in UTC. Missing publication dates are labelled, not inferred.
- Some supplied papers predate their run's requested period. The detail dialog
  explicitly discloses out-of-period sources; this PR does not claim date compliance,
  reconcile source metadata, validate paper claims, or run an external literature check.
- The exporter's `public_use_approved: false` values were its default pre-review
  state. Publication authorization comes from the owner's subsequent explicit
  approval, not those flags or an automated quality score. One export had a quality
  hold and others were not evaluated. No "verified"/"quality passed" badges are
  introduced or inferred. Original briefing caveats remain available.
- The original export is private and is not committed. Strip run/owner IDs, model
  names, evaluation state, source-environment details, and export/review metadata.
  Public `sample-XX` IDs are presentation identifiers, not database keys.
- This projection contains no article abstracts, full texts, figures, or raw HTML.
  It publishes reviewed AI-generated prose and bibliographic links. The supplied
  examples contain no non-null source-attribution records. Future samples with
  required attribution/rights notices need explicit handling before publication;
  do not drop those notices when extending this dataset.

## Interaction

Choose a random index once when the gallery mounts. Keep it unchanged during
normal rerenders, including session restoration. Previous/Next wrap through the
collection; dots select a specific sample. There is **no timer, autoplay, topic
filter, analytics call, storage access, database connection or generation request**.
Returning to a newly mounted landing page can choose another initial sample.

The grouped-button carousel follows the WAI-ARIA carousel pattern:
https://www.w3.org/WAI/ARIA/apg/patterns/carousel/

Controls remain focusable with visible keyboard focus, announce the selected
position, and use labelled buttons. Inactive slides share a CSS grid cell to
reserve height without becoming accessible or interactive (`visibility`,
`aria-hidden`, and `inert`). No slide-transition motion is introduced.
The summary/source dialog uses Material UI's existing dialog focus management.

## Layout scope

Only the landing hero gets wider, fluid outer gutters and a centered 1680px
maximum inner composition on ultrawide screens. At the `lg` breakpoint it uses
approximately **43% copy / 57% gallery**, with a bounded 32–48px inter-column gap.
The old 500px desktop paragraph cap is removed; smaller viewports stack the
content. Header, footer, other landing sections, workspace/admin shells, pricing,
and billing remain unchanged.

## Validation

Run the existing CI frontend test/build commands. Focused tests:

```bash
cd frontend
node --test tests/hero-samples.test.mjs tests/landing-messaging.test.mjs
npm run build
```

The focused tests use isolated React/MUI doubles for component state and semantics;
they are not a substitute for browser accessibility or layout verification.

Manual acceptance on a deployed development build:

1. Inspect 320px, 375px, 768px, 1200px, 1440px, 1920px, and ultrawide layouts;
   confirm no page-level horizontal scrolling, clipped controls, or central void.
2. Cycle through every sample, including first/last wraparound and dot selection.
   Check card/controls do not jump vertically when changing samples.
3. Leave the page idle and restore/sign in to a session: no timed rotation or
   auth-triggered change. Refreshing may select the same sample by chance.
4. Navigate with Tab/Shift+Tab and Enter/Space; retain focus on the activated
   control. Check visible focus and screen-reader position announcements.
5. Open and close the summary with mouse and keyboard (including Escape); ensure
   focus returns to the trigger. Read all caveats and check source-link destinations.
6. Verify #100's live-subscription copy and both Subscription Plans links remain.
