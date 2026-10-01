import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// Isolated tests: use the actual presentation helpers and page, but replace
// React/MUI/router and API calls. Browser layout and payment tests are separate.
const jsx = (type, props, key) => ({ type, props: props ?? {}, key });
async function load(path, dependencies = {}, globals = {}) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const output = ts.transpileModule(source, {
    fileName: path, reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  });
  assert.equal(output.diagnostics?.length ?? 0, 0);
  const module = { exports: {} };
  runInNewContext(output.outputText, { ...globals, module, exports: module.exports,
    require(name) {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
      if (name === "@mui/material") return new Proxy({}, { get: (_, key) => key });
      if (name in dependencies) return dependencies[name];
      throw Error(`Unexpected dependency: ${name}`);
    },
  });
  return module.exports;
}
const presentation = await load("../src/planPresentation.ts");
const subscription = await load("../src/subscriptionPresentation.ts");
const { planPrice, planFeatures } = presentation;
const paid = {
  code: "explorer", name: "Explorer", revision: 7, billing_type: "stripe", currency: "EUR",
  monthly_price: "9.00", annual_price: "90.00", description: "Follow research", tax_display: "inclusive",
  max_digests: 2, max_papers_per_run: 20, papers_per_month: 50, runs_per_month: 5,
  manual_runs_per_month: 1, schedule_frequencies: ["weekly", "monthly"], email_delivery: true,
};
const free = { ...paid, code: "free", name: "Free", billing_type: "free", monthly_price: "0.00", annual_price: null };
const cash = (amount, currency = "EUR", locale = "en-IE") => new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount);
const plain = value => JSON.parse(JSON.stringify(value));

