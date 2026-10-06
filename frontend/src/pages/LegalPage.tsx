import { Alert, Box, Container, Link, Stack, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { MarketingHeader } from "../components/MarketingHeader";
import { BasicMarkdown } from "../components/BasicMarkdown";
import { loadPublicContent, type PublicContentRevision } from "../content/publicContent";

interface Section { title: string; paragraphs: string[] }

const supportEmail = "support@getresearchradar.com";

// Only turn the operator-approved address into a link; never interpret legal text as HTML.
function withSupportLink(paragraph: string) {
  return paragraph.split(supportEmail).map((part, index) => (
    <span key={index}>
      {index > 0 && <Link href={`mailto:${supportEmail}`}>{supportEmail}</Link>}{part}
    </span>
  ));
}

export const privacySections: Section[] = [
  { title: "Who is responsible for your information", paragraphs: [
    "This notice covers accounts, research preferences and results, feedback, service communications, payment administration, and information used to operate Scientific Research Radar. The sole proprietor identified below is the data controller for Radar’s processing.",
    "Scientific Research Radar is the service name. The service is provided by a sole proprietor registered in Poland (jednoosobowa działalność gospodarcza). Registered proprietor: [legal name including the proprietor’s first name and surname — to be confirmed]. Polish tax identification number (NIP): 8992779679.",
    "Correspondence address supplied by the operator: PO Box 12345, 52-229 Wrocław, Poland. This is a correspondence address, not a confirmed geographic business address. Geographic business address and business telephone: [to be confirmed before final publication].",
    "Contact support@getresearchradar.com for support, complaints, refund or withdrawal requests, privacy requests, and legal notices. You can contact us without a Radar account. Do not send passwords, verification codes, API keys, or full payment-card details.",
  ] },
  { title: "Information we process", paragraphs: [
    "Account information includes your name, email address, password hash, account role, sessions, email-verification and recovery records, and the timestamp plus document versions recorded when you explicitly agree to the Terms of Use and acknowledge this Privacy Notice during registration. An email address you can access is required for registration, verification and service communications. Optional descriptions, keywords and feedback are not required to open an account.",
    "Research information includes digest topics, descriptions, keywords, audience and reporting preferences, generated briefings and paper summaries, run status and errors, historical input snapshots, usage and cost records, and optional feedback. Research interests can reveal personal information. Do not enter secrets, confidential material or sensitive personal information about yourself or others.",
    "Billing information includes the selected plan and revision, billing interval, Stripe customer, checkout, subscription and invoice identifiers, payment and renewal status, requested plan changes, and usage records. Stripe collects payment details through its hosted pages; Radar does not collect or store full payment-card numbers or security codes.",
    "Contact submissions include the name, email address and message you provide, a receipt time, review status and, for signed-in submissions, the owning account. Messages are stored for administrators to review; marking one Reviewed does not send a reply. Messages sent directly to support and manual complaint or refund correspondence are handled outside the in-app contact inbox as well.",
    "Technical records may include request times, IP or connection information, errors, service-health results and email-delivery events, depending on deployed logging and provider settings. Paper metadata and evidence from public or otherwise accessible third-party sources may include author names and affiliations. The deployed log fields and retention settings still need confirmation before this notice is finalized.",
  ] },
  { title: "How and why information is used", paragraphs: [
    "We use account and billing information to provide access, verify or recover an account, process requested subscriptions and changes, enforce allowances, and close accounts. Digest settings, relevant earlier results and feedback are used to produce and retain the research you request. These service activities rely on performance of a contract or steps you request before entering one where that lawful basis applies.",
    "Security, troubleshooting, maintaining reliable delivery and preventing closed accounts from being restored may rely on legitimate interests, subject to necessity and balancing safeguards. Accounting and other legally required records rely on the applicable legal obligation. Complaint and privacy-request handling uses the basis appropriate to the request, including legal obligations. The operator and advisers must confirm this purpose-to-basis mapping and the handling of third-party author metadata before publication.",
    "We use private customer research content only to deliver, maintain and support the requested service, not for unrelated reuse, public marketing samples or training our own models. This does not promise a particular retention or training configuration for an external provider. Optional processing requiring consent must obtain it separately; reading this notice does not constitute consent. Research rankings help you choose reading material; they are not intended to make decisions with legal or similarly significant effects about you.",
  ] },
  { title: "Service providers and AI processing", paragraphs: [
    "Hetzner provides application hosting and database infrastructure. Cloudflare R2 Object Storage holds encrypted off-site backup archives and the minimal closure manifests used during recovery. Backup archives can contain earlier copies of account and research data; storing a closure manifest does not itself erase every old backup.",
    "Resend delivers transactional emails, including verification, recovery, service notices and requested scheduled briefings. This involves recipient addresses, the message content needed for delivery and associated delivery information.",
    "UptimeRobot and Healthchecks.io support availability and background-job monitoring. They handle configured service URLs, health signals, timestamps and alert information. The exact monitoring payloads and retention must be checked against production configuration; naming these providers is not a claim that they receive no personal information.",
    "When a manual or scheduled research run executes, digest settings, relevant historical context, feedback, and available paper evidence are supplied to OpenAI to generate results. Authorized quality-review operations may also process evidence and generated output. Web-search tools or research-source services may receive research queries. Free-text information can be included, so do not enter unnecessary personal information.",
    "Stripe supports checkout, subscription billing, invoice and payment-status handling, and the customer billing portal. Its payment, fraud-prevention and compliance activities may also involve processing under its own responsibilities. Authorized administrators can review account, digest and run information to operate and support Radar. External legal and accounting advisers may receive information necessary for advice, complaints or required financial records. Information may also be disclosed where lawfully required.",
    "These are the providers confirmed for the service, not a verified list of every contracting entity or subprocessor. Account-specific legal entities, processing countries, data-processing agreements, provider retention and international-transfer safeguards remain to be confirmed. This draft does not promise zero provider retention or a particular model-training policy. Contact support@getresearchradar.com about data handling or safeguards; the final notice must reflect the verified contracts and settings.",
  ] },
  { title: "Cookies, analytics and communications", paragraphs: [
    "Radar uses a session cookie for sign-in, session storage to resume an email-verification attempt, and local storage to remember whether the run-history panel is collapsed. Clearing or blocking this storage can affect those functions. Browser-storage lifetimes, provider email tracking and any scripts injected outside the repository need to be included in the final deployment inventory.",
    "Google Analytics is planned, not currently enabled by this update. Newsletters and marketing emails are also planned for later stages, not activated by registration or by reading this notice. Before introducing them, we must update the disclosures and implement any required prior consent and simple withdrawal or unsubscribe controls. Requested digest delivery and essential account or billing messages are service communications, not newsletter enrolment.",
  ] },
  { title: "Retention, account closure and restoration", paragraphs: [
    "Unconfirmed registration attempts expire after 24 hours and are removed by cleanup processing. Confirmed accounts, saved research and feedback support ongoing use while an account remains open. There is no approved inactivity-based retention policy; simply not signing in is not a request for closure. Closed accounts are not kept as usable dormant accounts.",
    "Profile → Close account immediately ends access and revokes sessions. The workflow stops new work and removes account-owned live data once active work and required billing or ownership reviews permit. Already-started provider work may finish; exceptional cases require manual review. Immediate access closure and completed data erasure are different events.",
    "After completion, a minimal pseudonymous closure record with account identifiers, status and timestamps remains to prevent restoration or late events from reactivating the account. Shared paper metadata may remain. Ordinary linked contact messages are removed with owned data. A complaint, refund, privacy, dispute, or other case explicitly placed on retention hold is detached from the closed account and preserved under its separate manual legal/accounting retention decision. Older or anonymous messages and free-text mentions may require ownership review. Any address temporarily retained for closure notices is removed on successful notice completion or seven days after the closure request.",
    "Account closure does not itself erase Stripe records, information already sent to AI or email providers, support correspondence outside Radar, operational logs, off-site backups or exported files. Restoring a backup requires reapplying the latest closure information and completing erasure checks before restoring public access. The recovery safeguards prevent reactivation; they do not mean closed-account information instantly disappears from every stored archive.",
    "Radar's approved technical retention policy keeps local database backups for 7 days, off-site database snapshots for 35 days, and closure recovery checkpoints for 65 days (the backup window plus a 30-day recovery margin). Ordinary in-app contact messages are deleted 12 months after they are marked reviewed unless an administrator places a retention hold on the case. Radar host operational logs use 30 daily rotations; container logs are separately size-bounded and can expire sooner under higher volume.",
    "Complaints, refunds, privacy requests, disputes, invoices, accounting records, external support-mailbox records, and provider copies are not automatically deleted by these application rules. Their statutory, contractual, or adviser-approved retention remains a separate manual/provider responsibility. Open accounts and research history have no inactivity expiry; they remain until the user deletes data or closes the account.",
  ] },
  { title: "International processing and your privacy rights", paragraphs: [
    "Providers or their subprocessors may process information outside Poland or your own country. No EU-only storage guarantee is made. Where the law restricts international transfers, an applicable adequacy decision or other valid safeguards, such as approved contractual clauses and any necessary supplementary measures, must support them. The actual countries, mechanisms and method of obtaining safeguard information must be confirmed for the final notice.",
    "Under applicable data-protection law, you may request access, correction, erasure, restriction, portability, or object to certain processing. Consent can be withdrawn without affecting earlier lawful processing. Rights and exceptions depend on the processing and applicable law. Requests can be made to support@getresearchradar.com or through Contact, including after closure or without signing in. No self-service data-export tool is currently offered; requests are handled manually, with proportionate identity checks when needed and within applicable legal deadlines.",
    "You can complain to the President of Poland’s Personal Data Protection Office (Prezes Urzędu Ochrony Danych Osobowych, UODO), or another competent supervisory authority, including where you live or work in the EEA. Other countries may give additional privacy rights. Planned US/Canada or other international expansion requires a separate applicability review; this draft is not a global legal approval.",
  ] },
  { title: "Young users, security and changes", paragraphs: [
    "Radar is not being positioned as an adults-only service. That does not mean unrestricted eligibility for children. Legal capacity, parental permission where required, age-appropriate safeguards and AI-provider requirements must be addressed before offering the relevant features to younger users. The application does not currently establish verified age or guardian authorisation. The operator must finalize and implement the younger-user approach before final publication; contact support@getresearchradar.com about a child’s information.",
    "Password hashing and access controls help protect information, but no service can guarantee complete security. We must maintain safeguards appropriate to the data and meet applicable incident-response duties. Report suspected unauthorized access or a privacy concern to support@getresearchradar.com.",
    "The effective notice will carry an approved version and effective date. Material changes require appropriate notice, and new processing requiring consent must not begin before that consent. The review date here is not an effective date or confirmation of legal approval.",
  ] },
];

export const termsSections: Section[] = [
  { title: "The service and its operator", paragraphs: [
    "These review-draft Terms describe Scientific Research Radar, an AI-assisted service for discovering papers, assessing relevance, summarizing findings, exploring trends, and keeping research briefings and feedback.",
    "Scientific Research Radar is the service name. The service is provided by a sole proprietor registered in Poland (jednoosobowa działalność gospodarcza). Registered proprietor: [legal name including the proprietor’s first name and surname — to be confirmed]. Polish tax identification number (NIP): 8992779679.",
    "Correspondence address supplied by the operator: PO Box 12345, 52-229 Wrocław, Poland. This is a correspondence address, not a confirmed geographic business address. Geographic business address and business telephone: [to be confirmed before final publication].",
    "Contact support@getresearchradar.com for support, complaints, refund or withdrawal requests, privacy requests, and legal notices. You can contact us without a Radar account. Do not send passwords, verification codes, API keys, or full payment-card details.",
    "The intended initial audience is individual consumers across Europe. The interface, support and these draft documents are currently in English. This does not waive any applicable requirement for information in another language. Possible US, Canadian and other international sales require additional review; availability is subject to applicable law and supported payment arrangements, not a guarantee of service in every country.",
  ] },
  { title: "Eligibility and your account", paragraphs: [
    "This draft does not impose a blanket 18+ account restriction. You must have the legal capacity to enter the relevant agreement or the involvement and authorisation of a parent or legal guardian where required. Paid recurring commitments and permission to process a child’s information are separate questions. Age-appropriate protections, AI-provider conditions and any necessary verification remain to be finalized and implemented; this wording does not establish unrestricted all-ages eligibility.",
    "Provide accurate account information and an email address you can access. Keep your password and verification codes secure and report suspected unauthorized access to support@getresearchradar.com. Registration requires an unticked checkbox by which you actively agree to these Terms and acknowledge the Privacy Notice; Radar records the acceptance time and the document versions shown for that registration. Registration and email changes require email verification. Verified registration starts on Free; continuing on Free does not require a payment card. A paid selection uses a separate payment confirmation.",
  ] },
  { title: "Research results and their limitations", paragraphs: [
    "AI-generated results can contain incorrect citations, incomplete coverage, outdated information, biased rankings, or mistaken interpretations. Relevance scores and trend descriptions are analytical aids, not measurements of scientific truth. Some papers may be preprints or may later be corrected or retracted.",
    "Check original sources, publication status, methods and limitations before relying on a result. Radar is not a substitute for professional medical, legal, financial or other specialist advice, and should not be the sole basis for consequential decisions. Sources may require independent access rights, and a summary may rely on an abstract or metadata rather than full text.",
    "A digest saves your research preferences; each run records its own settings and results. Editing the current digest does not rewrite previous runs. Saving preferences does not start a manual run or cancel an existing schedule. Runs start when requested manually or through a saved schedule and may fail or return no relevant results. Completed scheduled runs may be emailed to your profile address when delivery is included and enabled. Stored history and feedback may influence later runs.",
  ] },
  { title: "Your content and intellectual property", paragraphs: [
    "You retain any rights you hold in submitted content and must have the permissions needed to provide it. You authorize processing, storage and transmission only as reasonably necessary to deliver, maintain and support your requested service, including provider processing and feedback used in subsequent runs. Private customer research content is not licensed for unrelated reuse, public marketing samples or training our own models. Personal-information processing and external-provider boundaries are described in Privacy.",
    "Original papers, abstracts, images and third-party materials remain subject to their owners’ rights and source terms. A citation, public link or AI summary does not grant permission to reproduce the underlying work. Preserve attribution and observe applicable restrictions.",
    "You may use generated briefings subject to applicable law and third-party rights. Outputs are not guaranteed to be unique, copyrightable or free of third-party claims. Rights in Radar software and branding are not transferred. Report suspected infringement to support@getresearchradar.com, identifying the material, its location, your interest and the concern.",
  ] },
  { title: "Acceptable use and technical requirements", paragraphs: [
    "Use a compatible current web browser, an internet connection, JavaScript and the storage needed for authentication. You need access to your registered email for verification and service messages. External source sites and payment pages have their own access requirements.",
    "Do not use Radar for unlawful activity, harassment, impersonation, infringement or unauthorized processing of personal information. Do not submit malware, attempt to obtain another user’s data, bypass access or usage controls, interfere with the service, or use prompts to extract confidential system information.",
    "Do not submit secrets or unnecessary sensitive personal information. Follow documented API and usage limits. Access through Radar does not authorize bypassing source paywalls, authentication or other restrictions.",
  ] },
  { title: "Plans, payment and renewal", paragraphs: [
    "Subscription Plans displays the published plan prices, included features and allowances. Radar supports Free access and paid subscriptions through Stripe. Paid subscriptions renew automatically at the selected Monthly or Yearly interval unless cancelled. Review the recurring price and any immediate charge in the payment or change confirmation before proceeding.",
    "Research allowances reset monthly, including on Yearly plans. Manual runs use the total monthly run allowance as well as any manual-run limit. Saved-digest capacity is separate from monthly consumption. Subscription and usage shows limits, remaining usage, payment state and renewal or paid-access end dates. The maximum paper count is not a guarantee of that many relevant papers.",
    "Selecting a plan, opening checkout or returning from Stripe is not proof of payment. Paid access depends on verified billing evidence; missing or failed payment can restrict access. An unfinished initial purchase can be resumed for its saved plan and interval. Confirming a different eligible purchase replaces an open checkout only after the earlier session is verified as expired; completed or processing payments must first be reconciled.",
    "Eligible upgrades can take effect after a prorated payment or at renewal. Combined tier and interval upgrades can be scheduled at renewal. Paid downgrades and interval switches use the available renewal-change flow. Confirmations show the reviewed price, effective date and any reduced capacity. Cancel requested change keeps the existing plan and interval when cancellation is confirmed; cancel the existing request before choosing a different target.",
    "To stop paid renewal, use Subscription and usage → Billing and invoices and complete the cancellation flow. Ordinary cancellation keeps verified paid access through its displayed end date, after which Free limits apply. Saved research is retained while the account stays open, but incompatible schedules pause. Deleting a digest or schedule, or simply not using Radar, does not cancel a paid subscription.",
  ] },
  { title: "Withdrawal, refunds and complaints", paragraphs: [
    "Ordinary renewal cancellation, cancellation of a requested plan change and account closure are different actions. None waives any mandatory consumer withdrawal, refund, or remedy rights. Account closure does not automatically issue a refund, and no blanket no-refund rule is imposed.",
    "Refunds and service complaints are handled manually outside Radar’s automated billing interface. Email support@getresearchradar.com or use Contact. Include the account email, a relevant invoice or run reference if available, what happened and the outcome you seek. Those details help us investigate; they do not create extra conditions for exercising statutory rights. Never send a password, verification code or full payment-card details.",
    "For an online service contract, EU consumers generally have 14 days from entering the contract to notify withdrawal without giving a reason. Send a clear statement to support@getresearchradar.com before the applicable deadline; a particular form is not required. Longer periods or additional rights may apply, including where required information was not provided. Early service performance and any exception need the legally required disclosures and authorisation; using an AI feature does not by itself establish a waiver.",
    "A simple withdrawal message can say: “I give notice that I withdraw from my Scientific Research Radar service contract entered into on [date]. Name: [your name]. Account email or contract reference: [reference]. Date of notice: [date].” You may use other clear wording. This example is not a complete substitute for the reviewed withdrawal instructions and form, durable contract confirmation or any legally required online withdrawal function, which remain publication checks.",
    "Mandatory refunds and complaint responses must follow the applicable legal deadlines. A statutory remedy is not optional merely because support processes it manually. Approved payment refunds are handled through Stripe outside the Radar interface; a submitted or pending refund is not confirmation of completion. No additional voluntary satisfaction guarantee, fixed discretionary refund period or automated refund feature has been introduced.",
    "Unusable or held research, failed delivery and service interruptions are reviewed individually through support@getresearchradar.com. We will assess the issue and communicate a proposed resolution. No automatic allowance restoration or particular discretionary outcome is promised. Individual review does not replace or limit mandatory rights to conformity of a digital service, correction, an appropriate price reduction, termination or other remedies where applicable.",
  ] },
  { title: "Availability, suspension and account closure", paragraphs: [
    "Maintenance, provider failures and technical limitations can interrupt service. A planned research start does not guarantee completion or email-delivery time. No voluntary service-level or support-response guarantee has been agreed; mandatory duties and deadlines remain applicable.",
    "Access may be restricted where reasonably necessary to investigate abuse, protect users or comply with law. Where practicable and lawful, provide reasons and a way to challenge an error through support. This does not remove mandatory paid-service rights.",
    "Profile → Close account requires your current password and explicit confirmation. It ends access immediately, cannot be undone, and starts billing resolution and removal of account-owned live data. Erasure can wait for active work or required reviews; a minimal pseudonymous closure record remains to prevent reactivation during restoration. Already-started payments or work may still require resolution. Closure does not itself refund payments or instantly erase external financial records, logs or backups. Use support@getresearchradar.com for privacy or billing requests after closure.",
  ] },
  { title: "Responsibility and rights that cannot be excluded", paragraphs: [
    "Radar is a research aid with the limitations described above. No additional promise of exhaustive coverage or suitability for a particular consequential decision is made. This does not remove a statutory warranty, conformity obligation or duty that cannot lawfully be excluded.",
    "Nothing here excludes responsibility for fraud, intentional misconduct or other liability that applicable law does not allow to be limited. No universal monetary liability cap is set in this draft. Any future limitation must be assessed for the actual markets served.",
  ] },
  { title: "Local law, disputes and document changes", paragraphs: [
    "The operator is established in Poland. Mandatory rights under the law applicable to a consumer take priority over conflicting wording here. No exclusive Polish court, forced arbitration or waiver of collective rights is imposed. Any proposed governing-law clause and regional disclosures require legal review and must not deprive consumers of mandatory protections.",
    "Send concerns to support@getresearchradar.com; this does not prevent a complaint to a regulator or proceedings in a competent court. Applicable out-of-court dispute-resolution information and complaint-response procedures must be confirmed for publication. There is no promise in this draft to participate in a particular voluntary dispute scheme.",
    "The final Terms will identify their version and effective date. Material changes require appropriate notice and renewed acceptance where required; they must not retrospectively remove accrued rights. English-only publication does not override mandatory language protections. These pages remain review drafts pending legal identity, retention, younger-user safeguards, consumer procedures and adviser approval. No acceptance of new Terms or marketing consent is recorded merely by reading this page.",
  ] },
];

function sectionsMarkdown(sections: Section[]): string {
  return sections.flatMap((section, index) => [
    `## ${index + 1}. ${section.title}`,
    ...section.paragraphs,
  ]).join("\n\n");
}

export function legalDefaultContent(kind: "privacy" | "terms") {
  const title = kind === "privacy" ? "Privacy notice" : "Terms of use";
  const sections = kind === "privacy" ? privacySections : termsSections;
  const counterpart = kind === "privacy"
    ? "[Read the draft Terms of use](/terms)"
    : "[Read the draft Privacy notice](/privacy)";
  return {
    title,
    body_markdown: [
      "**Draft for review · Updated 5 October 2026 · Effective date not yet set**",
      "> Draft only. Confirmed operator contacts and providers are included. The registered proprietor’s full name, geographic business address, provider/legal-case retention details, younger-user safeguards and consumer procedures still need confirmation and review. This is not a finalized legal notice or agreement, and it does not limit rights that apply by law.",
      sectionsMarkdown(sections),
      `${counterpart} · [Contact us](/contact) · [Email support](mailto:${supportEmail})`,
    ].join("\n\n"),
  };
}

export function LegalPage({ kind }: { kind: "privacy" | "terms" }) {
  const builtIn = legalDefaultContent(kind);
  const sections = kind === "privacy" ? privacySections : termsSections;
  const [published, setPublished] = useState<PublicContentRevision | null>(null);

  useEffect(() => {
    const previous = document.title;
    document.title = `${published?.title ?? builtIn.title} — Scientific Research Radar`;
    window.scrollTo(0, 0);
    return () => { document.title = previous; };
  }, [builtIn.title, published?.title]);

  useEffect(() => {
    const controller = new AbortController();
    loadPublicContent(kind, controller.signal).then((value) => {
      if (value) setPublished(value);
    }).catch(() => {});
    return () => controller.abort();
  }, [kind]);

  return (
    <Box>
      <MarketingHeader />
      <Container component="main" maxWidth="md" sx={{ py: { xs: 5, md: 8 } }}>
        <Box data-page-column="centered" sx={{ width: "100%", maxWidth: 800, minWidth: 0, mx: "auto" }}>
          <Typography variant="overline" color="primary" fontWeight={800}>Transparency & trust</Typography>
          <Typography component="h1" variant="h2" sx={{ mt: 1, mb: 2 }}>{published?.title ?? builtIn.title}</Typography>
          {published ? (
            <BasicMarkdown markdown={published.body_markdown} />
          ) : (
            <>
              <Typography color="text.secondary" sx={{ mb: 3 }}>Draft for review · Updated 5 October 2026 · Effective date not yet set</Typography>
              <Alert severity="warning" sx={{ mb: 4 }}>Draft only. Confirmed operator contacts and providers are included. The registered proprietor’s full name, geographic business address, provider/legal-case retention details, younger-user safeguards and consumer procedures still need confirmation and review. This is not a finalized legal notice or agreement, and it does not limit rights that apply by law.</Alert>
              <Stack spacing={4}>
                {sections.map((section, index) => <Box component="section" key={section.title} aria-labelledby={`${kind}-${index}`}>
                  <Typography id={`${kind}-${index}`} component="h2" variant="h6" sx={{ mb: 1.5 }}>{index + 1}. {section.title}</Typography>
                  {section.paragraphs.map((paragraph) => <Typography key={paragraph} sx={{ mb: 1.5, overflowWrap: "anywhere" }}>{withSupportLink(paragraph)}</Typography>)}
                </Box>)}
              </Stack>
              <Stack direction="row" gap={2} flexWrap="wrap">
                <Link component={RouterLink} to={kind === "privacy" ? "/terms" : "/privacy"}>{kind === "privacy" ? "Read the draft Terms of use" : "Read the draft Privacy notice"}</Link>
                <Link component={RouterLink} to="/contact">Contact us</Link>
                <Link href={`mailto:${supportEmail}`}>Email support</Link>
              </Stack>
            </>
          )}
        </Box>
      </Container>
    </Box>
  );
}
