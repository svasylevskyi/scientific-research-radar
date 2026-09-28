# List and research navigation

Research quality has **Settings** and **Benchmarks** tabs under its existing admin
menu item. `#benchmarks` opens the human-review workspace; older `#benchmark-review`
links remain valid. Both forms stay mounted after first opening, so tab switches
retain unsaved edits. Leaving the page still requires saving those edits. Loading
either tab or following a bookmark does not run checks or start paid AI review.

Admin Digests stores `owner_id` / `owner_query` and `page` in its query string.
Admin Users stores `query` and `page`; the Radar workspace stores `page`.
A new submitted search starts on page one. Invalid page numbers fall back to one;
pages beyond the current results move to the last available page after loading.
Detail and run-history links carry an internal `return_to` list URL. Back links
restore that filter and page, including after refresh or opening in a new tab.
Return URLs are restricted to the expected internal list, never arbitrary targets.

Run selection and views use query parameters:

| Parameter | Values / purpose |
| --- | --- |
| `run_id` | The selected run; selecting a view pins the displayed run into the URL |
| `run_section` | Admin `diagnostics` (default) or `output` |
| `diagnostic_tab` | Admin `quality` (default), `costs`, or `steps` |
| `output_tab` | `briefing`, `trends`, `papers`, `feedback`; user views also allow `steps` and `details` |
| `run_from`, `run_to` | Inclusive run-history dates; an empty value removes that bound |
| `run_progress`, `run_completed`, `run_failed` | `1` / `0` history filters |

Switching runs retains the chosen view. If that output is unavailable, the existing
fallback selects available output or shows the no-output message. Unknown diagnostic
tabs open Research Quality. Admin digest details/history navigation carries the same
query, and the benchmark link includes a validated **Back to run** destination.

Tab, filter, and run changes do not move focus or reset page scroll. Global-menu
links still open the page top. Explicit benchmark section links reveal their target;
browser Back/Forward restore URL selections. No navigation action saves unsaved forms.