test("monthly price shows the actual catalogue charge without yearly savings or equivalents", () => {
  assert.deepEqual(plain(planPrice(paid, "monthly", "en-IE")), {
    amount: cash(9), unit: "/ month", note: "Billed monthly. Tax included.", monthlyEquivalent: null, savings: null,
  });
});
test("yearly price is primary, monthly equivalent is qualified, and savings use 12 monthly payments", () => {
  const price = planPrice(paid, "annual", "en-IE");
  assert.equal(price.amount, cash(90));
  assert.equal(price.unit, "/ year");
  assert.equal(price.note, "Billed yearly. Tax included.");
  assert.equal(price.monthlyEquivalent, `About ${cash(7.5)} / month, billed yearly.`);
  assert.equal(price.savings, `Save ${cash(18)} per year compared with 12 monthly payments.`);
});
test("prices localize all supported currencies without parsing formatted values", () => {
  for (const currency of ["EUR", "USD", "GBP", "PLN"]) {
    for (const locale of ["en-IE", "de-DE", "pl-PL"]) {
      const price = planPrice({ ...paid, currency, annual_price: "1000.00" }, "annual", locale);
      assert.equal(price.amount, cash(1000, currency, locale));
      assert.equal(price.monthlyEquivalent, `About ${cash(83.33, currency, locale)} / month, billed yearly.`);
      assert.equal(price.savings, null);
    }
  }
});
test("cent-level savings, rounded equivalents and maximum catalogue prices remain accurate", () => {
  const price = planPrice({ ...paid, monthly_price: "0.29", annual_price: "3.47" }, "annual", "en-IE");
  assert.equal(price.savings, `Save ${cash(0.01)} per year compared with 12 monthly payments.`);
  assert.equal(price.monthlyEquivalent, `About ${cash(0.29)} / month, billed yearly.`);
  const large = planPrice({ ...paid, monthly_price: "1000000.00", annual_price: "1000000.00" }, "annual", "en-IE");
  assert.equal(large.amount, cash(1000000));
  assert.equal(large.savings, `Save ${cash(11000000)} per year compared with 12 monthly payments.`);
  assert.equal(planPrice({ ...paid, annual_price: "0.01" }, "annual").monthlyEquivalent, null);
});
test("equal or higher yearly totals, missing monthly prices and zero monthly charges do not invent discounts", () => {
  for (const overrides of [
    { annual_price: "108.00" }, { annual_price: "109.00" },
    { monthly_price: "0.00" }, { monthly_price: "" }, { monthly_price: "NaN" },
  ]) assert.equal(planPrice({ ...paid, ...overrides }, "annual").savings, null);
});
test("Free and absent yearly prices never fall through to a zero-valued paid offer", () => {
  for (const interval of ["monthly", "annual"]) {
    const price = planPrice(free, interval);
    assert.equal(price.amount, "Free");
    assert.equal(price.unit, "");
    assert.equal(price.savings, null);
    assert.equal(price.monthlyEquivalent, null);
  }
  const absent = planPrice({ ...paid, annual_price: null }, "annual");
  assert.equal(absent.amount, "Yearly billing not available");
  assert.equal(absent.unit, "");
  assert.match(absent.note, /Switch to Monthly/);
  assert.equal(absent.savings, null);
  const zero = planPrice({ ...paid, annual_price: "0.00" }, "annual", "en-IE");
  assert.equal(zero.amount, cash(0));
  assert.equal(zero.unit, "/ year");
});
test("malformed prices and unsupported currencies produce a neutral unavailable price", () => {
  for (const value of ["", " ", "-2.00", "NaN", "Infinity", "1,000.00", "3.333", "1e2", "9007199254740992.00"]) {
    const price = planPrice({ ...paid, annual_price: value }, "annual");
    assert.equal(price.amount, "Price unavailable");
    assert.equal(price.unit, "");
    assert.equal(price.savings, null);
    assert.equal(price.monthlyEquivalent, null);
  }
  assert.equal(planPrice({ ...paid, currency: "invalid" }, "monthly").amount, "Price unavailable");
});
test("feature rows preserve all catalogue quotas, distinguish included manual runs, and expose absent features", () => {
  const features = plain(planFeatures(paid, "en-IE"));
  assert.deepEqual(features.map(f => f.label), [
    "Saved digests", "Papers per run", "Papers per month", "Runs per month",
    "Manual runs per month", "Scheduling", "Email delivery",
  ]);
  assert.deepEqual(features.map(f => f.value), ["2", "Up to 20", "50 total", "5 total", "Up to 1", "Weekly, Monthly", "Included"]);
  assert.equal(features[4].detail, "Included in total runs");
  const zero = plain(planFeatures({ ...paid, runs_per_month: 0, manual_runs_per_month: 0, schedule_frequencies: [], email_delivery: false }));
  assert.equal(zero[3].value, "0 total");
  assert.equal(zero[4].value, "Up to 0");
  assert.equal(zero[5].value, "Not included");
  assert.equal(zero[6].value, "Not included");
  assert.equal(planFeatures({ ...paid, papers_per_month: 12345 }, "de-DE")[2].value, "12.345 total");
});

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
const find = (tree, predicate) => { const n = nodes(tree).find(predicate); assert.ok(n, "Expected element"); return n; };
const button = (tree, label) => find(tree, n => n.type === "Button" && text(n) === label);
const card = (tree, code) => find(tree, n => n.props?.component === "section" && n.key === code);
let instance = 0;
async function harness(options = {}) {
  const settings = {
    plans: [free, paid], enrolment: false, workspace: false, user: { id: "user" }, isInitializing: false,
    access: { billing_type: "free" }, billing: { checkout_allowed: true, resume_allowed: false, attempt: null, reason: "" },
    catalogueError: "", accountError: "", sandbox: false, accountLoading: false,
    ...options,
  };
  const state = [], requests = [], destinations = [], refreshes = [];
  let cursor = 0;
  const id = `plans-${instance++}`;
  const api = {
    plans() {}, enrolmentPlans() {},
    async checkout(body) {
      requests.push(body);
      if (settings.checkoutFailure) throw Error("provider error");
      if (settings.pendingCheckout) await settings.pendingCheckout;
      return { url: "https://checkout.stripe.com/example" };
    },
  };
  const { PlansPage } = await load("../src/pages/PlansPage.tsx", {
    react: { useCallback: fn => fn, useId: () => id, useState(initial) {
      const slot = cursor++;
      if (!(slot in state)) state[slot] = typeof initial === "function" ? initial() : initial;
      return [state[slot], value => { state[slot] = typeof value === "function" ? value(state[slot]) : value; }];
    } },
    "react-router-dom": { Link: "Link", Navigate: "Navigate", useNavigate: () => (...args) => destinations.push(args) },
    "../components/ResourceNotice": { ResourceNotice: "ResourceNotice" },
    "../components/MarketingHeader": { MarketingHeader: "MarketingHeader" },
    "../components/AppHeader": { AppHeader: "AppHeader" },
    "../components/BillingIntervalTabs": { BillingIntervalTabs: "BillingIntervalTabs" },
    "../auth/AuthContext": { useAuth: () => ({ user: settings.user, isInitializing: settings.isInitializing }) },
    "../api/client": { ApiError: class ApiError extends Error {} },
    "../api/subscriptions": { subscriptionsApi: api },
    "../subscriptionPresentation": subscription,
    "../planPresentation": presentation,
    "../hooks/usePollingResource": { usePollingResource(loader) {
      const catalogue = loader === api.plans || loader === api.enrolmentPlans;
      return catalogue ? {
        data: settings.plans === null ? null : { items: settings.plans, sandbox: settings.sandbox },
        error: settings.catalogueError, refresh: async () => refreshes.push("catalogue"),
      } : {
        data: settings.user && !settings.accountLoading ? { billing: settings.billing, access: settings.access } : null,
        error: settings.accountError, refresh: async () => refreshes.push("account"),
      };
    } },
  }, { window: { location: { assign: url => destinations.push(url) } } });
  return { settings, requests, destinations, refreshes,
    render() { cursor = 0; const page = PlansPage(settings); return page.type(page.props); },
    interval(value) { find(this.render(), n => n.type === "BillingIntervalTabs").props.onChange(value); },
  };
}

