import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

const jsx = (type, props) => ({ type, props: props ?? {} });
async function renderPage(name, props = {}) {
  const source = await readFile(new URL(`../src/pages/${name}.tsx`, import.meta.url), "utf8");
  const result = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    reportDiagnostics: true,
  });
  assert.equal(result.diagnostics?.length ?? 0, 0);
  const module = { exports: {} };
  const dependencies = {
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "@mui/material": Object.fromEntries(["Alert", "Box", "Button", "Container", "Link", "Paper", "Stack", "Typography"].map(name => [name, name])),
    "react-router-dom": { Link: "RouterLink" },
    "../components/MarketingHeader": { MarketingHeader: "MarketingHeader" },
    "../components/BasicMarkdown": { BasicMarkdown: "BasicMarkdown" },
    "../content/publicContent": { loadPublicContent: async () => null },
    react: { useEffect: () => {}, useState: (value) => [value, () => {}] },
  };
  vm.runInNewContext(result.outputText, { module, exports: module.exports, require(name) {
    assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
    return dependencies[name];
  } });
  return module.exports[name](props);
}
function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return tree && typeof tree === "object" ? [tree, ...nodes(tree.props.children)] : [];
}
function text(tree) {
  if (Array.isArray(tree)) return tree.map(text).join(" ");
  if (tree == null || typeof tree === "boolean") return "";
  return typeof tree === "object" ? text(tree.props.children) : String(tree);
}
const about = await renderPage("AboutPage");
const aboutText = text(about);
const privacy = await renderPage("LegalPage", { kind: "privacy" });
const terms = await renderPage("LegalPage", { kind: "terms" });
const privacyText = text(privacy), termsText = text(terms);

