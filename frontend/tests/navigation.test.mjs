import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
async function load(path, dependencies = {}, globals = {}) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  });
  const module = { exports: {} };
  runInNewContext(outputText, {
    ...globals, module, exports: module.exports,
    require: (name) => dependencies[name] ?? require(name),
  });
  return module.exports;
}
const navigation = await load("../src/navigation.ts");
const { pageNavigation, navigationCurrent } = navigation;

test("every declared route has a meaningful browser title", async () => {
  const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  const paths = [...app.matchAll(/<Route\s+path="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(paths.length > 30);
  for (const pattern of paths.filter((path) => path !== "*")) {
    const path = pattern.replace(/:[^/]+/g, "example-id");
    const { title } = pageNavigation(path);
    assert.match(title, / \| Scientific Research Radar$/, path);
    assert.doesNotMatch(title, /Page not found/, path);
    if (path !== "/") assert.doesNotMatch(title, /^Home \|/, path);
  }
  assert.equal(pageNavigation("/digests/new").title, "Create a digest | Scientific Research Radar");
});

test("detail and editor pages identify their main-menu section without matching unrelated prefixes", () => {
  assert.equal(navigationCurrent("/radar/", "/radar"), "page");
  assert.equal(navigationCurrent("/digests/example", "/radar"), "location");
  assert.equal(navigationCurrent("/admin/subscription-plans/explorer/edit", "/admin/subscription-plans"), "location");
  assert.equal(navigationCurrent("/admin/pricing/version/copy", "/admin/pricing"), "location");
  assert.equal(navigationCurrent("/admin/users/example", "/admin/users"), "location");
  assert.equal(navigationCurrent("/admin/users-other", "/admin/users"), undefined);
  assert.equal(navigationCurrent("/admin/digests/example", "/radar"), undefined);
  assert.equal(pageNavigation("/admin/billing-sync").admin, true);
});

async function pageHarness() {
  const document = { title: "" };
  const scrolls = [];
  let location = { pathname: "/", hash: "", key: "initial", state: null };
  let navigationType = "POP";
  let commit;
  let previous;
  const { PageNavigation } = await load("../src/components/PageNavigation.tsx", {
    "../navigation": navigation,
    react: {
      useRef: (value) => previous ??= { current: value },
      useLayoutEffect: (effect) => { commit = effect; },
    },
    "react-router-dom": {
      useLocation: () => location,
      useNavigationType: () => navigationType,
    },
  }, {
    document,
    window: { scrollTo: (options) => scrolls.push({ ...options }) },
  });
  const render = () => {
    assert.equal(PageNavigation(), null); // No skip link or focus target is rendered.
    commit();
  };
  render();
  return {
    document, scrolls, render,
    navigate(next, type = "PUSH") {
      location = { pathname: "/", hash: "", state: null, key: crypto.randomUUID(), ...next };
      navigationType = type;
      render();
    },
  };
}

test("global navigation opens at the page top and reselecting the current page does too", async () => {
  const page = await pageHarness();
  assert.equal(page.scrolls.length, 0);
  page.navigate({ pathname: "/radar", state: { scrollToTop: true } });
  assert.equal(page.document.title, "Your workspace | Scientific Research Radar");
  assert.deepEqual(page.scrolls, [{ top: 0, left: 0, behavior: "instant" }]);
  page.render();
  assert.equal(page.scrolls.length, 1); // Background rendering does not repeat navigation.
  page.navigate({ pathname: "/radar", state: { scrollToTop: true } });
  assert.equal(page.scrolls.length, 2);
});

test("tabs, run selection, and query filters do not reset page position", async () => {
  const page = await pageHarness();
  page.navigate({ pathname: "/subscription", state: { scrollToTop: true } });
  page.navigate({ pathname: "/subscription", hash: "#billing", state: { preserveScroll: true } });
  page.navigate({ pathname: "/subscription", hash: "#plans", state: { preserveScroll: true } });
  assert.equal(page.scrolls.length, 1);
  page.navigate({ pathname: "/digests/example" });
  page.navigate({ pathname: "/digests/example", search: "?run_id=second" });
  page.navigate({ pathname: "/digests/example", search: "?run_id=third" });
  assert.equal(page.scrolls.length, 2);
});

test("explicit section links keep their own scroll behavior while global navigation clears the section", async () => {
  const page = await pageHarness();
  page.navigate({ pathname: "/subscription", hash: "#upgrade" });
  assert.equal(page.scrolls.length, 0);
  assert.equal(page.document.title, "Subscription and usage | Scientific Research Radar");
  page.navigate({ pathname: "/subscription", state: { scrollToTop: true } });
  assert.equal(page.scrolls.length, 1);
});

test("browser history retains native scroll restoration and updates the title", async () => {
  const page = await pageHarness();
  page.navigate({ pathname: "/about", state: { scrollToTop: true } });
  page.navigate({ pathname: "/contact", state: { scrollToTop: true } });
  page.navigate({ pathname: "/about", state: { scrollToTop: true } }, "POP");
  assert.equal(page.scrolls.length, 2);
  assert.equal(page.document.title, "About Radar | Scientific Research Radar");
});

test("main-menu links retain router behavior and existing state while requesting the page top", async () => {
  const { MainMenuLink, mainMenuItemSx } = await load("../src/components/MainMenuLink.tsx");
  const onClick = () => {};
  const link = MainMenuLink.render({ to: "/login", state: { from: "/radar" }, onClick }, null);
  assert.equal(link.props.to, "/login");
  assert.equal(link.props.onClick, onClick);
  assert.equal(link.props.state.from, "/radar");
  assert.equal(link.props.state.scrollToTop, true);
  // The active style may change backgrounds only, including its hover treatment.
  const styles = JSON.parse(JSON.stringify(mainMenuItemSx));
  assert.deepEqual(Object.keys(styles["&[aria-current]"]).sort(), ["&:hover", "bgcolor"]);
  assert.deepEqual(Object.keys(styles["&[aria-current]"]["&:hover"]), ["bgcolor"]);
});

test("subscription tab selection leaves focus and scroll alone, but section links still reveal their target", async () => {
  let location = { hash: "", search: "?checkout=returned", state: null };
  let effect;
  let requested;
  const scrolls = [], focusCalls = [];
  // Render component element trees without mounting the unrelated billing panels.
  const components = new Proxy({}, { get: (_, name) => name });
  const dependencies = new Proxy({
    react: { useEffect: (callback) => { effect = callback; } },
    "@mui/material": components,
    "react-router-dom": {
      Link: "Link",
      useLocation: () => location,
      useNavigate: () => (to, options) => { requested = { to, options }; },
    },
    "../auth/AuthContext": { useAuth: () => ({ user: { id: "example" } }) },
    "../components/SubscriptionData": {
      SubscriptionData: "SubscriptionData",
      useSubscription: () => ({ access: { billing_type: "free" }, notices: [], upgrades: {}, changes: {} }),
    },
    "../components/SubscriptionOverview": {
      SubscriptionOverview: "SubscriptionOverview",
      subscriptionDate: () => "Not applicable",
    },
    "../subscriptionPresentation": await load("../src/subscriptionPresentation.ts"),
  }, { get: (target, name) => target[name] ?? (name.startsWith(".") ? components : undefined) });
  const { SubscriptionAccessPage } = await load("../src/pages/SubscriptionAccessPage.tsx", dependencies, {
    document: {
      getElementById: (id) => ({
        scrollIntoView: () => scrolls.push(id),
        focus: () => focusCalls.push(id),
      }),
    },
  });
  function find(element, predicate) {
    if (!element || typeof element !== "object") return;
    if (predicate(element)) return element;
    const children = [].concat(element.props?.children ?? element);
    for (const child of children) {
      if (child === element) continue;
      const found = find(child, predicate);
      if (found) return found;
    }
  }
  const sections = find(SubscriptionAccessPage({}), (element) => element.type?.name === "SubscriberSections");
  assert.ok(sections);
  const tabs = find(sections.type(), (element) => element.type === "Tabs");
  effect();
  tabs.props.onChange(null, "billing");
  assert.equal(requested.to.search, "?checkout=returned");
  assert.equal(requested.options.preventScrollReset, true);
  location = { ...requested.to, state: requested.options.state };
  sections.type();
  effect();
  assert.equal(scrolls.length, 0);
  assert.equal(focusCalls.length, 0);
  // A direct link to the same selected section must still work after a tab click.
  location = { ...location, state: null };
  sections.type();
  effect();
  assert.deepEqual(scrolls, ["billing"]);
  assert.deepEqual(focusCalls, ["billing"]);
});
