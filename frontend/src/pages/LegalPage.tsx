import { Alert, Box, Container, Link, Stack, Typography } from "@mui/material";
import { useEffect } from "react";
import { Link as RouterLink } from "react-router-dom";
import { MarketingHeader } from "../components/MarketingHeader";

interface Section { title: string; paragraphs: string[] }

const privacy: Section[] = [
  { title: "Who is responsible for your information", paragraphs: [
    "Scientific Research Radar helps you discover and understand scientific research. This notice covers accounts, research digests, generated results, feedback, and related service communications.",
    "Operator and data controller: [legal name]. Registered address: [postal address and country]. Privacy contact: [monitored email address]. Representative or data protection officer, where required: [details]. These placeholders must be completed before this notice becomes effective.",
  ] },
  { title: "Information we process", paragraphs: [
    "Account information includes your name, email address, password hash, account role, and session and email-verification records. Verification emails are sent to the address you provide. Please keep your credentials private.",
    "Research information includes digest topics, descriptions, keywords, audience and reporting preferences, generated briefings and paper summaries, run status and errors, historical input snapshots, and optional feedback. Research interests can reveal personal information. Do not enter confidential material or sensitive personal information about yourself or others.",
    "Technical information includes request and service-operation records needed to diagnose failures and protect access. Hosting and email providers may process connection and delivery information. Before launch, the operator must confirm the deployed logging fields, including any IP addresses, device information, and retention periods.",
    "Billing information includes the selected plan and revision, billing interval, Stripe customer, checkout, subscription and invoice identifiers, payment and renewal status, requested plan changes, and usage records. Stripe collects payment details through its hosted pages; Radar does not collect or store full payment-card numbers or security codes.",
    "Paper metadata and research evidence come from public or otherwise accessible third-party sources and may include author names and affiliations. Contact submissions include the name, email address and message you provide, a receipt time, and review status. Messages are stored in the application for administrators to review; marking one Reviewed does not send a reply.",
  ] },
  { title: "How and why information is used", paragraphs: [
    "We use account information to provide access, verify email addresses, recover access, and maintain or close your account. Billing and usage information supports purchases, recurring subscriptions, allowance enforcement, payment reconciliation, and requested plan changes. We use your digest settings to generate the research results you request, retain results for your history, and use relevant previous results and feedback to focus subsequent runs.",
    "Where a lawful basis is required, processing necessary to provide the service you request is based on performance of a contract or steps taken at your request before a contract. Security and troubleshooting may rely on legitimate interests, subject to a balancing assessment. Compliance with binding legal duties relies on legal obligation. Optional activities requiring consent must obtain it separately; reading this notice does not constitute consent.",
    "Before publication, the operator must verify this purpose-to-basis mapping against actual operations and document any additional uses. Research rankings personalize information; they are not intended to make decisions with legal or similarly significant effects about you.",
  ] },
  { title: "AI processing and service providers", paragraphs: [
    "When a manual or scheduled research run executes, digest settings, relevant historical context, feedback, and available paper evidence are supplied to OpenAI to generate results. Authorized quality-review operations may also process research evidence and generated output. The workflow may perform web searches, and research queries may therefore be processed by search providers. Information entered into free-text fields may be included in this processing. Avoid including secrets or unnecessary personal information.",
    "Stripe supports checkout, subscription billing, invoice and payment-status handling, and the customer billing portal. Providers supporting hosting, data storage, backups, AI processing, and email delivery receive information needed for their functions. Authorized administrators can review accounts, digests, runs, and feedback for service administration. Information may also be disclosed when legally required or necessary to address fraud or security incidents, subject to applicable law.",
    "Provider register to complete before launch: [legal entities, services, processing locations, retention, contractual safeguards, and applicable AI data-use settings]. This draft does not promise zero provider retention or a particular model-training policy. Those statements must be checked against the actual contracts and configuration.",
  ] },
  { title: "Cookies and browser storage", paragraphs: [
    "The application uses a session cookie to support sign-in, session storage to resume an email-verification attempt, and local storage to remember whether your run-history panel is collapsed. Clearing or blocking this storage can affect those functions.",
    "This application draft does not introduce advertising or optional analytics trackers. The operator must inventory any trackers added by the deployed website or its providers and obtain consent where required before enabling non-essential storage. Browser-storage durations and cookie settings must be confirmed before launch.",
  ] },
  { title: "Retention and international transfers", paragraphs: [
    "Unconfirmed registration attempts expire after 24 hours and are removed by cleanup processing. An expired attempt cannot be used to create an account. Confirmed account data, research history, and feedback are stored to support ongoing use; a complete retention and deletion schedule has not yet been established.",
    "Profile → Close account immediately ends access and revokes sessions. The closure workflow stops new work, resolves attached billing, and removes account-owned live data once active work and required reviews permit. A minimal pseudonymous closure record remains to prevent a restored backup or late event from reactivating the account. Shared paper metadata may remain. This is not an instant erase-everywhere operation.",
    "Account closure does not itself erase Stripe records, information already sent to AI or email providers, logs, backups, or exported files. These require separate retention and privacy-request handling. Before launch, specify retention periods or meaningful criteria for accounts, closure records, deleted digests, historical snapshots, logs, verification records, backups, and provider copies. Editing or deleting an item in the interface should not be interpreted as immediate erasure from every historical record or backup.",
    "Information may be processed outside your country. Where transfer restrictions apply, the operator must establish an appropriate legal mechanism, such as an applicable adequacy decision or approved contractual safeguards, and any required supplementary measures. Processing countries and a way to obtain information about safeguards must be added before publication.",
  ] },
  { title: "Your choices and privacy rights", paragraphs: [
    "You can update profile information, manage digests, and choose whether to provide feedback. Subject to your location and applicable law, you may also have rights to access, correct, delete, or receive a portable copy of personal information; restrict or object to processing; and withdraw consent without affecting earlier lawful processing. These rights can have exceptions.",
    "Use Profile → Close account for self-service closure. Use the Contact form or [monitored privacy email to be confirmed] for access, correction, portability, erasure, or other privacy requests, including when you cannot sign in. No self-service data-export tool is currently offered; the operator must establish the response and export procedure before final publication. Proportionate identity verification may be needed. Requests should be handled within the applicable legal deadlines.",
    "Where applicable, residents of US states may have additional rights to opt out of sale, sharing for cross-context advertising, targeted advertising, or certain profiling, and to appeal a denied request. Authorized-agent and recognized opt-out-signal requirements may also apply. The operator must confirm applicability and actual data practices before publishing the required regional disclosures. Exercising applicable rights must not result in unlawful discrimination.",
    "You may complain to the privacy regulator with jurisdiction over your matter. In the EEA or UK, this may include the supervisory authority where you live or work or where the alleged infringement occurred. Other local privacy and consumer protections continue to apply.",
  ] },
  { title: "Security, children, and changes", paragraphs: [
    "The application uses password hashing and access controls, but no service can guarantee complete security. The operator must maintain appropriate safeguards and respond to incidents and notification duties under applicable law.",
    "The proposed service is intended for adults and is not directed to children. Contact [privacy contact] if a child has supplied personal information. Age eligibility, verification where necessary, and a response procedure must be finalized before launch.",
    "The effective notice will identify its revision date. Material changes require appropriate notice, and new processing requiring consent must obtain that consent before it begins. Contact details and an effective date remain to be completed.",
  ] },
];

