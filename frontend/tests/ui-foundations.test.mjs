import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// Isolated presentation tests: no browser, Stripe, authentication, or network.
const jsx = (type, props, key) => ({ type, props: props ?? {}, key });
const mui = new Proxy({}, { get: (_, name) => name });
async function load(path, dependencies = {}, globals = {}) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const { outputText, diagnostics } = ts.transpileModule(source, {
    fileName: path,
    reportDiagnostics: true,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  });
  assert.equal(diagnostics.filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);
  const module = { exports: {} };
  runInNewContext(outputText, {
    ...globals, module, exports: module.exports,
    require(name) {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
      if (name === "@mui/material") return mui;
      if (name in dependencies) return dependencies[name];
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  return module.exports;
}
function nodes(node) {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object") return [];
  return [node, ...nodes(node.props?.children)];
}
function text(node) {
  if (Array.isArray(node)) return node.map(text).join("");
  if (node == null || typeof node === "boolean") return "";
  return typeof node === "object" ? text(node.props?.children) : String(node);
}
function find(node, predicate) {
  const result = nodes(node).find(predicate);
  assert.ok(result, "Expected element was not rendered");
  return result;
}
const button = (tree, label) => find(tree, n => n.type === "Button" && text(n) === label);

const { default: theme } = await load("../src/theme.ts", {
  "@mui/material/styles": { createTheme: value => value, responsiveFontSizes: value => value },
});
test("page containers override legacy caps with one responsive gutter policy", () => {
  const container = theme.components.MuiContainer;
  assert.equal(container.defaultProps.maxWidth, false);
  const root = container.styleOverrides.root;
  assert.equal(root.width, "100%");
  assert.equal(root.minWidth, 0);
  assert.equal(root["&&"].maxWidth, "none");
  const gutters = root["&:not(.MuiContainer-disableGutters)"];
  assert.equal(gutters.paddingLeft, "clamp(16px, 3vw, 48px)");
  assert.equal(gutters.paddingRight, gutters.paddingLeft);
});
test("workspace header avoids double gutters and auth forms retain a readable inner width", async () => {
  const header = await readFile(new URL("../src/components/AppHeader.tsx", import.meta.url), "utf8");
  assert.match(header, /<Toolbar disableGutters/);
  assert.match(header, /<Container maxWidth=\{false\} sx=/);
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
  assert.equal(links, 7);
  const header = await readFile(new URL("../src/components/MarketingHeader.tsx", import.meta.url), "utf8");
  assert.match(header, /label: "Subscription Plans", to: "\/plans"/);
  const navigation = await readFile(new URL("../src/navigation.ts", import.meta.url), "utf8");
  for (const route of ["/plans", "/radar/plans"]) assert.ok(navigation.includes(`["${route}", "Subscription Plans",`));
});

let nextId = 0;
const { BillingIntervalTabs } = await load("../src/components/BillingIntervalTabs.tsx", {
  react: { useId: () => `billing-${nextId++}` },
});
test("Monthly and Yearly tabs preserve billing values and control labelled panels", () => {
  for (const value of ["monthly", "annual"]) {
    const changes = [];
    const content = jsx("p", { children: "Plan prices" });
    const tree = BillingIntervalTabs({ value, onChange: next => changes.push(next), children: content });
    const tabs = find(tree, n => n.type === "Tabs");
    assert.equal(tabs.props["aria-label"], "Billing interval");
    assert.equal(tabs.props.selectionFollowsFocus, true);
    assert.equal(tabs.props.value, value);
    const options = nodes(tree).filter(n => n.type === "Tab");
    assert.deepEqual(options.map(n => [n.props.value, n.props.label]), [["monthly", "Monthly"], ["annual", "Yearly"]]);
    for (const option of options) {
      const panel = find(tree, n => n.props.id === option.props["aria-controls"]);
      assert.equal(panel.props.role, "tabpanel");
      assert.equal(panel.props["aria-labelledby"], option.props.id);
      assert.equal(panel.props.hidden, option.props.value !== value);
      assert.equal(panel.props.tabIndex, 0);
      assert.equal(panel.props.children, option.props.value === value ? content : null);
    }
    tabs.props.onChange({}, "annual");
    assert.deepEqual(changes, ["annual"]);
  }
});
test("multiple interval tab groups use different IDs", () => {
  const first = BillingIntervalTabs({ value: "monthly", onChange() {} });
  const second = BillingIntervalTabs({ value: "monthly", onChange() {} });
  assert.notEqual(find(first, n => n.type === "Tab").props.id, find(second, n => n.type === "Tab").props.id);
});

const paid = {
  code: "explorer", name: "Explorer", revision: 7, billing_type: "stripe", currency: "EUR",
  monthly_price: "9.00", annual_price: "90.00", description: "Follow research",
  max_digests: 2, max_papers_per_run: 20, runs_per_month: 5, manual_runs_per_month: 1,
  papers_per_month: 50, schedule_frequencies: ["weekly"], email_delivery: true,
};
const free = { ...paid, code: "free", name: "Free", billing_type: "free", monthly_price: "0.00", annual_price: null };
async function plansHarness({ plans = [free, paid], enrolment = false, user = { id: "user" }, accountError = "", catalogueError = "" } = {}) {
  const state = [];
  let cursor = 0;
  const requests = [], destinations = [];
  const api = {
    plans() {}, enrolmentPlans() {},
    async checkout(body) { requests.push(body); return { url: "https://checkout.stripe.com/example" }; },
  };
  const { PlansPage } = await load("../src/pages/PlansPage.tsx", {
    react: {
      useCallback: fn => fn,
      useState(initial) {
        const index = cursor++;
        if (!(index in state)) state[index] = initial;
        return [state[index], value => { state[index] = typeof value === "function" ? value(state[index]) : value; }];
      },
    },
    "react-router-dom": { Link: "Link", Navigate: "Navigate", useNavigate: () => path => destinations.push(path) },
    "../components/ResourceNotice": { ResourceNotice: "ResourceNotice" },
    "../components/MarketingHeader": { MarketingHeader: "MarketingHeader" },
    "../components/AppHeader": { AppHeader: "AppHeader" },
    "../components/BillingIntervalTabs": { BillingIntervalTabs: "BillingIntervalTabs" },
    "../auth/AuthContext": { useAuth: () => ({ user, isInitializing: false }) },
    "../api/client": { ApiError: class ApiError extends Error {} },
    "../api/subscriptions": { subscriptionsApi: api },
    "../subscriptionPresentation": { isCurrentPlan: () => false },
    "../hooks/usePollingResource": {
      usePollingResource: loader => loader === api.plans || loader === api.enrolmentPlans
        ? { data: plans === null ? null : { items: plans, sandbox: false }, error: catalogueError }
        : { data: user ? { billing: { checkout_allowed: true }, access: { billing_type: "free" } } : null, error: accountError },
    },
  }, { window: { location: { assign: url => destinations.push(url) } } });
  return {
    requests, destinations,
    render() { cursor = 0; const page = PlansPage({ enrolment }); return page.type(page.props); },
    interval(tree, value) { find(tree, n => n.type === "BillingIntervalTabs").props.onChange(value); },
  };
}
test("yearly prices and checkout use the existing annual API contract", async () => {
  const app = await plansHarness();
  let tree = app.render();
  assert.equal(find(tree, n => n.type === "BillingIntervalTabs").props.value, "monthly");
  app.interval(tree, "annual");
  tree = app.render();
  const card = find(tree, n => n.props.component === "section" && n.key === "explorer");
  assert.ok(text(card).includes(new Intl.NumberFormat(undefined, { style: "currency", currency: "EUR" }).format(90)));
  assert.match(text(card), /Per year/);
  assert.doesNotMatch(text(tree), /\bannual\b/i);
  button(tree, "Choose Explorer").props.onClick();
  tree = app.render();
  assert.match(text(find(tree, n => n.type === "DialogContent")), /per year/);
  // The confirmation is bound to its selected interval, not a later tab value.
  app.interval(tree, "monthly");
  button(app.render(), "Continue to Stripe").props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(app.requests.length, 1);
  assert.equal(app.requests[0].interval, "annual");
  assert.equal(app.requests[0].revision, 7);
  assert.equal(app.destinations[0], "https://checkout.stripe.com/example");
});
test("plans without a yearly price remain unavailable in the Yearly view", async () => {
  const app = await plansHarness({ plans: [{ ...paid, annual_price: null }] });
  app.interval(app.render(), "annual");
  const tree = app.render();
  assert.equal(button(tree, "Choose Explorer").props.disabled, true);
  assert.match(text(tree), /Unavailable/);
  assert.equal(app.requests.length, 0);
});
test("free registration still continues without checkout, including in the Yearly view", async () => {
  const app = await plansHarness({ enrolment: true });
  app.interval(app.render(), "annual");
  const continueButton = button(app.render(), "Continue with Free");
  assert.equal(continueButton.props.disabled, false);
  continueButton.props.onClick();
  assert.deepEqual(app.destinations, ["/radar"]);
  assert.equal(app.requests.length, 0);
});
test("billing or catalogue errors still block choosing a paid plan", async () => {
  for (const options of [{ accountError: "offline" }, { catalogueError: "offline" }]) {
    const app = await plansHarness(options);
    assert.equal(button(app.render(), "Choose Explorer").props.disabled, true);
  }
});
test("loading, empty catalogue, and signed-out paths survive the tab replacement", async () => {
  const loading = await plansHarness({ plans: null });
  assert.match(text(loading.render()), /Loading plans/);
  const empty = await plansHarness({ plans: [] });
  assert.match(text(empty.render()), /No subscription plans are available/);
  const publicPage = await plansHarness({ user: null });
  const tree = publicPage.render();
  assert.equal(button(tree, "Sign in to continue").props.to, "/radar/login");
  assert.equal(button(tree, "Create a free account").props.to, "/radar/register");
});