test("cards expose named sections, preserve long names/descriptions, align shared tracks, and keep actions last", async () => {
  const long = { ...paid, name: "Custom name ".repeat(8), description: "Long description ".repeat(58) };
  const tree = (await harness({ plans: [free, long] })).render();
  for (const plan of [free, long]) {
    const section = card(tree, plan.code);
    assert.equal(text(find(section, n => n.props?.id === section.props["aria-labelledby"])), plan.name);
    assert.ok(text(section).includes(plan.description));
    const parts = section.props.children;
    assert.equal(parts.length, 5);
    assert.equal(parts[2].props["data-plan-section"], "price");
    assert.equal(parts[3].props.component, "dl");
    assert.equal(parts[4].props["data-plan-section"], "action");
    assert.equal(nodes(parts[3]).filter(n => n.props?.component === "dt").length, 7);
    assert.equal(nodes(parts[3]).filter(n => n.props?.component === "dd").length, 7);
    assert.equal(section.props.sx.gridTemplateRows, "auto auto auto 1fr auto");
    assert.equal(section.props.sx["@supports (grid-template-rows: subgrid)"].gridRow, "span 5");
    assert.equal(section.props.sx["@supports (grid-template-rows: subgrid)"].gridTemplateRows, "subgrid");
    assert.equal(section.props.sx.overflowWrap, "anywhere");
    assert.equal(section.props.sx.height, undefined);
    assert.equal(parts[4].props.sx["& > .MuiButton-root"].minHeight, 44);
  }
  assert.equal(find(tree, n => n.type === "Container").props.maxWidth, false);
});
test("public, workspace and enrolment pages retain their header context and unique card IDs", async () => {
  const publicTree = (await harness({ user: null })).render();
  assert.ok(nodes(publicTree).some(n => n.type === "MarketingHeader"));
  assert.equal(button(card(publicTree, "free"), "Create a free account").props.to, "/radar/register");
  assert.equal(button(card(publicTree, "explorer"), "Sign in to continue").props.to, "/radar/login");
  for (const options of [{ workspace: true }, { enrolment: true }]) {
    const tree = (await harness(options)).render();
    assert.ok(nodes(tree).some(n => n.type === "AppHeader"));
    assert.notEqual(card(tree, "free").props["aria-labelledby"], card(publicTree, "free").props["aria-labelledby"]);
  }
});
test("existing paid subscription is current and leads to management rather than a duplicate purchase", async () => {
  const app = await harness({ access: { billing_type: "stripe" },
    billing: { checkout_allowed: false, attempt: { code: "explorer", revision: 2, subscription_status: "active" }, reason: "Already subscribed" } });
  const tree = app.render();
  assert.equal(find(card(tree, "explorer"), n => n.type === "Chip").props.label, "Current plan");
  assert.equal(card(tree, "explorer").props.sx.borderColor, "primary.main");
  assert.equal(button(card(tree, "explorer"), "Manage current plan").props.to, "/radar/subscription#plans");
  assert.ok(!nodes(tree).some(n => n.type === "Button" && text(n) === "Choose Explorer"));
  assert.equal(app.requests.length, 0);
});
test("Free fallback highlights Free rather than an old paid attempt", async () => {
  const tree = (await harness({ billing: { checkout_allowed: false, attempt: { code: "explorer", subscription_status: "past_due" } } })).render();
  assert.equal(nodes(card(tree, "explorer")).filter(n => n.type === "Chip").length, 0);
  assert.equal(find(card(tree, "free"), n => n.type === "Chip").props.label, "Current plan");
  assert.equal(button(card(tree, "explorer"), "Review plan changes").props.to, "/radar/subscription#plans");
});
test("pending checkout still resumes existing checkout; terminal subscriptions can select again", async () => {
  const app = await harness({ billing: { checkout_allowed: false, resume_allowed: true, reason: "Unfinished checkout", attempt: { code: "explorer" } } });
  const tree = app.render();
  assert.equal(button(card(tree, "explorer"), "Resume existing checkout").props.to, "/radar/subscription#billing");
  assert.ok(!nodes(tree).some(n => n.type === "Button" && text(n) === "Choose Explorer"));
  assert.ok(nodes(tree).some(n => n.type === "Alert" && text(n).includes("Unfinished checkout")));
  const terminal = (await harness({ billing: { checkout_allowed: true, attempt: { code: "explorer", subscription_status: "canceled" } } })).render();
  assert.equal(button(terminal, "Choose Explorer").props.disabled, false);
});
test("checkout disabled, session restoration, missing account data and read errors keep paid choice gated", async () => {
  for (const options of [{ billing: { checkout_allowed: false } }, { isInitializing: true }, { accountLoading: true },
    { accountError: "Unable to load billing" }, { catalogueError: "Unable to load plans" }]) {
    const app = await harness(options);
    assert.equal(button(app.render(), "Choose Explorer").props.disabled, true);
    assert.equal(app.requests.length, 0);
  }
});
test("routine copy is not an alert while sandbox and billing restrictions stay prominent", async () => {
  const normal = (await harness({ billing: { checkout_allowed: true, reason: "Ready to choose" } })).render();
  assert.equal(nodes(normal).filter(n => n.type === "Alert").length, 0);
  assert.match(text(normal), /Ready to choose/);
  const restricted = (await harness({ sandbox: true, billing: { checkout_allowed: false, reason: "Checkout is disabled on this server." } })).render();
  assert.ok(nodes(restricted).some(n => n.type === "Alert" && text(n).includes("Checkout is disabled")));
  assert.ok(nodes(restricted).some(n => n.type === "Alert" && n.props.severity === "warning" && text(n).includes("No real payment is collected")));
});
test("missing yearly billing is explicit and disabled but Free registration remains available", async () => {
  const app = await harness({ enrolment: true, plans: [free, { ...paid, annual_price: null }] });
  app.interval("annual");
  let tree = app.render();
  assert.match(text(card(tree, "explorer")), /Yearly billing not available/);
  assert.equal(find(card(tree, "explorer"), n => n.type === "FormControlLabel").props.disabled, true);
  assert.equal(find(card(tree, "free"), n => n.type === "FormControlLabel").props.disabled, false);
  assert.equal(button(tree, "Continue with Free").props.disabled, false);
  button(tree, "Continue with Free").props.onClick();
  assert.equal(app.destinations[0][0], "/radar");
  assert.equal(app.destinations[0][1].replace, true);
  assert.equal(app.requests.length, 0);
  app.interval("monthly");
  tree = app.render();
  assert.equal(find(card(tree, "explorer"), n => n.type === "FormControlLabel").props.disabled, false);
});
test("paid enrolment still uses radio selection and confirmation instead of automatic checkout", async () => {
  const app = await harness({ enrolment: true });
  app.interval("annual");
  const group = find(app.render(), n => n.props?.["aria-label"] === "Registration plan");
  group.props.onChange({ target: { value: "explorer" } });
  let tree = app.render();
  assert.equal(card(tree, "explorer").props.sx.borderColor, "primary.main");
  button(tree, "Continue to checkout").props.onClick();
  tree = app.render();
  assert.equal(find(tree, n => n.type === "Dialog").props.open, true);
  assert.equal(app.requests.length, 0);
  await button(tree, "Continue to Stripe").props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(app.requests[0].interval, "annual");
});
test("checkout confirmation retains original price, revision and annual contract after tab/catalogue changes", async () => {
  const app = await harness();
  app.interval("annual");
  button(app.render(), "Choose Explorer").props.onClick();
  const dialog = text(find(app.render(), n => n.type === "DialogContent"));
  assert.match(dialog, /per year/);
  app.settings.plans = [free, { ...paid, revision: 8, annual_price: "120.00" }];
  app.interval("monthly");
  assert.equal(text(find(app.render(), n => n.type === "DialogContent")), dialog);
  button(app.render(), "Continue to Stripe").props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(plain(app.requests), [{ code: "explorer", revision: 7, interval: "annual" }]);
  assert.equal(app.destinations[0], "https://checkout.stripe.com/example");
});
test("in-flight checkout disables duplicate confirmation, and late billing restrictions still block submission", async () => {
  let finish;
  const pendingCheckout = new Promise(resolve => { finish = resolve; });
  const app = await harness({ pendingCheckout });
  button(app.render(), "Choose Explorer").props.onClick();
  button(app.render(), "Continue to Stripe").props.onClick();
  let tree = app.render();
  assert.equal(button(tree, "Continue to Stripe").props.disabled, true);
  button(tree, "Continue to Stripe").props.onClick();
  assert.equal(app.requests.length, 1);
  finish();
  await new Promise(resolve => setImmediate(resolve));
  const late = await harness();
  button(late.render(), "Choose Explorer").props.onClick();
  late.settings.billing.checkout_allowed = false;
  tree = late.render();
  assert.equal(button(tree, "Continue to Stripe").props.disabled, true);
  button(tree, "Continue to Stripe").props.onClick();
  assert.equal(late.requests.length, 0);
});
test("action failures keep recovery controls and do not leave a misleading open confirmation", async () => {
  const app = await harness({ checkoutFailure: true });
  button(app.render(), "Choose Explorer").props.onClick();
  button(app.render(), "Continue to Stripe").props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  const tree = app.render();
  assert.equal(find(tree, n => n.type === "Dialog").props.open, false);
  assert.ok(nodes(tree).some(n => n.type === "Alert" && n.props.severity === "error"));
  assert.equal(button(tree, "Review billing").props.to, "/radar/subscription");
  button(tree, "Retry").props.onClick();
  assert.deepEqual(app.refreshes, ["account", "catalogue"]);
});
test("enrolled paid and complimentary users retain the existing redirect", async () => {
  for (const access of [{ billing_type: "stripe" }, { mode: "complimentary" }]) {
    const tree = (await harness({ enrolment: true, access })).render();
    assert.equal(tree.type, "Navigate");
    assert.equal(tree.props.to, "/radar/subscription");
    assert.equal(tree.props.replace, true);
  }
});
test("loading and empty catalogues remain distinct; monthly rules and revision caveats are retained", async () => {
  assert.match(text((await harness({ plans: null })).render()), /Loading plans/);
  assert.match(text((await harness({ plans: [] })).render()), /No subscription plans are available/);
  const tree = (await harness()).render();
  const details = find(tree, n => n.props?.component === "details");
  assert.equal(details.props.open, undefined);
  assert.equal(details.props.children[0].props.component, "summary");
  assert.match(text(details), /monthly anniversary/);
  assert.match(text(details), /Unused allowance does not roll over/);
  assert.match(text(details), /purchased revision/);
  assert.match(text(tree), /not added to it/);
  assert.match(text(tree), /Scheduled runs use that same total/);
  assert.doesNotMatch(text(tree), /Most popular|unlimited|free trial/i);
});
