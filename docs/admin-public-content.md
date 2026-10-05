# Admin-managed public content

About, Privacy and Terms can be published from **Admin → Site content** without an
application redeploy. Only the super-admin can publish; ordinary admins may read
the versioned API but the page is not exposed in their navigation.

## Storage and publishing

The application stores append-only revisions in `public_content_revisions`.
Until a page has its first saved revision, the public website uses the built-in
copy shipped with the frontend. The editor starts from that same built-in copy.
**Save & publish** creates the next immutable revision and the public page begins
using it on its next read.

Publishing is immediate. There is no draft workflow in this increment. The
required change note is stored with the publishing administrator and timestamp
for audit. Optimistic concurrency rejects a save if another revision was
published after the editor was opened.

API:

- `GET /api/v1/content/{about|privacy|terms}` — anonymous current override, or
  JSON `null` while the built-in copy is active.
- `GET /api/v1/admin/content-pages/{slug}` — current saved revision for admins.
- `GET /api/v1/admin/content-pages/{slug}/history` — append-only revision
  history for admins.
- `PUT /api/v1/admin/content-pages/{slug}` — publish the next revision;
  super-admin only and requires `expected_revision`.

## Formatting

The editor intentionally uses a constrained Markdown-like format rather than a
rich-text editor. Supported blocks are headings, paragraphs, unordered and
numbered lists, and quoted notes. Inline **bold** and links are supported.
Internal `/paths`, `mailto:` links, and HTTP(S) URLs are accepted.

Raw HTML is never interpreted. Unsupported or unsafe link targets render as
plain text. The public renderer produces semantic headings/lists and does not
use `dangerouslySetInnerHTML`.

## Legal-document boundary

Version history is an audit aid, not legal approval. Publishing Terms or Privacy
does not by itself notify customers, collect renewed acceptance, satisfy a
durable-medium confirmation requirement, or implement a statutory withdrawal
flow. Those obligations remain separate launch checks.

When the legal review is complete, publish the approved text from this screen
with a clear change note and effective/version date in the document content.
Keep adviser-approved copies outside the application as the authoritative legal
record as well.
