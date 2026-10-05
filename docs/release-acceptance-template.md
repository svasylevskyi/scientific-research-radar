# Radar release acceptance — operator record

Copy to private notes; don't commit customer records, credentials or private evidence.

Release commit (40 characters): **NOT RECORDED**
Deployment identity evidence (workflow/release record): **NOT CHECKED**
Development origin / Stripe mode / deployment profile: **NOT CHECKED**
Dates / reviewer / browsers / actual mobile device: **NOT RECORDED**
Automated smoke report and omitted scenarios: **NOT CHECKED**

Statuses: NOT CHECKED, BLOCKED, FAIL, MANUAL PASS, AUTOMATED PASS. An automated pass
must name the scenario and release. A skipped or simulated case does not prove the
corresponding real service worked. Preserve existing completed operational evidence
when still applicable; reference the date/version rather than repeat destructive drills.

| ID | Activity and expected result | Status | Evidence / issue |
| --- | --- | --- | --- |
| M01 | Register an ordinary account, verify delivered code, sign in/out; incorrect/expired codes do not grant access. | NOT CHECKED | |
| M02 | Request a password reset; controlled mailbox gets usable link; old password no longer signs in after successful reset. | NOT CHECKED | |
| M03 | Create/edit a digest; required inputs and failed-save values behave correctly; saving does not start research. | NOT CHECKED | |
| M04 | Historical run settings remain read-only after current edits; editor links open at page top; tabs/drafts and Back/Forward retain context. | NOT CHECKED | |
| M05 | Briefing/trends/papers open, supporting references select correct papers within the selected run; original-source links and limitations are accessible. | NOT CHECKED | |
| M06 | Authorize a small budget of fresh real research on dev; progress completes or failure is actionable; inspect relevance, date eligibility, summary basis, claims and attribution. | NOT CHECKED | |
| M07 | Create one short-lived schedule in the intended timezone; verify one occurrence and received briefing email/link; edit/delete it afterwards and confirm no further occurrences. | NOT CHECKED | |
| M08 | Sandbox first payment succeeds; benefits activate only after verified payment; cancelled/failed/authentication-required payments do not grant unverified access. | NOT CHECKED | |
| M09 | Abandon checkout: only matching tier/interval resumes; other selection + popup Cancel keeps old link; confirm replacement expires old link and creates one successor. | NOT CHECKED | |
| M10 | Sandbox same-interval immediate upgrade shows reviewed proration; success/failure follows payment policy without a second subscription. | NOT CHECKED | |
| M11 | Request lower Monthly → higher Yearly at renewal; dates/amount and no-early-benefits are correct. Future renewal/payment recovery remains separate until actually observed. | NOT CHECKED | |
| M12 | Request downgrade; Current plan summary and cancel-request explanation are correct; cancel leaves current subscription, then choose another downgrade target. | NOT CHECKED | |
| M13 | Renewal, failed renewal, interval switch, cancellation and Free fallback tested on controlled sandbox subscriptions; monthly allowance accounting stays separate. Record actual dates or test-clock limitations. | NOT CHECKED | |
| M14 | Submit a test Contact message to a controlled address; admin can review, search matching user, inspect account/research and return; review does not send a reply. | NOT CHECKED | |
| M15 | Ordinary users cannot see another user's digests or admin tools; admin/super-admin protections still hold. Use only accounts you control. | NOT CHECKED | |
| M16 | Check wide/narrow screens, keyboard navigation, dialog focus, long titles and at least a brief screen-reader review. Record browser/device. | NOT CHECKED | |
| M17 | Clean up test schedules and disposable records; resolve sandbox billing attempts/requests as intended. Do not cancel real customers or wipe dev. | NOT CHECKED | |

## Production and commercial readiness — separate evidence, not dev-browser passes

| ID | Check | Status | Evidence / decision |
| --- | --- | --- | --- |
| R01 | Verify deployed production commit, mode, live catalogue/callbacks and webhook processing. No simulated payments/test cards in live mode. | NOT CHECKED | |
| R02 | Verify production alerts reach the operator, backups are recent, recovery instructions and prior restore-drill evidence remain applicable. | NOT CHECKED | |
| R03 | Finalize operator/provider/contact/retention disclosures and paid-service legal documents; obtain relevant professional review. | NOT CHECKED | |
| R04 | Confirm invoicing/tax handling, plan cost assumptions and beta provider spending limits. | NOT CHECKED | |
| R05 | Review representative scientific output and quality/held-run customer policy; neither curated samples nor software tests certify research accuracy. | NOT CHECKED | |
| R06 | Confirm support ownership and handling of bad output, stuck work, failed email/payment and privacy/account requests. | NOT CHECKED | |

Release decision: **NOT APPROVED / APPROVED FOR CONTROLLED BETA / APPROVED FOR PAID LAUNCH**
Open blockers (owner / next action): **NOT RECORDED**
Known accepted limitations and rationale: **NOT RECORDED**
