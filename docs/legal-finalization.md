# About content and legal finalization

Review date: **5 October 2026**. Baseline: merged PR #114,
`e4fed5e5ceb2375c584b6cb74b1ebb21190def09`.

**Status: awaiting operator facts, policy decisions and jurisdiction-specific
review.** This is a preparation record, not legal advice or evidence of compliance.
The public Privacy and Terms pages remain clearly marked as drafts with no
effective date. A draft label does not suspend legal obligations already arising
from account registration, data processing or sales. Do not invite a paid pilot
on the assumption that this content-only update completes legal readiness.

## Implemented now

About is a short, benefit-led guide covering verified registration, Free access,
digests versus individual runs, source navigation, plan-dependent scheduling and
email, recurring billing, monthly allowances, plan changes, cancellation and
account closure. It preserves the centered 800px reading column, public header,
AI limitations and ordinary route links. Prices and quota amounts are not copied
into this page; the published catalogue remains their reference.

The legal drafts no longer claim that subscriptions are merely illustrative or
that self-service closure is unavailable. They now describe the implemented
Stripe data flow, recurring billing, checkout replacement, scheduled changes,
closure and retention boundaries. Refund/withdrawal policy, retention periods,
operator details and an effective date have not been invented. No checkout,
consent, billing, deletion, research or provider configuration is changed.

## Verified product facts and their sources

| Topic | Evidence in this repository | Boundary to retain in the final text |
| --- | --- | --- |
| Registration | [Registration flow](registration-plan-selection.md); `backend/app/services/email_verification_service.py` | Verification creates the Free account; payment is a separate step. Do not restore the obsolete administrator-selected default-plan description. |
| Research | [Run presentation](digest-results-ui.md), [digest scope](digest-page-scope.md), [quality checks](research-quality.md) | Current settings differ from saved run snapshots. Saving is not running. No exhaustive coverage, full-text access, fixed paper yield or scientific-accuracy guarantee. |
| Billing and changes | [Plan selection](plan-selection-ui.md), [scheduled upgrades](scheduled-upgrades.md), [checkout replacement](checkout-replacement.md) | Monthly and Yearly billing are distinct from monthly research allowances. A completed redirect is not payment verification. Cancellation of a requested change is not subscription cancellation. |
| Ending use | [Account closure](account-closure.md); `backend/app/services/account_closure_service.py` | Ordinary paid-renewal cancellation retains access through verified coverage. Closure ends access immediately and starts durable billing/erasure work. No automatic refund or instant erasure from every provider. |
| Support | [Contact messages](contact-messages.md) | Public form messages are stored in the admin inbox. Review is not reply, resolution or a proof of sender identity. |
| Browser storage | `backend/app/api/routes/auth.py`, `backend/app/core/config.py`, `frontend/src/pages/RegisterPage.tsx`, `frontend/src/components/DigestWorkspace.tsx` | Session cookie, verification session storage and history-panel local storage are present. Deployed lifetimes and additional injected scripts still need verification. |

Source code and example environment files do not establish the actual legal
entities, provider contracts, data regions, production log contents or approved
retention policy. Do not publish another business's address or the founder's
personal details without explicit authorization for this service.

## Information required from the operator

Fill these privately first. Only intended public legal disclosures should be
committed. Never supply API keys, passwords, payment-card data or full invoices.

| Input | Details needed |
| --- | --- |
| Operator and contacts | Exact legal/trading name, legal form, registration country, applicable registration/tax identifiers, business postal address, public email for support/complaints/withdrawal and privacy requests, and telephone/contact requirements. Identify a DPO/representative only if appointed or required. |
| Customers and territories | Countries actively served; consumers, organizations or both; sole traders acting outside their professional specialization; minimum age; interface, contract and support languages. Confirm whether an English-only offering is appropriate for the intended market. |
| Commercial policies | Confirm continuous SaaS subscription model; whether any trials/extra purchases are actually offered; immediate service start; voluntary refunds beyond mandatory rights; complaints handling; treatment of failed/held research and service interruptions; any service commitments. A technical usage charge or an absent refund endpoint does not decide a consumer's remedy. |
| Providers and transfers | Actual hosting/database, off-site backup, email, AI/search, payment, DNS/CDN/security, monitoring, analytics and accounting providers. For each: legal entity, purpose, data categories, regions, retention, processor/controller role, contract/DPA and any international-transfer safeguard. OpenAI/Stripe integrations are verified; their account-specific contracts and settings are not. |
| Retention and closure | Approved periods or meaningful criteria for active/inactive accounts, digests/history, feedback, contact messages, security/application logs, auth records, billing/accounting, backups, exports and pseudonymous closure markers. State who executes cleanup and handles provider copies or restored backups. |
| Other uses | Confirm optional analytics, advertising pixels, newsletter/marketing, public customer samples and any broader reuse of customer feedback/content. Define opt-in/permission and withdrawal mechanisms before enabling new uses. Do not infer a training policy or zero retention from a provider's default marketing page. |
| Publication | Intended effective date and document versions; who approves the final wording; customer notification and acceptance procedure for existing accounts and future material changes. |

