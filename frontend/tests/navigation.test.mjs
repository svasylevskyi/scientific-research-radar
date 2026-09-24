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
const workspaceRoutes = await load("../src/workspaceRoutes.ts");
const navigation = await load("../src/navigation.ts", { "./workspaceRoutes": workspaceRoutes });
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
  assert.equal(pageNavigation("/radar/digests/new").title, "Create a digest | Scientific Research Radar");
});

test("detail and editor pages identify their main-menu section without matching unrelated prefixes", () => {
  assert.equal(navigationCurrent("/radar/", "/radar"), "page");
  assert.equal(navigationCurrent("/radar/digests/example", "/radar"), "location");
  assert.equal(navigationCurrent("/admin/subscription-plans/explorer/edit", "/admin/subscription-plans"), "location");
  assert.equal(navigationCurrent("/admin/pricing/version/copy", "/admin/pricing"), "location");
  assert.equal(navigationCurrent("/admin/users/example", "/admin/users"), "location");
  assert.equal(navigationCurrent("/admin/users-other", "/admin/users"), undefined);
  assert.equal(navigationCurrent("/admin/digests/example", "/radar"), undefined);
  assert.equal(pageNavigation("/admin/billing-sync").admin, true);
  assert.equal(navigationCurrent("/radar/profile", "/radar/profile"), "page");
  assert.equal(navigationCurrent("/radar/plans", "/radar/subscription"), "location");
  assert.equal(navigationCurrent("/radar/register/plan", "/radar/subscription"), "location");
});

test("old user URLs resolve under Radar while public pages and every admin route retain their URLs", async () => {
  for (const path of ["/login", "/register", "/register/plan", "/forgot-password", "/reset-password", "/profile", "/subscription", "/digests/new", "/digests/example"]) {
    assert.equal(workspaceRoutes.radarPathname(path), `/radar${path}`);
  }
  assert.equal(workspaceRoutes.radarPathname("/digests/example/history"), "/radar/digests/example");
  assert.equal(workspaceRoutes.radarPathname("/radar/digests/example/history"), "/radar/digests/example");
  const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  const adminPaths = [...app.matchAll(/<Route\s+path="(\/admin\/[^"]+)"/g)].map((match) => match[1]);
  for (const path of ["/", "/plans", "/about", "/contact", "/privacy", "/terms", ...adminPaths]) {
    assert.equal(workspaceRoutes.radarPathname(path), path);
  }
});

test("legacy redirects preserve run selection, Stripe returns, reset-token fragments, and navigation state", async () => {
  let location;
  const { LegacyWorkspaceRedirect } = await load("../src/components/LegacyWorkspaceRedirect.tsx", {
    "../workspaceRoutes": workspaceRoutes,
    "react-router-dom": { Navigate: "Navigate", useLocation: () => location },
  });
  for (const [pathname, search, hash] of [
    ["/digests/example/history", "?run_id=chosen", "#papers"],
    ["/subscription", "?stripe_return=checkout", "#billing"],
    ["/reset-password", "", "#token=example-reset-token"],
  ]) {
    location = { pathname, search, hash, state: { scrollToTop: true } };
    const redirect = LegacyWorkspaceRedirect();
    assert.equal(redirect.props.to.pathname, workspaceRoutes.radarPathname(pathname));
    assert.equal(redirect.props.to.search, search);
    assert.equal(redirect.props.to.hash, hash);
    assert.equal(redirect.props.state, location.state);
    assert.equal(redirect.props.replace, true);
  }
});