const terms: Section[] = [
  { title: "The service and its operator", paragraphs: [
    "These review-draft Terms describe Scientific Research Radar, an AI-assisted service for discovering papers, assessing relevance, summarizing findings, exploring trends, and keeping research briefings and feedback.",
    "Service provider: [legal name, registration details, postal address, and country]. Support and legal notices: [monitored contact email]. Effective date: [to be set]. This review draft is not a finalized agreement or a substitute for the disclosures and acceptance process required at launch.",
  ] },
  { title: "Eligibility and your account", paragraphs: [
    "The proposed service is for adults who can enter into a binding agreement under the law applicable to them. If acting for an organization, you must have authority to do so. Provide accurate account information and maintain an email address you can access.",
    "Keep your password and verification codes secure. Do not share access in a way that compromises another person's data. Report suspected unauthorized access through the support contact once established. Registration and email changes require email verification. Verified registration starts on Free; continuing on Free does not require a payment card. A paid selection uses a separate payment confirmation.",
  ] },
  { title: "Research results and their limitations", paragraphs: [
    "AI-generated results can contain incorrect citations, incomplete coverage, outdated information, biased rankings, or mistaken interpretations. Relevance scores and trend descriptions are analytical aids, not measurements of scientific truth. Some papers may be preprints or may later be corrected or retracted.",
    "Check original sources, publication status, methodology, and limitations before relying on a result. Radar is not a substitute for professional medical, legal, financial, or other specialist advice, and should not be the sole basis for safety-critical or other consequential decisions. Sources may be unavailable or require independent access rights.",
    "A digest saves your research preferences; each run records its own settings and results. Editing the current digest does not rewrite previous runs. Saving preferences does not start a manual run or cancel an existing schedule. Runs start when requested manually or through a saved schedule and may fail or return no relevant results. Completed scheduled runs may be emailed to your profile address when email delivery is enabled. Stored history and feedback may influence later runs; substantially changing a topic can reduce continuity.",
  ] },
  { title: "Your content and intellectual property", paragraphs: [
    "You retain any rights you hold in the content you submit. You must have the rights and permissions needed to provide it. You authorize processing, storage, and transmission of that content as reasonably necessary to deliver the requested service, including processing by service providers and using feedback in subsequent runs. Personal-information processing is described in the Privacy notice.",
    "Original papers, abstracts, images, and other third-party materials remain subject to their owners' rights and source terms. A citation, public link, or AI summary does not grant a license to reproduce or redistribute the underlying work. Preserve attribution and observe applicable permissions and restrictions.",
    "You may use generated briefings subject to applicable law and third-party rights. We do not guarantee that outputs are unique, copyrightable, or free of third-party claims. Rights in the Radar software and branding are not transferred to you. Report suspected infringement to [rights contact], identifying the material, its location, your interest, and the reason for your concern.",
  ] },
  { title: "Acceptable use", paragraphs: [
    "Do not use Radar for unlawful activity, harassment, impersonation, infringement, or unauthorized processing of personal information. Do not submit malware, attempt to obtain another user's data, bypass access or usage controls, interfere with the service, or use prompts to extract confidential system information.",
    "Do not submit confidential documents or sensitive personal information without appropriate authority and safeguards. Follow documented API and usage limits. Access to a source through Radar does not authorize bypassing paywalls, authentication, or other source restrictions.",
  ] },
  { title: "Plans, payment, and renewal", paragraphs: [
    "Subscription Plans displays the published plan prices, included features, and allowances. The service supports Free access and paid subscriptions through Stripe. Paid subscriptions renew automatically at the selected Monthly or Yearly interval unless cancelled. Review the recurring price and any immediate charge in the applicable payment or change confirmation before proceeding.",
    "Research allowances reset monthly, including on Yearly plans. Manual runs use the total monthly run allowance as well as any manual-run limit. Saved-digest capacity is separate from monthly consumption. Subscription and usage shows the applicable limits, remaining usage, payment state, and renewal or paid-access end date. A plan's maximum paper count is not a guarantee of that many relevant papers.",
    "Selecting a plan, opening checkout, or returning from a Stripe page is not proof of payment. Paid access depends on verified billing evidence; missing or failed payment can restrict access. An unfinished initial purchase can be resumed for its saved plan and interval. Confirming a different eligible purchase replaces an open checkout only after the previous session is verified as expired; completed or processing payments must first be reconciled.",
    "Eligible upgrades can take effect after a prorated payment or at renewal. Combined plan and billing-interval upgrades can be scheduled at renewal. Paid downgrades and billing-interval switches use the available renewal-change flow. Confirmations show the reviewed price, effective date, and any reduced capacity. A pending change can be cancelled while that action remains available; confirmation keeps the existing plan and interval and is required before choosing a different target.",
    "To stop paid renewal, use Subscription and usage → Billing and invoices and complete the cancellation flow. Ordinary cancellation keeps verified paid access through its displayed end date, after which Free limits apply. Saved research is retained while the account remains open, but incompatible schedules pause. Deleting a digest or schedule, or simply not using Radar, does not cancel a paid subscription.",
  ] },
  { title: "Withdrawal, refunds, and complaints", paragraphs: [
    "Ordinary renewal cancellation, cancellation of a requested plan change, and account closure are different actions. None waives any mandatory consumer withdrawal, refund, or remedy rights. Account closure does not automatically issue a refund, and no blanket no-refund rule is imposed by this draft.",
    "Use the Contact form or [support email to be confirmed] to report a service or billing problem or request a refund or withdrawal. Include enough information to identify the account or invoice, but never include a password, verification code, or full payment-card details. Refunds require review and are processed through Stripe; a request or a pending refund is not confirmation of a completed refund.",
    "Before these Terms become final, the operator must supply the applicable withdrawal instructions and form, complaint procedure and response deadlines, rules for starting service during a withdrawal period, and any additional voluntary refund policy. These must match the countries and customers served and the actual ordering and confirmation process. Any legally permitted exception requires the applicable disclosures and express consent; using an AI feature does not by itself establish a waiver.",
  ] },
  { title: "Availability, suspension, and ending use", paragraphs: [
    "Service can be interrupted by maintenance, provider failures, or technical limitations. Planned research start times do not guarantee a completion or email-delivery time. There is no promised response time, uninterrupted availability, or guaranteed research outcome in this draft.",
    "Access may be restricted where reasonably necessary to investigate abuse, protect users, or comply with law. Where practicable and lawful, the operator should provide reasons, notice, and a way to challenge an error through support. Mandatory paid-service rights cannot be removed by this provision.",
    "You can request account closure through Profile → Close account using your current password and explicit confirmation. Closure ends access immediately, cannot be undone, and starts billing resolution and removal of account-owned data. Already-started provider work or payments may still need resolution. Closure is not the same as keeping paid access until renewal, does not itself refund payments, and does not erase all provider records or backups. Privacy requests can also be submitted through Contact; data handling and retention boundaries are described in the Privacy notice.",
  ] },
  { title: "Responsibility and rights that cannot be excluded", paragraphs: [
    "The service is offered as a research aid, with the limitations described above. To the extent permitted by applicable law, no additional promise is made about the completeness or suitability of results for a particular purpose. This does not remove a statutory warranty or a duty that cannot lawfully be excluded.",
    "Nothing in these Terms excludes or limits responsibility for fraud, intentional misconduct, death or personal injury caused by negligence where exclusion is prohibited, or any other liability that applicable law does not allow to be limited. No universal monetary liability cap is set in this draft; any future limitation must be assessed for the markets served and stated clearly.",
  ] },
  { title: "Local law, disputes, and changes", paragraphs: [
    "Mandatory rights under the law applicable to you take priority over conflicting wording here. Consumers retain any rights to bring proceedings in a competent local court or contact a regulator. This draft does not require arbitration, waive collective-action rights, or impose an exclusive foreign court.",
    "Operator jurisdiction and any proposed governing-law clause: [to be completed following review]. A choice of law must not deprive consumers of mandatory protections that otherwise apply. Additional regional disclosures may be necessary.",
    "You can raise service concerns through the Contact form or [support email to be confirmed]; this does not prevent you from exercising statutory rights or contacting a competent authority. The final Terms must explain material-change notices and when renewed acceptance is needed. Changes should not retrospectively remove accrued rights. If one provision is unenforceable, the remainder applies only to the extent permitted by law.",
  ] },
];

