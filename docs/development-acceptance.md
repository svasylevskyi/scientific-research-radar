# Development acceptance and browser smoke tests

This is the bounded first acceptance increment: twelve browser scenarios plus a
manual release checklist. Use the existing HTTPS development deployment. There is
no additional hosted server, database reset, backend test endpoint or production
configuration change. The `acceptance/` Node package is separate from the shipped
frontend and is not copied into either production container.

## What is and is not automated

| ID | Scenario | Writes/evidence |
| --- | --- | --- |
| SC01 | Sample previous/next/dots and dialog keyboard close | Public reading only |
| SC02 | Monthly/Yearly plan tabs, keyboard, responsive layout | No purchase |
| SC03 | About/Contact/legal rendering and protected-page login redirect | No registration/recovery/contact email |
| SC04 | Workspace and ordinary-user rejection from admin UI | Dedicated user; UI access test, not a penetration test |
| SC05 | Digest validation, error focus and free-form topic hint | No save |
| SC06 | Failed-create message and retained inputs | Explicit browser-side simulated 503, not a real backend failure |
| SC07 | Shared current-plan/pending-checkout cards and cancel confirmation | No checkout, resume, preview invoice or renewal write |
| SC08 | Run snapshot, current editor, page-top link and draft retention | Configured saved run; no save |
| SC09 | Supporting-paper link and browser Back/Forward | Configured saved briefing with a resolvable paper link |
| SC10 | Schedule editor date validation and Cancel | No schedule saved/enabled/deleted |
| SC11 | Admin user search/detail/return context | Optional ordinary admin; no account changes |
| SC12 | Create, edit, reload and delete one new digest | Disabled unless explicitly approved twice; no research or schedule |

Each scenario runs at desktop (1440px) and mobile-sized (390px) Chromium widths.
This is not actual mobile-device testing or whole-product end-to-end certification.
Absent fixtures, unavailable allowances and the optional write/admin scenarios are
reported as **NOT CHECKED**, never as successful acceptance. Unexpected missing UI,
request violations or test failures fail the run. No automatic retries; one worker.

## Before running on your Windows PC

1. Check out the test code for the release under review. Install Node 22 or later
   (matching CI is preferable). Record the actual development deployment commit
   from its successful deployment workflow/release record; don't infer it from the
   latest main commit. Avoid deployments during the acceptance run.
2. Confirm the existing dev deployment uses **Stripe sandbox**, and keep production
   separate. Do not change its database mode. For manual execution/delivery checks,
   confirm the deployed worker/scheduler profile: base mode cannot complete runs.
3. Prepare a dedicated verified ordinary user (Free or sandbox-paid) with available
   digest capacity. Use a second sandbox-paid user for manual lifecycle checks as
   needed. Optionally prepare an ordinary admin for SC11. Do not use super-admin or
   complimentary access to represent a subscriber. Keep test records synthetic.
4. For SC08–10, use a digest owned by the configured user with a completed run and
   source links. Copy its digest/run UUIDs from its URL. The suite never imports or
   overwrites samples and never modifies this fixture. A scheduling-capable plan is
   required to check the schedule form. Leave unknown IDs null, not guessed.

From a PowerShell window in the repository:

```powershell
cd acceptance
npm ci
npx playwright install chromium
Copy-Item acceptance.example.json acceptance.local.json
notepad acceptance.local.json
```

Fill `baseURL` and `allowedOrigin` with the **same exact dev HTTPS origin** (no
paths), `releaseCommit` with the deployed full commit, and `userEmail` with the
controlled ordinary test account. Set `adminEmail` and saved fixture IDs only when
available. Keep both boolean flags false initially. The example placeholders are
intentionally rejected. The release SHA is an operator assertion, not a server
attestation; verify it before recording evidence. No API/provider keys are needed.

## Authenticate and run

```powershell
npm run auth -- --role=user
# Optional, only after setting adminEmail:
npm run auth -- --role=admin
npm run list
npm run smoke
```