test("sign-in guard retains the full destination for both Radar and admin deep links", async () => {
  let location;
  const { RequireAuth } = await load("../src/auth/RequireAuth.tsx", {
    "./AuthContext": { useAuth: () => ({ user: null, isInitializing: false }) },
    "react-router-dom": { Navigate: "Navigate", useLocation: () => location },
    "@mui/material": {},
  });
  for (const pathname of ["/radar/digests/example", "/radar/subscription", "/admin/digests/example/runs"]) {
    location = { pathname, search: "?run_id=chosen", hash: "#billing" };
    const redirect = RequireAuth({ children: null });
    assert.equal(redirect.props.to, "/radar/login");
    assert.equal(redirect.props.state.from, pathname + "?run_id=chosen#billing");
  }
});

test("session completion on the sign-in page uses the saved deep link instead of the dashboard", async () => {
  const destination = "/radar/subscription?stripe_return=checkout#billing";
  const { LoginPage } = await load("../src/pages/LoginPage.tsx", {
    "../auth/AuthContext": { useAuth: () => ({ user: { id: "signed-in" }, isInitializing: false }) },
    "../layouts/AuthLayout": { AuthLayout: "AuthLayout" },
    react: { useState: (value) => [value, () => {}] },
    "react-router-dom": {
      Navigate: "Navigate", useLocation: () => ({ state: { from: destination } }), useNavigate: () => () => {},
    },
    "@mui/material": {},
  });
  assert.equal(LoginPage().props.to, destination);
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
  page.navigate({ pathname: "/radar/subscription", state: { scrollToTop: true } });
  page.navigate({ pathname: "/radar/subscription", hash: "#billing", state: { preserveScroll: true } });
  page.navigate({ pathname: "/radar/subscription", hash: "#plans", state: { preserveScroll: true } });
  assert.equal(page.scrolls.length, 1);
  page.navigate({ pathname: "/radar/digests/example" });
  page.navigate({ pathname: "/radar/digests/example", search: "?run_id=second" });
  page.navigate({ pathname: "/radar/digests/example", search: "?run_id=third" });
  assert.equal(page.scrolls.length, 2);
});

