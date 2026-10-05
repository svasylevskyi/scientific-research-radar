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
    react: { useEffect: () => {} },
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
  test(`${kind} retains truthful draft status, missing operator details and no effective date`, () => {
    const content = text(page);
    assert.match(content, /Draft for review.*Updated 5 October 2026.*Effective date not yet set/);
    assert.match(content, /\[legal name/);
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
test("Terms preserve mandatory remedies and leave unapproved withdrawal/refund terms unresolved", () => {
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
