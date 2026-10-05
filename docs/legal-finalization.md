# Legal finalization: confirmed facts and remaining publication gates

Review updated: **5 October 2026**. Baseline: merged PR #115,
`ea1cecf8c2d2c333b9cdd109005dabbac404695f`.

**Status: operator facts partly confirmed; not approved for final publication.**
Privacy and Terms remain English review drafts without an effective date. This
record distinguishes the operator's instructions, repository evidence and legal
review work. A draft warning does not suspend obligations arising from actual
processing or sales. Passing tests is not legal approval.

## Confirmed by the operator

| Item | Confirmed instruction | How the pages use it |
| --- | --- | --- |
| Provider | Existing Polish sole proprietorship (jednoosobowa działalność gospodarcza) | Do not describe Radar as a limited company or separate legal person. |
| Requested name | Scientific Research Radar | Service/trading name, pending the **exact CEIDG legal name including first name and surname**. Do not infer or publish the proprietor's legal name from a profile, GitHub account or tax lookup. |
| NIP | 8992779679 | Published exactly as supplied. This is not a CEIDG/VAT-registration or ownership verification. |
| Postal address | PO Box 12345; 52-229 Wrocław; Poland | Labelled **correspondence address supplied by the operator**, not a verified geographic business address. Confirm it is real and usable, and obtain the publishable geographic business/complaints address and business telephone. |
| Contact | support@getresearchradar.com | Accessible mailto links for support, complaints, withdrawal/refunds, privacy and legal notices. No account required. Verify the mailbox receives external mail and someone handles it. |
| Audience/markets | Individual consumers throughout Europe initially; possible US/Canada/global expansion | Do not claim worldwide availability or compliance; assess actively targeted jurisdictions before expanding. |
| Language | English only for now | Retain English; do not silently add translations or claim English alone satisfies every consumer-information rule. |
| Age | No blanket 18+ restriction desired | Remove the old adults-only proposal. **This is not approval of unrestricted child accounts.** Child/guardian, contract-capacity and provider safeguards remain unresolved; no age-verification feature is added. |
| Refunds | Manual, outside Radar, through support | No automatic refund endpoint, no blanket refusal, no invented voluntary guarantee. Existing Stripe Dashboard handling remains the operational path. Mandatory remedies and deadlines take precedence. |
| Unusable/held research | Individual review and manual proposed resolution | No automatic refund, allowance credit or universal compensation amount is promised. |
| Content reuse | Only to deliver the requested service | No private customer-content reuse for public marketing samples or own-model training. Operation/support of the requested service and legally necessary processing remain described; no unsupported promise about external-provider settings. |
| Analytics/marketing | Google Analytics planned next; newsletters/marketing later | Future plans, **not enabled by this PR and not consented to by registration**. Add disclosures and any required consent/withdrawal controls before enabling. |
| Advisers/publication | External lawyer and accountant available; launch as soon as practical, no date set | Supply this review pack to those advisers. Do not invent an effective date or claim their approval. |

## Verified implementation boundaries

Registration creates Free access after email verification; paid access is a
separate verified-billing workflow. Research settings, run snapshots and outputs
remain distinct. Manual and scheduled runs use plan allowances. Monthly/Yearly
billing is distinct from monthly allowance resets. Existing change, cancellation
and checkout-replacement rules remain unchanged.

Sources: [registration](registration-plan-selection.md),
[digest scope](digest-page-scope.md), [research quality](research-quality.md),
[scheduled upgrades](scheduled-upgrades.md),
[checkout replacement](checkout-replacement.md),
[account closure](account-closure.md), and [backups](offsite-backups.md).

The operator describes closure as immediate removal of related information. The
code supports **immediate loss of access**, but not instantaneous erasure in every
case. `backend/app/services/account_closure_service.py` revokes sessions, waits
for active work, redacts/deletes owned live data and retains a non-login technical
tombstone. Billing and anonymous-contact ownership issues can require review.
This distinction is preserved in the public notice, not silently replaced by an
absolute deletion promise. An inactive technical marker is not a usable dormant
customer account. There is no approved automatic inactivity-deletion policy.

