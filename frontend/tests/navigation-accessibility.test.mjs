import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

async function load(path) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
}

const { pageNavigation, navigationCurrent } = await load("../src/navigation.ts");
const { schedulePageFocus, focusMainContent } = await load("../src/pageFocus.ts");

test("every declared page has a specific browser title, including parameterized routes", async () => {
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
});

test("editor and detail pages retain the correct section without matching unrelated prefixes", () => {
  assert.equal(pageNavigation("/digests/new").title, "Create a digest | Scientific Research Radar");
  assert.equal(pageNavigation("/admin/users/example").title, "User details · Admin | Scientific Research Radar");
  assert.equal(navigationCurrent("/radar/", "/radar"), "page");
  assert.equal(navigationCurrent("/digests/example", "/radar"), "location");
  assert.equal(navigationCurrent("/admin/subscription-plans/explorer/edit", "/admin/subscription-plans"), "location");
  assert.equal(navigationCurrent("/admin/pricing/version/copy", "/admin/pricing"), "location");
  assert.equal(navigationCurrent("/admin/users/example", "/admin/users"), "location");
  assert.equal(navigationCurrent("/admin/users-other", "/admin/users"), undefined);
  assert.equal(navigationCurrent("/admin/digests/example", "/radar"), undefined);
  assert.equal(pageNavigation("/admin/billing-sync").admin, true);
  assert.equal(pageNavigation("/subscription").admin, false);
});

function element() {
  return {
    tabIndex: undefined,
    focusCalls: [],
    scrollCalls: [],
    focus(options) { this.focusCalls.push(options); },
    scrollIntoView(options) { this.scrollCalls.push(options); },
  };
}

function environment(t) {
  const frames = new Map(), listeners = new Map(), observers = new Set();
  let frameId = 0;
  const heading = element();
  const main = {
    ...element(),
    heading,
    pending: false,
    querySelector(selector) { assert.equal(selector, "h1"); return this.heading; },
    hasAttribute(name) { return name === "data-navigation-pending" && this.pending; },
  };
  const root = {};
  const env = {
    main, heading, frames, listeners, observers,
    frame() {
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach((callback) => callback());
    },
    mutate() { for (const observer of observers) observer.callback(); },
    interact(type) { for (const callback of listeners.get(type) ?? []) callback(); },
  };
  const globals = {
    document: {
      getElementById(id) { return id === "main-content" ? env.main : id === "page-content" ? root : null; },
      addEventListener(type, callback) {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type).add(callback);
      },
      removeEventListener(type, callback) { listeners.get(type)?.delete(callback); },
    },
    requestAnimationFrame(callback) { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame(id) { frames.delete(id); },
    MutationObserver: class {
      constructor(callback) { this.callback = callback; }
      observe(target) { assert.equal(target, root); observers.add(this); }
      disconnect() { observers.delete(this); }
    },
  };
  for (const [key, value] of Object.entries(globals)) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    t.after(() => {
      if (previous) Object.defineProperty(globalThis, key, previous);
      else delete globalThis[key];
    });
  }
  return env;
}

test("route focus reaches the primary heading once and stops observing background updates", (t) => {
  const env = environment(t);
  schedulePageFocus();
  assert.equal(env.heading.focusCalls.length, 0);
  env.frame();
  assert.equal(env.heading.tabIndex, -1);
  assert.deepEqual(env.heading.focusCalls, [{ preventScroll: true }]);
  assert.deepEqual(env.heading.scrollCalls, [{ block: "start", behavior: "instant" }]);
  assert.equal(env.observers.size, 0);
  assert.ok([...env.listeners.values()].every((callbacks) => callbacks.size === 0));
  env.mutate();
  env.frame();
  assert.equal(env.heading.focusCalls.length, 1);
});

test("pages without a ready heading focus the stable main landmark", (t) => {
  const env = environment(t);
  env.main.heading = null;
  schedulePageFocus();
  env.frame();
  assert.equal(env.main.focusCalls.length, 1);
  assert.equal(env.main.tabIndex, -1);
});

test("navigation waits for the page to replace the session-restoration placeholder", (t) => {
  const env = environment(t);
  const main = env.main;
  env.main = null;
  schedulePageFocus();
  env.frame();
  main.pending = true;
  env.main = main;
  env.mutate();
  env.frame();
  assert.equal(env.heading.focusCalls.length, 0);
  env.main = { ...main, pending: false };
  env.mutate();
  env.frame();
  assert.equal(env.heading.focusCalls.length, 1);
});

for (const event of ["pointerdown", "keydown"]) {
  test(`${event} while a page loads cancels focus so interaction is not interrupted`, (t) => {
    const env = environment(t);
    env.main.pending = true;
    schedulePageFocus();
    env.frame();
    env.interact(event);
    env.main.pending = false;
    env.mutate();
    env.frame();
    assert.equal(env.heading.focusCalls.length, 0);
    assert.equal(env.observers.size, 0);
  });
}

test("rapid navigation cancels obsolete work and focuses only the latest page", (t) => {
  const env = environment(t);
  const cancel = schedulePageFocus();
  cancel();
  const latest = element();
  env.main.heading = latest;
  schedulePageFocus();
  env.frame();
  assert.equal(env.heading.focusCalls.length, 0);
  assert.equal(latest.focusCalls.length, 1);
  assert.equal(env.frames.size, 0);
});

test("skip navigation focuses main directly and tolerates a redirect with no content yet", (t) => {
  const env = environment(t);
  assert.equal(focusMainContent(), true);
  assert.deepEqual(env.main.focusCalls, [{ preventScroll: true }]);
  assert.equal(env.heading.focusCalls.length, 0);
  env.main = null;
  assert.equal(focusMainContent(), false);
});
