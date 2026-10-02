# Admin support UI

This presentation increment covers Users, User Details, Digests and Contact
Messages. Shared header, pagination and account-status presentation live in
`AdminSupport.tsx`; small formatting, draft and return-link helpers live in
`admin/support.ts`. It is not a new administration framework.

## Layout

The existing fluid Container theme and gutters remain. Explanations fill their
contextual width. The toolbar is below the explanation and wraps rather than
squeezing it into a narrow column. Desktop lists retain tables with column/row
headers; mobile cards expose the same status and named actions. DigestList's
owner links and View digest/View runs controls are admin-only. Public digest
navigation remains unchanged.

## Support navigation

- User and digest queries/pagination keep their existing URL state.
- Messages add `page` and `message_id`; opening/closing a dialog does not mark it
  reviewed. Back/Forward and a copied URL reopen the message from that page once
  loaded. There is no single-message GET endpoint: when it is not in the returned
  page (including after new arrivals), show an explicit missing-selection notice,
  not a different message and not a scan of every page.
- Find matching users opens the existing name/email search with the literal,
  encoded sender email. The existing API limits search to 120 characters; the
  dialog discloses this for longer addresses. Search matches are not identity or
  ownership verification. No account is automatically linked to a message.
- `support_return` accepts only known relative admin support paths, rejects
  external URLs, fragments, control characters, backslashes and oversized values,
  and is never an authorization input. Existing `return_to` list context remains.
- From an account, related digest and billing links carry that account's full
  source URL. AdminBillingNavigation preserves it between the existing billing
  sections and in its User details link only while the same user is selected.
  Changing the selected account drops the old account return context.
- These URLs can contain an email search string, just as the existing user search
  does. Do not publish support URLs or treat them as anonymized data.

## Reads and mutations

ResourceNotice remains the source of read retry/cooldown and last-complete-data
messages. A failed read is not an empty list. Account edits and message review
writes pause while their latest read is in error.

Account drafts live in a user-keyed component. Refreshes update server context
without replacing unsaved fields; accepted saves adopt the returned normalized
values. Client-side read revisions reject responses started before a successful
mutation. This is not a substitute for server-side concurrent-edit versioning:
no new concurrency or authorization API has been added. Ambiguous failures
trigger a read while retaining edits and the error.

Account-save and role-change handlers use one synchronous in-flight guard. Role
failure stays in the confirmation dialog; its Cancel action is initially focused.
Self/protected-account checks are retained in controls and handlers. Account
closure continues to use the existing password/consent workflow and backend
protections. It has not been reimplemented or made less restrictive.

Message review is an explicit toggle, not a reply/resolution state. Successful
PATCH results are protected from pre-write reads until the next post-write read;
errors do not optimistically mark anything reviewed. Results for one message
cannot select a different message after a navigation change. Copy email uses the
browser clipboard only after a click and reports failure with manual-copy
instructions, without claiming a copy succeeded or sending an email.

## Validation and manual review

Automated tests use synthetic data and isolated React/MUI/router/DOM doubles.
They test behavior and structure, not rendered pixels or screen readers. Full
frontend regression tests and type/build checks run in the existing PR CI.

Review on development:

1. Users and Digests at 320/375/768/1440/1920px and with zoom: no page overflow,
   readable long names/emails/topics, consistent statuses, usable filter and
   pagination controls. Confirm empty versus failed versus stale reads.
2. Open a message on page 2, find matching users, open an account, inspect its
   digests/billing, then return through the preserved context. Check copied
   message links and browser Back/Forward, including a missing message ID.
3. Copy email with allowed and denied clipboard access. No reply or account
   association should occur. Review/unreview explicitly and simulate failed and
   repeated requests; preserve content and focus visible feedback appropriately.
4. Edit account name/email, refresh, then simulate a failed save: keep all draft
   fields. Check a successful save, a failed role change and switching accounts
   during an in-flight read. Refreshing signed-in identity is separate from a
   successfully saved profile.
5. Verify admin/super-admin, self, inactive and closing-account states. Check the
   existing closure confirmation without submitting a real closure just for UI
   testing. Keyboard dialogs must trap/restore focus, and errors must be visible.

No backend/schema, permissions, pricing/billing, provider, deployment or database
changes. No bulk actions, impersonation, email sending or live payment tests.