test("About stays a short, benefit-led guide rather than a second legal agreement", () => {
  const words = aboutText.trim().split(/\s+/).length;
  assert.ok(words >= 400 && words <= 750, `About has ${words} words`);
  for (const phrase of ["prioritize reading", "prepare a discussion", "without starting your search from scratch"])
    assert.ok(aboutText.includes(phrase));
  assert.doesNotMatch(aboutText, /save \d+ hours|100%|guaranteed accuracy|\d+% accurate|\[legal name\]/i);
});
test("registration explains verified Free access without an automatic paid purchase", () => {
  assert.match(aboutText, /verify your email/);
  assert.match(aboutText, /start on Free.*without a payment card/);
  assert.match(aboutText, /only after payment is verified/);
  assert.doesNotMatch(aboutText, /free trial|automatically upgrade/i);
});
test("digest definitions separate saving, execution, and immutable historical context", () => {
  for (const phrase of ["saved research configuration", "Each run creates a separate edition", "Saving a digest does not start research", "not the settings or results recorded for past runs"])
    assert.ok(aboutText.includes(phrase));
});
test("scheduling is plan-dependent and is neither instant delivery nor billing cancellation", () => {
  assert.match(aboutText, /where your plan includes scheduling/);
  assert.match(aboutText, /emailed when that feature is included and enabled/);
  assert.match(aboutText, /planned start is not a guaranteed delivery time/);
  assert.match(aboutText, /Saving new preferences does not cancel an existing schedule/);
});
test("renewal and allowances use current labels without freezing catalogue quantities or prices", () => {
  assert.match(aboutText, /renew automatically.*Monthly or Yearly/);
  assert.match(aboutText, /research allowances reset monthly/);
  assert.match(aboutText, /Manual runs are part of the total run allowance/);
  assert.match(aboutText, /saved-digest capacity does not reset monthly/);
  assert.doesNotMatch(aboutText, /\bAnnual\b|[$€£]\s*\d/);
});
test("checkout replacement is matched by both plan and interval and requires confirmation", () => {
  assert.match(aboutText, /Resume Checkout on its matching plan and interval/);
  assert.match(aboutText, /confirming another eligible selection replaces/);
});
test("scheduled upgrades and cancelling a requested change remain distinct from renewal cancellation", () => {
  assert.match(aboutText, /Monthly to a higher Yearly plan/);
  assert.match(aboutText, /Paid downgrades also take effect at renewal/);
  assert.match(aboutText, /Cancel requested change while available/);
  assert.match(aboutText, /This cancels the change, not your subscription/);
});
test("cancellation and irreversible account closure disclose different consequences", () => {
  assert.match(aboutText, /Billing and invoices.*cancellation flow/);
  assert.match(aboutText, /verified paid access until its end date, then Free applies/);
  assert.match(aboutText, /Simply stopping use or deleting a digest does not cancel/);
  assert.match(aboutText, /Close account.*ends access immediately/);
  assert.match(aboutText, /cannot be undone.*does not automatically issue a refund/);
  assert.match(aboutText, /do not remove any applicable withdrawal or refund rights/);
});
test("AI and evidence limitations stay visible rather than promising exhaustive or full-text coverage", () => {
  for (const phrase of ["A starting point for understanding", "fewer papers than requested", "abstracts or metadata rather than full text", "not an exhaustive literature review", "qualified professional advice"])
    assert.ok(aboutText.includes(phrase));
});
test("About uses one h1, labelled sections, centered readable width, and real route links", () => {
  const all = nodes(about);
  assert.equal(all.filter(n => n.props.component === "h1").length, 1);
  const column = all.find(n => n.props["data-page-column"] === "centered");
  assert.equal(column.props.sx.maxWidth, 800);
  assert.equal(column.props.sx.width, "100%");
  assert.equal(column.props.sx.mx, "auto");
  const ids = all.map(n => n.props.id).filter(Boolean);
  assert.equal(new Set(ids).size, ids.length);
  for (const section of all.filter(n => n.props.component === "section"))
    assert.ok(ids.includes(section.props["aria-labelledby"]));
  const links = all.filter(n => n.props.component === "RouterLink");
  assert.deepEqual(links.map(n => n.props.to), ["/plans", "/radar/subscription", "/contact", "/privacy", "/terms"]);
  assert.equal(text(links[0]), "Subscription Plans");
  assert.equal(text(links[1]), "Review Subscription");
});
for (const [kind, page] of [["privacy", privacy], ["terms", terms]]) {
  test(`${kind} retains truthful draft status, missing registered name and no effective date`, () => {
    const content = text(page);
    assert.match(content, /Draft for review.*Updated 5 October 2026.*Effective date not yet set/);
    assert.match(content, /\[legal name including the proprietor/);
    assert.match(content, /not a finalized legal notice or agreement/);
    assert.match(content, /does not limit rights that apply by law/);
    assert.ok(nodes(page).some(n => n.type === "Alert" && n.props.severity === "warning"));
    assert.ok(nodes(page).some(n => n.props.to === "/contact"));
    assert.ok(nodes(page).some(n => n.props.to === (kind === "privacy" ? "/terms" : "/privacy")));
    assert.doesNotMatch(content, /fully GDPR.compliant|worldwide compliance|all data.*immediately erased/i);
  });
}
test("Privacy includes implemented billing data and bounded payment-card handling", () => {
  for (const phrase of ["Stripe customer", "invoice identifiers", "usage records", "does not collect or store full payment-card numbers", "customer billing portal"])
    assert.ok(privacyText.includes(phrase));
});
test("Privacy explains AI processing and stored contacts without inventing provider promises", () => {
  assert.match(privacyText, /manual or scheduled research run/);
  assert.match(privacyText, /paper evidence.*OpenAI/);
  assert.match(privacyText, /marking one Reviewed does not send a reply/);
  assert.match(privacyText, /does not promise zero provider retention or a particular model-training policy/);
});
test("Privacy describes actual closure and distinguishes erasure from provider/back-up retention", () => {
  assert.match(privacyText, /Profile → Close account immediately ends access/);
  assert.match(privacyText, /pseudonymous closure record/);
  assert.match(privacyText, /does not itself erase Stripe records/);
  assert.match(privacyText, /No self-service data-export tool is currently offered/);
  assert.doesNotMatch(privacyText, /does not imply that self-service export or account deletion is available/);
});
test("Terms no longer claim that the catalogue and payments are illustrative or disabled", () => {
  assert.match(termsText, /published plan prices/);
  assert.match(termsText, /paid subscriptions through Stripe/);
  assert.match(termsText, /renew automatically/);
  assert.doesNotMatch(termsText, /plans page is illustrative|Payment collection.*not enabled|future subscriptions|during the preview/);
});
test("Terms preserve mandatory remedies and distinguish manual handling from legal entitlement", () => {
  assert.match(termsText, /None waives any mandatory consumer withdrawal, refund, or remedy rights/);
  assert.match(termsText, /no blanket no-refund rule/);
  assert.match(termsText, /withdrawal instructions and form/);
  assert.match(termsText, /using an AI feature does not by itself establish a waiver/);
  assert.match(termsText, /subject to.*third-party rights/i);
});
test("public drafts and About never claim that merely reading Privacy is consent", () => {
  assert.match(privacyText, /reading this notice does not constitute consent/);
  assert.match(aboutText, /Both are currently marked as drafts/);
  assert.doesNotMatch(aboutText + termsText, /by visiting.*you consent|by reading.*you agree/i);
});

// Operator-confirmed facts do not authorize guessed identities or legal commitments.
for (const [kind, page] of [["privacy", privacy], ["terms", terms]]) {
  test(`${kind} uses the supplied trade name and NIP without inventing the registered identity`, () => {
    const content = text(page);
    assert.match(content, /Scientific Research Radar is the service name/);
    assert.match(content, /sole proprietor registered in Poland/);
    assert.match(content, /jednoosobowa działalność gospodarcza/);
    assert.match(content, /NIP\): 8992779679/);
    assert.match(content, /first name and surname — to be confirmed/);
    assert.doesNotMatch(content, /limited company|Sp\. z o\.o\.|KRS:\s*\d|VAT registration verified/);
  });
  test(`${kind} labels the PO box as correspondence and keeps geographic address and phone unresolved`, () => {
    const content = text(page);
    assert.match(content, /PO Box 12345, 52-229 Wrocław, Poland/);
    assert.match(content, /correspondence address, not a confirmed geographic business address/);
    assert.match(content, /Geographic business address and business telephone: \[to be confirmed/);
    assert.doesNotMatch(content, /Registered address: PO Box|business address: PO Box/);
  });
  test(`${kind} has functional mailto support links and preserves readable semantic layout`, () => {
    const all = nodes(page);
    const mail = all.filter(n => n.type === "Link" && n.props.href?.startsWith("mailto:"));
    assert.ok(mail.length >= 2);
    for (const link of mail) assert.equal(link.props.href, "mailto:support@getresearchradar.com");
    assert.ok(mail.some(n => text(n) === "support@getresearchradar.com"));
    assert.equal(all.filter(n => n.props.component === "h1").length, 1);
    const column = all.find(n => n.props["data-page-column"] === "centered");
    assert.equal(column.props.sx.maxWidth, 800);
    assert.equal(column.props.sx.minWidth, 0);
    const ids = all.map(n => n.props.id).filter(Boolean);
    assert.equal(new Set(ids).size, ids.length);
    for (const section of all.filter(n => n.props.component === "section"))
      assert.ok(ids.includes(section.props["aria-labelledby"]));
    assert.match(text(page), /without a Radar account/);
  });
}
test("confirmed provider names have purpose-specific disclosures, not assumed locations", () => {
  for (const name of ["Hetzner", "Cloudflare R2 Object Storage", "Resend", "UptimeRobot", "Healthchecks.io", "OpenAI", "Stripe"])
    assert.ok(privacyText.includes(name), name);
  assert.match(privacyText, /encrypted off-site backup archives/);
  assert.match(privacyText, /Resend delivers transactional emails/);
  assert.match(privacyText, /availability and background-job monitoring/);
  assert.match(privacyText, /legal entities, processing countries.*remain to be confirmed/);
  assert.match(privacyText, /No EU-only storage guarantee/);
});
test("private-content reuse is restricted without falsely certifying provider training settings", () => {
  assert.match(privacyText, /only to deliver, maintain and support the requested service/);
  assert.match(privacyText, /not for unrelated reuse, public marketing samples or training our own models/);
  assert.match(termsText, /not licensed for unrelated reuse, public marketing samples or training our own models/);
  assert.match(privacyText, /does not promise a particular retention or training configuration for an external provider/);
  assert.doesNotMatch(termsText, /perpetual.*license|irrevocable.*license|sell your content/i);
});
test("planned analytics and marketing are not presented as enabled or opted in", async () => {
  assert.match(privacyText, /Google Analytics is planned, not currently enabled by this update/);
  assert.match(privacyText, /Newsletters and marketing emails are also planned/);
  assert.match(privacyText, /not activated by registration/);
  assert.match(privacyText, /required prior consent.*withdrawal or unsubscribe/);
  assert.match(privacyText, /service communications, not newsletter enrolment/);
  const source = await readFile(new URL("../src/pages/LegalPage.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /<script|dangerouslySetInnerHTML|gtag\(|fetch\(|axios\.|document\.cookie\s*=/);
});
test("immediate closure is not instant erasure and backups are not claimed to be rewritten", () => {
  assert.match(privacyText, /once active work and required billing or ownership reviews permit/);
  assert.match(privacyText, /Immediate access closure and completed data erasure are different events/);
  assert.match(privacyText, /seven days after the closure request/);
  assert.match(privacyText, /minimal pseudonymous closure record/);
  assert.match(privacyText, /reapplying the latest closure information.*before restoring public access/);
  assert.match(privacyText, /do not mean closed-account information instantly disappears/);
  assert.match(termsText, /Erasure can wait for active work or required reviews/);
});
test("approved technical retention stays distinct from inactivity and legal-case retention", () => {
  assert.match(privacyText, /no approved inactivity-based retention policy/);
  assert.match(privacyText, /simply not signing in is not a request for closure/);
  assert.match(privacyText, /Closed accounts are not kept as usable dormant accounts/);
  assert.match(privacyText, /off-site database snapshots for 35 days/);
  assert.match(privacyText, /closure recovery checkpoints for 65 days/);
  assert.match(privacyText, /contact messages are deleted 12 months after they are marked reviewed/);
  assert.match(privacyText, /host operational logs use 30 daily rotations/);
  assert.match(privacyText, /not automatically deleted by these application rules/);
});
test("no blanket 18+ rule does not mean child eligibility or consent has been verified", () => {
  assert.match(termsText, /does not impose a blanket 18\+ account restriction/);
  assert.match(termsText, /parent or legal guardian where required/);
  assert.match(termsText, /does not establish unrestricted all-ages eligibility/);
  assert.match(privacyText, /does not currently establish verified age or guardian authorisation/);
  assert.doesNotMatch(termsText + privacyText, /must be (18|eighteen)|intended for adults|service is for adults|verified parental consent is collected/);
});
test("manual refunds and held-result reviews keep statutory remedies ahead of discretion", () => {
  assert.match(termsText, /handled manually outside Radar/);
  assert.match(termsText, /statutory remedy is not optional/);
  assert.match(termsText, /mandatory rights to conformity of a digital service/);
  assert.match(termsText, /reviewed individually/);
  assert.match(termsText, /No automatic allowance restoration/);
  assert.match(termsText, /submitted or pending refund is not confirmation of completion/);
  assert.match(termsText, /No additional voluntary satisfaction guarantee/);
  assert.ok(nodes(about).some(n => n.props.href === "mailto:support@getresearchradar.com"));
  assert.match(aboutText, /Refund requests and unusable or held research are reviewed manually/);
});
test("withdrawal email example is optional and does not pretend to implement the full statutory process", () => {
  assert.match(termsText, /EU consumers generally have 14 days/);
  assert.match(termsText, /without giving a reason/);
  assert.match(termsText, /a particular form is not required/);
  assert.match(termsText, /Longer periods or additional rights may apply/);
  assert.match(termsText, /I give notice that I withdraw/);
  assert.match(termsText, /not a complete substitute.*online withdrawal function/);
});
test("English European-consumer focus does not waive local protections or invent global availability", () => {
  assert.match(termsText, /individual consumers across Europe/);
  assert.match(termsText, /currently in English/);
  assert.match(termsText, /does not waive any applicable requirement for information in another language/);
  assert.match(termsText, /US, Canadian and other international sales require additional review/);
  assert.match(termsText, /No exclusive Polish court, forced arbitration/);
});
test("privacy rights have an accessible route and an appropriate Polish supervisory authority", () => {
  assert.match(privacyText, /President of Poland’s Personal Data Protection Office/);
  assert.match(privacyText, /another competent supervisory authority/);
  assert.match(privacyText, /requests are handled manually/);
  assert.match(privacyText, /proportionate identity checks/);
  assert.match(privacyText, /within applicable legal deadlines/);
});
test("review worksheet records confirmed inputs and unresolved decisions without inventing approval", async () => {
  const doc = await readFile(new URL("../../docs/legal-finalization.md", import.meta.url), "utf8");
  assert.match(doc, /operator facts partly confirmed; not approved for final publication/);
  assert.match(doc, /exact CEIDG legal name/);
  assert.match(doc, /Resend as sending provider does not establish inbound-mail hosting/);
  assert.match(doc, /under 16 and\s+under 13/);
  assert.match(doc, /Article 8 applies specifically to consent-based online/);
  assert.match(doc, /zero data retention/);
  assert.match(doc, /No automatic 18\+ restriction/);
  assert.match(doc, /Polish Language Act/);
  assert.match(doc, /No Google Analytics or advertising tags/);
  assert.match(doc, /final publication blocked/);
});