Off-site snapshots contain earlier personal data until expiration. The recovery
process reapplies cumulative closure identifiers and checks erasure **before
public access**. This prevents resurrection, not instantaneous rewriting of all
backup generations. Application deletion does not erase Stripe, AI/email-provider,
external support-mailbox, financial, log or exported records.

No product processing, erasure worker, refund API, consent record, provider setting
or monitoring payload is changed by this content PR.

## Provider and transfer register — confirm against actual accounts

Names/uses below are operator-confirmed; legal entities, country/region settings,
contracts and retention are **not yet verified**. Code and provider marketing
pages cannot attest to this particular deployment's contractual settings.

| Provider | Function/data to inventory | Remaining evidence |
| --- | --- | --- |
| Hetzner | App/database, stored account/research data, infrastructure logs | Contracting entity, actual server/database/backup regions, DPA and log settings. |
| Cloudflare R2 Object Storage | Encrypted recovery bundles, closure manifests | Actual bucket jurisdiction, account entity/DPA, access control, Restic retention and pruning, independent manifest lifetime. The guide's EU-bucket example is not proof of production settings. Do not expire arbitrary Restic objects with generic R2 lifecycle rules. |
| Resend | Recipient addresses, transactional email bodies, delivery records | Contract/entity, processing and subprocessor countries, DPA/transfer mechanism, retention and deletion, open/click tracking configuration. |
| UptimeRobot | Monitored URLs, uptime results and alert data | Actual URLs/response content collected, alert destinations, retention, entity/locations/contract. |
| Healthchecks.io | Heartbeats, job-health results and alert metadata | Actual ping payloads/log output and retained fields, alert destinations, retention, entity/locations/contract. Avoid customer identifiers and digest text in monitoring payloads; verify rather than claim this is already enforced. |
| OpenAI and research/search services | Digest input, relevant history/feedback, paper evidence, generated output, optional quality-review evidence | Actual entity/DPA, API region, endpoint storage, training/data-sharing settings, retention controls, subprocessors and search tools. Do not infer zero retention or EU-only processing from a default policy. |
| Stripe | Customer/payment/billing details, IDs, statuses, refunds, disputes | Entity and controller/processor roles, financial retention, transfers, portal/checkout/receipt configuration. Radar does not hold full card numbers/CVC. |
| Support mailbox and professional advisers | Email outside Radar, refund/complaint/privacy case files, necessary financial/legal records | Confirm where the inbox is hosted; **Resend as sending provider does not establish inbound-mail hosting**. Confirm accountant/lawyer disclosures, roles, secure access, retention and agreements. |

If DNS/CDN/security or a provider-installed script adds another recipient, add it
before claiming the register is complete. No Google Analytics or advertising tags
are introduced here. The inventory must include deployed scripts outside Git.

## Retention worksheet — requires approved periods and enforcement

The operator approved the Radar-controlled technical retention policy on
**5 October 2026**. The periods below are now implementation requirements.
Statutory/accounting/provider records remain subject to adviser and provider rules;
the technical policy must not be presented as overriding those obligations.