## Finalization sequence

1. **Complete and approve the facts.** Inventory deployed storage, scripts and
   providers. Map each processing purpose to its lawful basis and review the
   controller's handling of third-party author metadata as well as subscriber data.
2. **Prepare the final document pair.** Keep a concise Privacy notice with a
   provider/retention table; cover paid-service conditions, complaints, statutory
   withdrawal and remedies, IP, reasonable use, ending service and changes in Terms.
   Remove irrelevant regional templates only after the market decision. Have a
   Polish/EU digital-services lawyer review the intended consumer offering; obtain
   accounting input for invoicing, tax and financial retention.
3. **Close operational and interface gaps.** Make sure text matches executable
   processes, not just proposed commitments. The reviewed registration/checkout
   code does not establish versioned Terms acceptance, an early-performance
   request, delivery of the complete contract information on a durable medium, or
   a dedicated statutory withdrawal flow. Check Stripe configuration separately;
   its payment receipt must not be assumed to include all contract information.
   Add any required functionality in a follow-up PR after policy approval.
4. **Publish deliberately.** Version and archive the approved documents, set the
   actual effective date, replace placeholders, update the About draft reference,
   and make both documents available before registration/purchase. Terms
   acknowledgement is distinct from optional marketing/data-use consent; merely
   reading Privacy is not consent. Do not retrospectively record existing users as
   having accepted a new version they have not seen.
5. **Accept the real journey.** Test the final disclosures at registration and
   payment, durable confirmations, cancellation versus withdrawal, complaints,
   privacy/export requests, closure and restoration handling. Record evidence and
   owner sign-off; keep unfinished items blocked rather than marking them passed.

## Legal review points and official references

These identify checks, not conclusions about compliance in every country. Recheck
applicable law at final publication rather than freezing this research date.

- The [European Commission's GDPR obligations guide](https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/obligations_en)
  describes transparent information about purposes, lawful bases, retention and
  rights, including data obtained from other sources. Use it with GDPR Articles
  12–14, 28 and Chapter V when checking the provider/transfer inventory.
- [UOKiK's distance-sale guidance](https://prawakonsumenta.uokik.gov.pl/prawo-do-informacji/sprzedaz-poza-lokalem-i-na-odleglosc/)
  is relevant to pre-contract information, the payment obligation and durable
  contract confirmation. Audit the complete hosted-checkout journey as well as
  Radar's initial Continue to Payment dialog; they are not interchangeable steps.
- [UOKiK on withdrawal periods](https://prawakonsumenta.uokik.gov.pl/prawo-odstapienia-od-umowy/terminy-odstapienie/)
  and [services/digital content](https://prawakonsumenta.uokik.gov.pl/prawo-odstapienia-od-umowy/umowy-szczegolne/)
  explain the general online 14-day period and special conditions. Classify the
  ongoing SaaS/digital service properly. Do not presume an immediate loss of the
  withdrawal right merely because the first AI digest was generated.
- [Directive (EU) 2023/2673](https://eur-lex.europa.eu/eli/dir/2023/2673/oj)
  includes an online withdrawal function beyond financial services. Verify
  national implementation and the markets actually targeted. The Polish
  [government project record](https://www.gov.pl/web/premier/projekt-ustawy-o-zmianie-ustawy-o-prawach-konsumenta-oraz-ustawy-o-konsumenckiej-pozyczce-lombardowej)
  describes proposed implementation, not proof of an enacted obligation. Do not
  confuse a draft bill or an EU implementation deadline with a confirmed Polish
  effective date. Existing Stripe renewal cancellation is not automatically an
  equivalent statutory-withdrawal process.

## Publication gate

| Check | Current status |
| --- | --- |
| Product descriptions aligned with implementation | Updated in this PR; review on development |
| Operator identity, approved contacts, territory/language/age scope | Awaiting operator |
| Deployed provider/data/retention inventory | Awaiting operator and configuration review |
| Withdrawal, refund, complaint and failed/held-run policies | Awaiting decision and legal review |
| Versioned acceptance, durable contract confirmation and withdrawal UI requirements | Audit/follow-up implementation required as applicable |
| Effective date, legal review and final publication | Blocked by the above |

This PR requires no database migration, new package, provider permission or server
configuration change. Tests check truthful copy, route links, accessibility
structure and readable layout; passing them is not legal approval.