The auth helper opens a guarded, temporary Chromium browser at the dev login page
and pre-fills only the configured email. Type the password there. It validates the
returned identity/role and writes private session cookies to `.local/`; it does not
save the password, run tracing or contact external origins. An inactive, different
or super-admin account is rejected. Re-authenticate when cookies expire, after a
crash during refresh, or when changing accounts/origins. Don't authenticate again
while a test is running or share these sessions between machines.

For a quick subset or a visible browser:

```powershell
npm run smoke -- --public-only
npm run smoke -- --project=desktop --headed
```

The supported runner locks concurrent operator runs. Following a crash, first make
sure no acceptance process remains, then inspect/remove `.local/run.lock` only if
stale. One worker and no retries avoid collisions on rotated authentication cookies.
Sessions are reused serially per role and updated with the latest cookie state.

### Optional real create/edit/delete check

Set `allowDigestWrites` to true in the local JSON **and** explicitly run:

```powershell
npm run smoke -- --allow-digest-writes --project=desktop
```

Only SC12 may POST one UUID-named `Acceptance smoke ...` digest with maximum papers
set to 1, edit its description and delete that exact newly returned ID. Existing
records, the saved-run fixture, account changes, schedules, payment commands and
research execution remain blocked. After an interrupted create/save/cleanup, inspect
the dedicated account and remove only the newly created smoke digest manually.
An ambiguous create is never blindly repeated; there is no bulk cleanup or lookup-
by-title deletion. The runner never truncates the database or runs backend pytest
against development. Set the write flag back to false afterwards.

## Safeguards and diagnostic privacy

The runner requires an explicitly approved origin, refuses production-looking
hosts and invalid TLS, and requires a direct, anonymous catalogue response positively
reporting Stripe sandbox before opening an authenticated context. Browser request
routing denies unknown API endpoints, all external HTTP origins, redirects and
WebSockets. Service workers are blocked. Only login (in the auth helper), refresh,
allowlisted reads and the narrow SC12 exception are forwarded. Billing refresh is
also blocked because it is a command. Direct Playwright APIRequestContext calls are
not used. These are test-harness safeguards, not a server firewall or proof that the
operator selected the correct environment: confirm the hostname yourself too.

The default suite makes no real application-changing commands other than session
creation/refresh. Normal API reads and pre-existing server background jobs keep their
usual behavior; this harness does not stop the scheduler or erase pending work.
Failed-save injection tests only the UI response, not database transaction handling.

`results/<timestamp>/summary.md` and `results.json` record stable case IDs, viewport,
PASS/FAIL/NOT CHECKED, target and operator-supplied release commit. They do not dump
API responses or error bodies. Detailed diagnostic capture is **off** by default.
Set `captureDiagnostics=true` only for synthetic accounts when needed; traces under
`.local/diagnostics/` can contain authentication headers, cookies and page contents.
Console failure output can also include page text. All sessions, local configuration,
reports and diagnostics are ignored by Git. Keep them private, do not upload them to
public PRs, and delete local sessions/diagnostics after acceptance. Windows users
should keep this folder under their private user profile with appropriate ACLs.

## CI is separate from shared development

The existing frontend CI job runs `npm test`, `npm run check` and `npm run selftest`
inside `acceptance/`. Selftest starts only a loopback static server for the built
frontend, with synthetic anonymous auth/catalogue responses, runs SC01–03's shared
bodies at both widths, and exercises the browser request fence. It creates no
provider objects and contacts neither dev nor prod. The scripts require no secrets.
Passing this validates the tooling/public UI with stubs, **not** the deployed user,
database, payment or research flows. There is no automatic shared-dev acceptance
workflow; run the remote suite yourself. Existing CI selection/gates remain intact.

## Manual release evidence

Copy [the release template](release-acceptance-template.md) outside the public repo
or into your private notes. Fill each result as MANUAL PASS, AUTOMATED PASS (with
scenario/commit), FAIL, NOT CHECKED or BLOCKED. Complete real registration/email,
payment, research delivery and production-specific checks separately. Record bugs,
not passwords, tokens or private digest content. A passing smoke report alone is
not release approval and does not certify source correctness, legal compliance,
plan economics or product-market fit.

Primary tooling references: [configuration](https://playwright.dev/docs/test-configuration),
[authentication](https://playwright.dev/docs/auth), [request routing](https://playwright.dev/docs/network).