| Data | Current implementation / known handling | Decision and action needed |
| --- | --- | --- |
| Unverified registrations | 24-hour attempt expiry; cleanup processing removes expired attempts | Verify worker cadence; include backups/provider mail copies separately. Expiry is not proof all copies vanished at exactly 24 hours. |
| Open accounts, digests, history, feedback | Retained for ongoing use; closure deletes owned live data | Approved: no inactivity expiry. Keep while the account remains open unless the user deletes data. |
| Active closure | Sessions revoked immediately; outstanding work/billing/ownership review can delay completion | Assign an owner and review cadence for stuck closures; document exceptions and follow-up. |
| Closure notice address | Removed after successful completion notice or seven days after request | Confirm this technical limit in the final notice and support handoff. |
| Closure recovery manifests | Minimal account IDs and request dates prevent restoration from reviving closed accounts | Approved: 65-day marker window (35-day backup retention plus 30-day safety margin). Live inactive-account guards remain so closure cannot be reversed. |
| Contact form and external support messages | Owned contact rows deleted with closure; anonymous/shared references need ownership review; mailbox copies are separate | Approved ordinary in-app retention: 12 months after review. Admin retention hold excludes complaint/refund/privacy/dispute cases from automatic deletion. External mailbox/legal-case periods remain adviser-controlled. |
| Security/application/monitoring logs | Radar host operational files and Docker local-driver logs | Approved: host operational logs use 30 daily rotations. Container logs remain size-bounded at 3 × 10 MB per container and can expire sooner under volume; confirm any provider-side monitoring history separately. |
| Backups and exported bundles | Local dumps already expire after 7 days; recovery reapplies closure evidence | Approved: off-site database snapshots 35 days; closure checkpoints 65 days. Retention runs separately with Restic forget/prune and its own monitoring. Decrypted restore-drill copies remain delete-after-review artifacts. |
| Stripe, invoices, accounting and disputes | Outside Radar's live-data eraser; external financial records remain | Accountant/lawyer specifies statutory trigger, period, any hold and eventual disposal; no fictional all-data erasure. |
| Other provider copies | Subject to actual service settings and contracts | Verify retention, deletion/export capability and rights-request routing. |

## Manual procedures that can operate without a new feature

**Refunds and service problems:** receive requests at the support address, record
receipt and the applicable deadline privately, identify the transaction or run
proportionately, and assess mandatory remedies before discretionary goodwill.
For an approved refund, use the appropriate Stripe Dashboard mode, check earlier
refunds/disputes to avoid duplicates, and verify the final result before notifying
the customer. No password/CVC/full card number is needed. Record manual allowance
or service resolutions only if actually performed; do not change accounting by
unreviewed database edits. A legal entitlement must not become discretionary
because its implementation is manual. No voluntary response-time SLA is approved.

**Privacy requests:** the same inbox can receive access, correction, portability,
erasure, objection or restriction requests without sign-in. Record receipt,
applicable legal deadline and proportionate identity verification; locate live,
provider, backup and mailbox records; disclose any lawful retention exceptions;
provide a secure response. GDPR Article 12 generally requires a response without
undue delay and within one month, with an explained extension where law permits.
Assign ownership and access for this procedure rather than claiming a new
self-service export tool. Do not ask for excessive identity documents by default.

**Consumer withdrawal:** an unambiguous email can notify withdrawal, and the
public draft includes optional example wording. It is not the complete reviewed
statutory model form or proof of an implemented online withdrawal function.
Review the service classification, normal 14-day online withdrawal period,
extended periods for missing disclosures, any early-performance request, lawful
proportional charges, refund timing and digital-service conformity rights with
the lawyer. Do not infer a waiver from using the first digest. A case review,
ordinary Stripe renewal cancellation or account closure cannot replace a legally
required withdrawal route. Manual processing does not suspend statutory deadlines.

## Decisions still blocking final publication

