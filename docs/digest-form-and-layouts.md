# Digest guidance and readable page layouts

This is a presentation/validation increment. Manual research, saved schedules,
subscription allowances, API payloads, and legal draft copy retain their existing
behavior. Creation stays a single form; keywords are always visible.

## Width policy and audit

The shared Material UI Container theme intentionally provides a fluid page shell.
A `maxWidth="md"` prop alone does not narrow it. Targeted **inner Box** columns now
center creation at 960px, About and both legal drafts at 800px, and public/workspace
Contact at 720px. Each is `width: 100%`, with the existing shell gutters retained.
The introductory paragraphs fill those columns rather than receiving another
independent character-width cap. Header/footer, workspace/admin tables, subscription
plan cards, and digest results remain wide.

The source audit covered page-level width/max-width declarations and explanatory
Typography blocks. The workspace welcome paragraph's 65ch cap was the remaining
unintended desktop prose cap and is removed. Deliberate landing hero typography,
authentication forms, compact filter/tab controls, sidebar widths, table cells and
viewport-bounded menus are not globally expanded. A regression scans all page
components for reintroduced fixed-width Typography caps outside the landing page.
This code audit is not a claim of full-site browser or assistive-technology testing.

The redundant Subscription Plans header tax sentence is removed. Per-plan price
notes and the checkout confirmation still carry the tax information.

## Topic hints

`frontend/src/data/digest-topic-hints.json` contains only the 30 exact `topic`
values from root `DIGEST_TEST_REQUESTS.md`, in source order. A CI test parses that
document and requires an exact match; update the projection when changing the
source topics. No descriptions, historical dates or obsolete payload fields are
imported. The root document itself is not bundled or requested by the browser.

`DigestForm` chooses one `e.g. ...` placeholder in a lazy state initializer. Normal
rerenders, focus changes and polling do not rotate it. It is never written to the
controlled input value, validated as a permitted-topic list, or sent to the API.
An empty topic is still invalid. Existing saved topics are never replaced.

## Guidance and validation

On the user digest page a compact, non-dismissible explanation appears above the
controls regardless of run state. It distinguishes saving preferences, manually
starting a run, managing schedules/email, and returning to background progress and
results. Saving preferences does not cancel existing schedules. The admin edit
page retains its editing-only introduction rather than advertising unavailable
run controls. No automatic run or schedule is introduced.

Required markers remain; description and keyword labels explicitly say optional.
Labels/helper text have instance-specific IDs, and long audience/keyword chips can
wrap. Invalid submits reveal and focus an error summary with buttons to focus the
corresponding control. Focus/scroll happens after submission, not on ordinary edits
or polling. Save failures are brought into view near the form actions, while all
entered values remain. Unexpected rejected callbacks get a generic fallback message,
not raw provider details. A local in-flight guard rejects overlapping submissions.

## Development review

Check workspace, creation, About, both Contact routes, and both legal drafts on
mobile and wide desktop. Inspect the actual MUI labels/placeholder on empty focus,
long selected-audience chips, keyboard error-summary links and return from a failed
save. Open user digests with no run, a running/failed run, and completed history;
the guidance should be visible in all of them. Verify save/run/schedule remain
separate deliberate actions. Do not use production payments for UI testing.