export function LegalPage({ kind }: { kind: "privacy" | "terms" }) {
  const title = kind === "privacy" ? "Privacy notice" : "Terms of use";
  const sections = kind === "privacy" ? privacy : terms;
  useEffect(() => {
    const previous = document.title;
    document.title = `${title} — Scientific Research Radar`;
    window.scrollTo(0, 0);
    return () => { document.title = previous; };
  }, [title]);
  return (
    <Box>
      <MarketingHeader />
      <Container component="main" maxWidth="md" sx={{ py: { xs: 5, md: 8 } }}>
        <Box data-page-column="centered" sx={{ width: "100%", maxWidth: 800, minWidth: 0, mx: "auto" }}>
          <Typography variant="overline" color="primary" fontWeight={800}>Transparency & trust</Typography>
          <Typography component="h1" variant="h2" sx={{ mt: 1, mb: 2 }}>{title}</Typography>
          <Typography color="text.secondary" sx={{ mb: 3 }}>Draft for review · Updated 5 October 2026 · Effective date not yet set</Typography>
          <Alert severity="warning" sx={{ mb: 4 }}>Draft only. Product descriptions have been updated, but operator details, retention periods, and legal procedures still need confirmation and review. This is not a finalized legal notice or agreement, and it does not limit rights that apply by law.</Alert>
          <Stack spacing={4}>
            {sections.map((section, index) => <Box component="section" key={section.title} aria-labelledby={`${kind}-${index}`}>
              <Typography id={`${kind}-${index}`} component="h2" variant="h6" sx={{ mb: 1.5 }}>{index + 1}. {section.title}</Typography>
              {section.paragraphs.map((paragraph) => <Typography key={paragraph} sx={{ mb: 1.5, overflowWrap: "anywhere" }}>{paragraph}</Typography>)}
            </Box>)}
          </Stack>
          <Stack direction="row" gap={2} flexWrap="wrap">
            <Link component={RouterLink} to={kind === "privacy" ? "/terms" : "/privacy"}>{kind === "privacy" ? "Read the draft Terms of use" : "Read the draft Privacy notice"}</Link>
            <Link component={RouterLink} to="/contact">Contact us</Link>
          </Stack>
        </Box>
      </Container>
    </Box>
  );
}