1. **Exact legal identity and contact details.** Request the full registered CEIDG
   name (including the proprietor's first name and surname), a geographic
   business/complaints address suitable for publication, and a business telephone.
   Confirm the supplied PO box is usable correspondence, not sample text. Do not
   publish a guessed home address or infer identity from NIP.
2. **Younger users.** Confirm which ages are intended, especially under 16 and
   under 13. Lawyer review must distinguish contract capacity from consent-based
   child-data rules; GDPR Article 8 applies specifically to consent-based online
   services, not an automatic 16+ rule for every processing activity. Review
   parental authorisation, age-appropriate design and verification proportionate
   to the risk. OpenAI's under-18 API guidance calls for safeguards and says not to
   process personal data of under-13s or those below the applicable digital-consent
   age without implementing zero data retention. Actual endpoint eligibility and
   settings are not verified here. Parental wording alone is not implementation.
   **No automatic 18+ restriction, DOB collection or consent claim is added.**
3. **Retention/providers.** Approve the worksheet, actual regions/contracts and
   the person running the privacy procedure. Legal necessity and technical expiry
   must be reconciled, not treated as interchangeable.
4. **Consumer-market requirements.** English remains the chosen product language,
   but Polish consumer transactions may require Polish information/documents under
   the Polish Language Act; the intended all-Europe audience also includes
   different national requirements. Ask the lawyer to scope actual initial
   countries and any translations. Do not silently claim availability or
   compliance everywhere, or impose foreign courts/arbitration.
5. **Purchase journey and effective publication.** Audit/version Terms acceptance,
   pre-contract information, service-start request where relevant, complete durable
   contract confirmation and withdrawal instructions/function. A Stripe receipt
   alone is not evidence all required disclosures are delivered. Determine the
   actual national effect of online-withdrawal-function legislation for the
   countries served. Once gaps are resolved and adviser approval obtained, set an
   effective date, archive the approved versions and notify existing users without
   fabricating retrospective acceptance.

## Official review sources (checked 5 October 2026)

These are legal-review inputs, **not a compliance certification** or proof of
account-specific settings. Recheck enacted/current provisions at publication.

- [Biznes.gov.pl — choosing a sole trader's name](https://biznes.gov.pl/pl/portal/00120):
  a CEIDG name must include first name and surname; service branding is additional.
- [UOKiK — distance-sale information](https://prawakonsumenta.uokik.gov.pl/prawo-do-informacji/sprzedaz-poza-lokalem-i-na-odleglosc/)
  and [contact requirements](https://prawakonsumenta.uokik.gov.pl/pytania-i-odpowiedzi/prawo-do-informacji/):
  identity, business address, email/telephone, payment commitment and contract confirmation.
- [UOKiK — withdrawal periods](https://prawakonsumenta.uokik.gov.pl/prawo-odstapienia-od-umowy/terminy-odstapienie/)
  and [service/digital-content rules](https://prawakonsumenta.uokik.gov.pl/prawo-odstapienia-od-umowy/umowy-szczegolne/):
  applicable periods and conditions; an AI generation is not itself a waiver.
- [UODO — retention criteria](https://uodo.gov.pl/pl/676/4260): specify justified
  periods or meaningful category-specific criteria, not an unlimited generic phrase.
- [GDPR](https://eur-lex.europa.eu/eli/reg/2016/679/oj): Articles 5–8, 12–14,
  15–22, 28 and Chapter V cover principles/bases, child consent, notices/rights,
  processors and international transfers.
- [OpenAI — under-18 API guidance](https://developers.openai.com/api/docs/guides/safety-checks/under-18-api-guidance):
  minor-specific safeguards and zero-retention conditions; not account verification.
- [Polish Language Act, consolidated text](https://eli.gov.pl/eli/DU/2026/81/ogl):
  lawyer to review Articles 7–8 for Polish consumers and the actual contracting setup.
- [Directive (EU) 2023/2673](https://eur-lex.europa.eu/eli/dir/2023/2673/oj):
  review enacted national requirements for online withdrawal, not just the EU
  implementation deadline or the older Polish government proposal. Ordinary
  cancellation of renewal is not automatically an equivalent withdrawal function.

## Publication status and acceptance

| Check | Status |
| --- | --- |
| Supplied service name, NIP, correspondence address and email | Included; legal-name/geographic-address/telephone verification remains open |
| Provider names and functions | Included; entity, regions, contracts, payloads and retention still unverified |
| Manual refunds, individual research review, no unrelated private-content reuse | Reflected without changing billing or granting an invented voluntary policy |
| No blanket 18+ restriction; English consumer service | Reflected as intended scope, not proof of compliant child onboarding or sufficient contract language |
| Retention/closure/restoration boundaries | Grounded in implementation; approved retention periods and procedures still required |
| Analytics and marketing | Future only; not installed or consented to by this PR |
| Adviser review, transaction disclosures and effective date | **Not complete; final publication blocked** |

Check About, Privacy and Terms signed out and on narrow screens. Verify email
links open a draft addressed to the supplied support mailbox, the PO box is not
labelled registered/business address, the warning remains visible, and cancellation
is not confused with a refund or complete provider erasure. No backend migration,
server setting, subscription rule or provider permission changes are required.