test("explicit section links keep their own scroll behavior while global navigation clears the section", async () => {
  const page = await pageHarness();
  page.navigate({ pathname: "/radar/subscription", hash: "#upgrade" });
  assert.equal(page.scrolls.length, 0);
  assert.equal(page.document.title, "Subscription and usage | Scientific Research Radar");
  page.navigate({ pathname: "/radar/subscription", state: { scrollToTop: true } });
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
  const link = MainMenuLink.render({ to: "/radar/login", state: { from: "/radar" }, onClick }, null);
  assert.equal(link.props.to, "/radar/login");
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

function renderedElements(tree) {
  if (Array.isArray(tree)) return tree.flatMap(renderedElements);
  if (!tree || typeof tree !== "object" || !tree.props) return [];
  return [tree, ...renderedElements(tree.props.children)];
}

async function menuHarness(props) {
  let mobile = true, key = "first", cursor = 0;
  const slots = [], effects = [], previousDeps = [];
  let effectCursor = 0;
  const material = new Proxy({
    useTheme: () => ({ breakpoints: { down: (value) => { assert.equal(value, "lg"); return value; } } }),
    useMediaQuery: () => mobile,
  }, { get: (target, name) => target[name] ?? name });
  const { ResponsiveMainMenu } = await load("../src/components/ResponsiveMainMenu.tsx", {
    "@mui/material": material,
    "@mui/icons-material/MenuRounded": { default: "HamburgerIcon" },
    "../navigation": navigation,
    "./MainMenuLink": { MainMenuLink: "MainMenuLink", mainMenuItemSx: {} },
    "react-router-dom": { useLocation: () => ({ pathname: props.pathname ?? "/about", key }) },
    react: {
      useId: () => "example",
      useState: (initial) => {
        const index = cursor++;
        if (!(index in slots)) slots[index] = initial;
        return [slots[index], (value) => { slots[index] = value; }];
      },
      useEffect: (effect, deps) => {
        const index = effectCursor++;
        if (!previousDeps[index] || deps.some((value, i) => value !== previousDeps[index][i])) effects.push(effect);
        previousDeps[index] = deps;
      },
    },
  });
  return {
    render() {
      cursor = 0; effectCursor = 0;
      const tree = ResponsiveMainMenu(props);
      effects.splice(0).forEach((effect) => effect());
      return renderedElements(tree);
    },
    setMobile(value) { mobile = value; },
    navigate() { key = "second"; },
  };
}

test("public hamburger exposes all links, current page, and sign-in; selection and dismissal close it", async () => {
  const menu = await menuHarness({ label: "Main navigation", items: [
    { label: "Plans", to: "/plans" }, { label: "About", to: "/about" }, { label: "Contact", to: "/contact" },
  ], accountItems: [{ label: "Sign in to Radar", to: "/radar/login", state: { from: "/radar" } }] });
  const open = () => menu.render().find((element) => element.type === "IconButton").props.onClick({ currentTarget: "button" });
  open();
  let elements = menu.render();
  assert.equal(elements.find((element) => element.type === "Menu").props.open, true);
  const items = elements.filter((element) => element.type === "MenuItem");
  assert.deepEqual(items.map((item) => item.props.children), ["Plans", "About", "Contact", "Sign in to Radar"]);
  assert.equal(items[1].props["aria-current"], "page");
  assert.equal(items[3].props.state.from, "/radar");
  items[0].props.onClick();
  assert.equal(menu.render().find((element) => element.type === "Menu").props.open, false);
  open();
  elements = menu.render();
  elements.find((element) => element.type === "Menu").props.onClose();
  assert.equal(menu.render().find((element) => element.type === "Menu").props.open, false);
});

test("workspace menu remains text-only with ordered admin links and closes across route and breakpoint changes", async () => {
  let signedOut = false;
  const menu = await menuHarness({ label: "Workspace navigation", pathname: "/admin/users", items: [
    { label: "Workspace", to: "/radar" },
    { label: "Subscription and usage", shortLabel: "Subscription", to: "/radar/subscription" },
    { label: "Contact", to: "/radar/contact" },
  ], adminItems: [
    { label: "Users", to: "/admin/users" }, { label: "Digests", to: "/admin/digests" },
    { label: "Plans", to: "/admin/subscription-plans" }, { label: "Pricing", to: "/admin/pricing" },
    { label: "Messages", to: "/admin/messages" },
  ], accountItems: [{ label: "Profile", to: "/radar/profile" }, { label: "Sign out", onClick: () => { signedOut = true; } }] });
  let elements = menu.render();
  const items = elements.filter((element) => element.type === "MenuItem");
  assert.deepEqual(items.map((item) => item.props.children), ["Workspace", "Subscription and usage", "Contact", "Users", "Digests", "Plans", "Pricing", "Messages", "Profile", "Sign out"]);
  items.at(-1).props.onClick();
  assert.equal(signedOut, true);
  elements.find((element) => element.type === "IconButton").props.onClick({ currentTarget: "button" });
  menu.navigate(); menu.render();
  assert.equal(menu.render().find((element) => element.type === "Menu").props.open, false);
  menu.setMobile(false); menu.render();
  elements = menu.render();
  assert.equal(elements.some((element) => element.type === "IconButton" || element.type === "HamburgerIcon"), false);
  const buttons = elements.filter((element) => element.type === "Button");
  assert.deepEqual(buttons.map((element) => element.props.children), ["Workspace", "Subscription", "Contact", "Admin", "Profile", "Sign out"]);
  assert.ok(buttons.every((button) => !button.props.startIcon && !button.props.endIcon));
  buttons.find((button) => button.props.children === "Admin").props.onClick({ currentTarget: "admin" });
  assert.equal(menu.render().find((element) => element.type === "Menu").props.open, true);
  menu.setMobile(true); menu.render();
  menu.setMobile(false); menu.render();
  assert.equal(menu.render().find((element) => element.type === "Menu").props.open, false);
});
