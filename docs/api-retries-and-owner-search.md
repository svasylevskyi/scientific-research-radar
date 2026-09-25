# Temporary API throttling and digest owner search

## Silent retry behavior

The shared browser API client waits and retries temporary HTTP 429 responses for
initial loads, background refreshes, session refreshes, and explicitly submitted
actions. It keeps the original request pending, so loading indicators remain active
and previously displayed data is retained. It does not emit rate-limit alerts or
application console messages.

The client honors `Retry-After` (seconds or HTTP date), adds a small random delay,
and uses exponential backoff up to 30 seconds when retry guidance is missing or
invalid. Retries continue until the response changes or the request is cancelled.
They do not weaken server rate limits. Genuine validation, access, network, and
server errors retain their existing handling; ambiguous failed writes are not
automatically replayed.

`X-Radar-Rate-Limit-Scope: global` marks shared API IP/user limits. It pauses the
tab's API requests together and staggers recovery to avoid another burst. Other
limits pause requests to the affected method/path, without blocking unrelated
reads. Coordination is per browser tab; server enforcement remains shared across
tabs and clients. These headers and `Retry-After` are exposed through CORS.

Resend-code cooldowns include a retry deadline. Exhausted verification challenges
include `X-Radar-Retryable: false`, because retrying cannot repair them; their
actionable validation message remains visible. Subscription allowance denials
also retain their existing handling.

Requests keep the same serialized body across a rejected retry. Sign-out/session
replacement cancels pending requests from the previous session. Calls may also
supply an AbortSignal; the owner search cancels requests when the input changes or
the page unmounts.

Browser-controlled HTTP diagnostics may still show a 429 in DevTools Console or
Network. Application code cannot reliably suppress those native browser entries;
the API continues to return truthful HTTP statuses. No console monkey-patching,
HTTP-success masking, or rate-limit bypass is used.

## Digest owner filter

Admin Digest management accepts name/email text instead of loading a fixed user
dropdown. After three trimmed characters and a 300 ms pause, it requests up to
five accessible owners sorted by name, then email and ID for stable ties. Matches
are case-insensitive substrings; `%` and `_` are treated as literal characters.
Suggestions query the full accessible population, not the first page of users.

Choose an owner for an exact `owner_id` filter. Choose the final **Search all owners
matching…** option, or press Enter, to apply `owner_query` to the digest list.
The latter matches either the owner's full name or email before calculating the
total and applying pagination. Clear the field to remove the filter. Both filters
are represented in the URL, and changed filters start on page one.

The existing restriction on ordinary admins viewing super-admin users/digests
applies to suggestions, matches, and totals. The user-list API's optional
`sort=name` parameter leaves its default recent-first ordering unchanged.

Deploy normally. No migration or new environment variables are required.

The owner field includes a search icon and a Search button. Its placeholder is
“Digest owner” and helper text is “Search name or email”. Search applies the
current text to all matching owners, just like Enter or the final suggestion.
Selecting a suggested user still applies an exact-owner filter.
