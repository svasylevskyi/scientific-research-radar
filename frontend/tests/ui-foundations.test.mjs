import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { harness, paid, nodes, text, find, button, tick } from "./helpers/plan-harness.mjs";

// Isolated presentation tests: no browser, Stripe, authentication, or network.
const jsx = (type, props, key) => ({ type, props: props ?? {}, key });
const mui = new Proxy({}, { get: (_, name) => name });
async function load(path, dependencies = {}, globals = {}) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const { outputText, diagnostics } = ts.transpileModule(source, {
    fileName: path, reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  });
  assert.equal(diagnostics.filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);
  const module = { exports: {} };
  runInNewContext(outputText, { ...globals, module, exports: module.exports,
    require(name) {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
      if (name === "@mui/material") return mui;
      if (name in dependencies) return dependencies[name];
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  return module.exports;
}
const { default: theme } = await load("../src/theme.ts", {
  "@mui/material/styles": { createTheme: value => value, responsiveFontSizes: value => value },
});
test("page containers override legacy caps with one responsive gutter policy", () => {
  const container = theme.components.MuiContainer;
  assert.equal(container.defaultProps.maxWidth, false);
  const root = container.styleOverrides.root;
  assert.equal(root.width, "100%"); assert.equal(root.minWidth, 0); assert.equal(root["&&"].maxWidth, "none");
  const gutters = root["&:not(.MuiContainer-disableGutters)"];
  assert.equal(gutters.paddingLeft, "clamp(16px, 3vw, 48px)"); assert.equal(gutters.paddingRight, gutters.paddingLeft);
});
test("workspace header avoids double gutters and auth forms retain a readable inner width", async () => {
  const header = await readFile(new URL("../src/components/AppHeader.tsx", import.meta.url), "utf8");
  assert.match(header, /<Toolbar disableGutters/); assert.match(header, /<Container maxWidth=\{false\} sx=/);
  const auth = await readFile(new URL("../src/layouts/AuthLayout.tsx", import.meta.url), "utf8");
  assert.match(auth, /width: "100%", maxWidth: 560, mx: "auto"/);
});
test("all public and workspace catalogue links use Subscription Plans", async () => {
  let links = 0;
  for (const name of ["components/SiteFooter", "pages/LandingPage", "pages/AboutPage", "pages/SubscriptionAccessPage", "components/SubscriberBilling"]) {
    const source = await readFile(new URL(`../src/${name}.tsx`, import.meta.url), "utf8");
    const file = ts.createSourceFile(name + ".tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    function visit(node) {
      if (ts.isJsxElement(node)) {
        const to = node.openingElement.attributes.properties.find(p => ts.isJsxAttribute(p) && p.name.getText(file) === "to");
        if (to?.initializer && ts.isStringLiteral(to.initializer) && ["/plans", "/radar/plans"].includes(to.initializer.text)) {
          links++;
          assert.equal(node.children.map(child => child.getText(file)).join("").trim(), "Subscription Plans", name);
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(file);
  }
  // The two former subscription-tab links are replaced by an embedded catalogue.
  assert.equal(links, 5);
  const header = await readFile(new URL("../src/components/MarketingHeader.tsx", import.meta.url), "utf8");
  assert.match(header, /label: "Subscription Plans", to: "\/plans"/);
  const navigation = await readFile(new URL("../src/navigation.ts", import.meta.url), "utf8");
  for (const route of ["/plans", "/radar/plans"]) assert.ok(navigation.includes(`["${route}", "Subscription Plans",`));
});
let nextId = 0;
const { BillingIntervalTabs } = await load("../src/components/BillingIntervalTabs.tsx", { react: { useId: () => `billing-${nextId++}` } });
test("Monthly and Yearly tabs preserve billing values and control labelled panels", () => {
  for (const value of ["monthly", "annual"]) {
    const changes = [], content = jsx("p", { children: "Plan prices" });
    const tree = BillingIntervalTabs({ value, onChange: next => changes.push(next), children: content });
    const tabs = find(tree, n => n.type === "Tabs");
    assert.equal(tabs.props["aria-label"], "Billing interval"); assert.equal(tabs.props.selectionFollowsFocus, true); assert.equal(tabs.props.value, value);
    const options = nodes(tree).filter(n => n.type === "Tab");
    assert.deepEqual(options.map(n => [n.props.value, n.props.label]), [["monthly", "Monthly"], ["annual", "Yearly"]]);
    for (const option of options) {
      const panel = find(tree, n => n.props.id === option.props["aria-controls"]);
      assert.equal(panel.props.role, "tabpanel"); assert.equal(panel.props["aria-labelledby"], option.props.id);
      assert.equal(panel.props.hidden, option.props.value !== value); assert.equal(panel.props.tabIndex, 0);
      assert.equal(panel.props.children, option.props.value === value ? content : null);
    }
    tabs.props.onChange({}, "annual"); assert.deepEqual(changes, ["annual"]);
  }
});
test("multiple interval tab groups use different IDs", () => {
  const first = BillingIntervalTabs({ value: "monthly", onChange() {} }), second = BillingIntervalTabs({ value: "monthly", onChange() {} });
  assert.notEqual(find(first, n => n.type === "Tab").props.id, find(second, n => n.type === "Tab").props.id);
});
test("yearly prices and checkout use the existing annual API contract", async () => {
  const app = await harness(); let tree = app.render();
  assert.equal(find(tree, n => n.type === "BillingIntervalTabs").props.value, "monthly");
  app.interval("annual"); tree = app.render();
  const card = find(tree, n => n.props.component === "section" && n.key === "explorer");
  assert.ok(text(card).includes(new Intl.NumberFormat(undefined, { style: "currency", currency: "EUR" }).format(90)));
  assert.match(text(card), /\/ year/); assert.match(text(card), /Billed yearly/); assert.doesNotMatch(text(tree), /\bannual\b/i);
  button(tree, "Upgrade to Explorer").props.onClick(); tree = app.render(); assert.match(text(find(tree, n => n.type === "DialogContent")), /per year/);
  app.interval("monthly"); button(app.render(), "Continue to Payment").props.onClick(); await tick();
  assert.equal(app.requests.length, 1); assert.equal(app.requests[0].interval, "annual"); assert.equal(app.requests[0].revision, 7); assert.equal(app.destinations[0], "https://checkout.stripe.com/example");
});
test("plans without a yearly price remain unavailable in the Yearly view", async () => {
  const app = await harness({ plans: [{ ...paid, annual_price: null }] }); app.interval("annual"); const tree = app.render();
  assert.equal(button(tree, "Upgrade to Explorer").props.disabled, true); assert.match(text(tree), /Yearly billing not available/); assert.equal(app.requests.length, 0);
});
test("free registration still continues without checkout, including in the Yearly view", async () => {
  const app = await harness({ enrolment: true }); app.interval("annual"); const continueButton = button(app.render(), "Continue with Free");
  assert.equal(continueButton.props.disabled, false); continueButton.props.onClick(); assert.equal(app.destinations[0][0], "/radar"); assert.equal(app.requests.length, 0);
});
test("billing or catalogue errors still block choosing a paid plan", async () => {
  for (const options of [{ accountError: "offline" }, { catalogueError: "offline" }]) {
    const app = await harness(options); assert.equal(button(app.render(), "Upgrade to Explorer").props.disabled, true);
  }
});
test("loading, empty catalogue, and signed-out paths survive the tab replacement", async () => {
  assert.match(text((await harness({ plans: null })).render()), /Loading plans/);
  assert.match(text((await harness({ plans: [] })).render()), /No subscription plans are available/);
  const tree = (await harness({ user: null })).render();
  assert.equal(button(tree, "Sign in to continue").props.to, "/radar/login"); assert.equal(button(tree, "Create a free account").props.to, "/radar/register");
});
