# User digest settings and run history

The user digest page separates two scopes without changing the API or research workflow.

- **Digest Details** contains only the current edit form and its existing explanatory
  prompts/save feedback. Its inner column is centered and capped at 960px. No topic
  heading, Current digest details title, run explainer, Radar controls or deletion block
  appears in this panel; the surrounding page and research workspace remain fluid.
- **Output & History** opens by default, including immediately after creation. It contains
  the run history and the existing briefing, trends, papers, steps and feedback views.
  Queued, running and failed-only histories use the same workspace as completed histories.
  No-run digests show an explicit empty state with an editor link; visiting the page does
  not start research.

The topic heading, compact explanation and Radar controls belong to Output & History.
Its explainer links to Digest Details to update parameters, followed by the existing
Run now and Schedule guidance. The separate Delete digest block follows the output
workspace (including its empty state), outside any individual run. Manual execution,
scheduling, allowances, retries and deletion confirmations retain their APIs and
permission rules. Run now, retry and View progress deliberately select the relevant
run's steps in Output & History. Saving details never starts research.

## Run-level Digest Details

Within the selected run, **Digest Details** is read-only. It shows allowlisted fields from
that run's `digest_snapshot`: topic, description, include/exclude keywords, audience,
reporting dates and maximum papers. A nonempty historical `frequency` is labelled
**Legacy frequency (saved)**. Live schedule/owner/internal metadata is not presented as
historical research configuration.

Snapshots already exist in the run response. Scheduled runs' adjusted reporting windows
are read directly from the snapshot; the browser does not recompute them. Date-only
values remain date-only. Missing or incompatible fields say **Not recorded**, while
explicit empty optional values say **None**. Current digest values and form defaults are
never substituted for missing history, including while another run is loading or fails
to load. Updating the current digest does not modify saved run settings or results.

**Edit current digest details** opens the page-level editor for the same digest, retains
the selected run/filter context and opens at the top of the page, with focus on the
Digest Details page tab rather than the form. The explainer and no-runs editor links
use the same navigation. It does not copy historical settings into the edit form or
save anything automatically. The existing route-state marker is retained for older
history entries; no fragment anchor or scrollIntoView targets the edit form.

## Navigation and drafts

- `digest_tab=details` opens the live editor; absent/unknown `digest_tab` selects output.
- `output_tab=details` remains run-scoped, now selecting the read-only snapshot. Existing
  run, paper and history URLs remain valid; legacy history redirects keep query state.
- Page-tab changes pin the displayed run and retain `output_tab`, history filters, paper
  target and `return_to`. Paper-source links explicitly select the output page tab.
- Panels stay mounted while hidden, retaining unsaved form/feedback drafts and history
  presentation across page-tab switches. This is not persistence across reload or leaving
  the digest. A different digest or successful settings save resets the editor to the
  appropriate saved values.
- Hidden form failures, schedule saves and output refreshes do not take keyboard focus.
  Explicit editor links restore the page top after panel effects; abandoned navigation
  cancels that pending restoration. Polling and normal tab activation do not force
  scrolling to the top. Each
  page tab has a unique linked panel; MUI supplies manual keyboard activation.

Admin digest details and admin output/diagnostics navigation remain unchanged. The shared
workspace no longer accepts arbitrary live edit-form content as run details.

## Validation and development acceptance

`node --test tests/digest-page-scope.test.mjs tests/digest-form-ux.test.mjs` covers scope,
URL state, saved fields, missing snapshots, draft identity, failure handling, empty and
partial histories, deliberate execution navigation and unchanged admin behavior using
isolated React/router/API substitutes. Existing source-navigation tests remain in place.

Browser acceptance: open an older run, read its saved Digest Details, follow the editor
link, confirm the viewport is at the page top with the selected tab visible, change the live topic/keywords, switch tabs before saving, save, and return to the
older snapshot. Confirm no historical field changed. Exercise reload, Back/Forward,
failed saves, missing snapshots, no-run and failed-only digests, and admin navigation.
Check narrow mobile and wide-desktop layouts and keyboard focus. Existing runs are enough;
no provider calls or new research runs are necessary to review the read-only/editor split.

No database migration, environment variable, provider configuration, API-contract or
billing change is required.
