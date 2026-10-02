import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// Component and URL-state regressions with isolated React/router/API doubles.
// Actual browser layout, keyboard and navigation acceptance is separate.
const jsx = (type, props, key) => ({ type, props: props ?? {}, key });
const mui = new Proxy({}, { get: (_, name) => name });
const noop = () => {};
async function load(path, deps = {}, globals = {}) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const output = ts.transpileModule(source, { fileName: path, reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } });
  assert.deepEqual(output.diagnostics, [], path);
  const module = { exports: {} };
  runInNewContext(output.outputText, { module, exports: module.exports, URLSearchParams, Date, AbortController,
    ...globals, require(name) {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
      if (name === "@mui/material") return mui;
      if (name.startsWith("@mui/icons-material/")) return { default: "Icon" };
      if (name in deps) return deps[name];
      throw Error(`Unprovided dependency: ${name}`);
    } });
  return module.exports;
}
function nodes(node) {
  if (Array.isArray(node)) return node.flatMap(nodes);
  return node && typeof node === "object" ? [node, ...nodes(node.props?.children)] : [];
}
function text(node) {
  if (Array.isArray(node)) return node.map(text).join(" ");
  if (node == null || typeof node === "boolean") return "";
  return typeof node === "object" ? text(node.props?.children) : String(node);
}
function find(tree, predicate) { const result = nodes(tree).find(predicate); assert.ok(result, "Expected node"); return result; }
const button = (tree, label) => find(tree, n => n.type === "Button" && text(n).trim() === label);
const component = (tree, type) => find(tree, n => n.type === type);
const nav = await load("../src/navigationContext.ts");
const history = await load("../src/runHistory.ts");
const { DigestRunDetails } = await load("../src/components/DigestRunDetails.tsx", { "react-router-dom": { Link: "RouterLink" } });
const snapshot = { topic: "Historic topic", description: "Old description", include_keywords: ["alpha", "beta"],
  exclude_keywords: ["noise"], target_audience: ["researchers", "general"], reporting_from: "2026-08-01",
  reporting_to: "2026-08-15", maximum_papers: 12, owner_id: "NOT PUBLIC", id: "NOT A SETTING" };
const run = (id = "r1", overrides = {}) => ({ id, digest_id: "d1", status: "completed", started_at: "2026-09-01T10:00:00Z",
  digest_snapshot: snapshot, briefing: { title: "Briefing" }, trend_analysis: null, search_data: null, relevance_data: null,
  paper_results: [], ...overrides });
const digest = { id: "d1", owner_id: "u1", topic: "Current topic", description: "Current description", include_keywords: ["new"],
  exclude_keywords: [], target_audience: ["general"], reporting_from: "2026-09-01", reporting_to: "2026-09-15", maximum_papers: 20,
  updated_at: "2026-09-20T10:00:00Z", schedule: null, schedule_next_at: null, schedule_exhausted: false };
const formValues = value => ({ topic: value.topic });

function hooks() {
  const slots = []; let cursor = 0, effects = [], dirty = false;
  const events = [];
  const react = {
    useId: () => "digest-page-test",
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial;
      return [slots[i], next => { const value = typeof next === "function" ? next(slots[i]) : next;
        if (!Object.is(value, slots[i])) dirty = true; slots[i] = value; }]; },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useCallback: fn => fn,
    useEffect(fn, deps) { const i = cursor++; if (!slots[i] || deps.some((v, p) => !Object.is(v, slots[i].deps[p])))
      effects.push(() => { slots[i]?.cleanup?.(); slots[i] = { deps, cleanup: fn() }; }); },
  };
  return { react, events, render(fn) {
    let tree;
    for (let count = 0; count < 5; count++) {
      cursor = 0; effects = []; dirty = false; tree = fn();
      for (const n of nodes(tree)) if (n.props?.ref && "current" in n.props.ref) n.props.ref.current = {
        focus: () => events.push(["focus", n.props.label ?? text(n)]), scrollIntoView: () => events.push(["scroll", text(n)]),
      };
      effects.forEach(effect => effect()); if (!dirty) return tree;
    }
    throw Error("State did not settle");
  } };
}

async function workspace(query = "output_tab=details", admin = false) {
  const runtime = hooks();
  const router = { search: new URLSearchParams(query), options: null };
  const resource = { data: null, loading: false, error: "", refresh: async () => {} };
  const props = { admin, digestId: "d1", runs: [run()], latestRun: run(), runBlocked: false, onRetry: async () => {}, onUpdate: noop, visible: true };
  const { DigestWorkspace } = await load("../src/components/DigestWorkspace.tsx", {
    react: runtime.react, "react-router-dom": { useSearchParams: () => [router.search, (update, options) => {
      router.search = update(router.search); router.options = options;
    }] }, "../api/client": { ApiError: Error }, "../api/digests": {},
    "../auth/AuthContext": { useAuth: () => ({ user: { id: "u1" } }) },
    "../runHistory": history, "../navigationContext": nav, "../hooks/usePollingResource": { usePollingResource: () => resource },
    ...Object.fromEntries(["ResourceNotice", "RetryRunButton", "DigestRunFeedback", "DigestRunProgress", "AdminRunDiagnostics", "SelectedRunOverview", "DigestRunDetails"]
      .map(name => [`./${name}`, { [name]: name }])),
    "./DigestRunResults": { DigestBriefingResult: "DigestBriefingResult", PaperSummariesResult: "PaperSummariesResult", TrendAnalysisResult: "TrendAnalysisResult" },
  }, { document: { getElementById: id => ({ focus: () => runtime.events.push(["focus", id]) }) } });
  return { runtime, router, resource, props, render: () => runtime.render(() => DigestWorkspace(props)) };
}

async function page({ query = "", admin = false, historyRuns = [run()], active = null, saved = digest } = {}) {
  const runtime = hooks(); let serial = 0;
  const router = { search: new URLSearchParams(query), state: null, key: "initial", options: null, digestId: saved.id };
  const requests = [], pollers = [], loaders = [];
  const frames = new Map(); let nextFrame = 0;
  const browser = {
    requestAnimationFrame(callback) { const id = ++nextFrame; frames.set(id, callback); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
    scrollTo(options) { runtime.events.push(["windowScroll", { ...options }]); },
  };
  function flushFrames() { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn()); }
  const access = { data: { run_allowed: true, paper_limit: 30, plan: null }, error: "", loading: false };
  const initial = { data: { digestResult: saved, history: historyRuns, accountActiveRun: active,
    latest: active?.digest_id === saved.id ? active : historyRuns[0] ?? null }, loading: false, error: "", refresh: async () => {} };
  const api = {
    async update(id, body) { requests.push(["update", id, body]); return { ...saved, ...body, updated_at: "2026-09-22T00:00:00Z" }; },
    async delete(id) { requests.push(["delete", id]); },
    async get() { return { ...saved, schedule: null }; },
  };
  const runApi = {
    async active() { return active; },
    async get(_id, runId) { return historyRuns.find(r => r.id === runId); },
    async runNow(id) { requests.push(["runNow", id]); return run("new-run", { status: "queued", briefing: null }); },
    async retry(id, runId) { requests.push(["retry", id, runId]); return run(runId, { status: "running", briefing: null }); },
  };
  const { DigestDetailPage } = await load("../src/pages/DigestDetailPage.tsx", {
    react: runtime.react,
    "react-router-dom": {
      Link: "RouterLink", useParams: () => ({ digestId: router.digestId }), useNavigate: () => path => requests.push(["navigate", path]),
      useLocation: () => ({ state: router.state, key: router.key, pathname: `/radar/digests/${router.digestId}`, search: router.search.toString() }),
      useSearchParams: () => [router.search, (update, options) => { router.search = update(router.search); router.options = options; router.key = `nav-${++serial}`; router.state = null; }],
    },
    "../api/client": { ApiError: Error }, "../api/digests": { digestsApi: api, adminDigestsApi: api, digestRunsApi: runApi },
    "../hooks/useSubscriptionAccess": { useSubscriptionAccess: () => access },
    "../hooks/usePollingResource": { usePollingResource: loader => { loaders.push(loader); return initial; } },
    "../pagePolling": { startPagePolling: fn => { pollers.push(fn); return noop; } }, "../runHistory": history, "../navigationContext": nav,
    "../components/DigestForm": { DigestForm: "DigestForm", digestToFormValues: formValues },
    ...Object.fromEntries(["ResourceNotice", "AdminDigestNavigation", "AllowanceNotice", "DigestScheduleControl", "AppHeader", "DigestWorkspace"]
      .map(name => [`../components/${name}`, { [name]: name }])),
  }, { window: browser });
  return { runtime, router, initial, requests, api, pollers, loaders, flushFrames, frames,
    render: () => runtime.render(() => DigestDetailPage({ admin })) };
}
const pageTabs = tree => find(tree, n => n.type === "Tabs" && n.props["aria-label"] === "Digest page sections");
const panel = (tree, value) => find(tree, n => n.props.id === `digest-page-test-panel-${value}`);

for (const query of ["", "digest_tab=unknown", "output_tab=details", "run_id=historic&output_tab=details"]) {
  test(`page defaults to output; old run-detail URL stays run-scoped: ${query || "bare URL"}`, () => {
    assert.equal(nav.digestPageTab(new URLSearchParams(query)), "output");
  });
}
test("page-tab links pin the run and preserve source targets, history and list context", () => {
  const old = new URLSearchParams("output_tab=details&run_from=2026-08-01&run_failed=1&paper_id=p1&paper_run_id=r1&return_to=%2Fradar%3Fpage%3D3");
  const next = nav.digestPageQuery(old, "details", "r1");
  assert.equal(nav.digestPageTab(next), "details"); assert.equal(next.get("run_id"), "r1");
  for (const [key, value] of old) assert.equal(next.get(key), value);
  assert.equal(old.has("digest_tab"), false);
  assert.equal(nav.digestPageQuery(next, "output").get("output_tab"), "details");
  assert.equal(nav.paperQuery(next, "r1", "p2").get("digest_tab"), "output");
});
test("snapshot uses only the selected saved fields, never defaults or internal metadata", () => {
  const tree = DigestRunDetails({ run: run(), settingsHref: "/radar/digests/d1?digest_tab=details&run_id=r1" });
  for (const value of ["Historic topic", "Old description", "alpha, beta", "noise", "Researchers, General audience", "2026-08-01", "2026-08-15", "12"]) assert.ok(text(tree).includes(value));
  assert.doesNotMatch(text(tree), /Current topic|NOT PUBLIC|NOT A SETTING/);
  assert.equal(nodes(tree).some(n => ["DigestForm", "TextField", "Select", "KeywordInput"].includes(n.type) || n.props.component === "form"), false);
  assert.equal(button(tree, "Edit current digest details").props.state.focusDigestSettingsFor, "d1");
});
for (const raw of [null, undefined, {}, [], "malformed"]) {
  test(`missing or invalid snapshots do not substitute current configuration: ${JSON.stringify(raw)}`, () => {
    const tree = DigestRunDetails({ run: run("old", { digest_snapshot: raw }), settingsHref: "settings" });
    assert.match(text(tree), /No saved digest settings are available/); assert.match(text(tree), /Not recorded/);
    assert.ok(button(tree, "Edit current digest details"));
  });
}
test("explicit empty fields are distinct from missing values, and unknown saved audience stays visible", () => {
  const tree = DigestRunDetails({ run: run("old", { digest_snapshot: { description: null, include_keywords: [],
    target_audience: ["new_scientific_audience"], maximum_papers: 0, frequency: "weekly" } }), settingsHref: "settings" });
  assert.match(text(tree), /None/); assert.match(text(tree), /Not recorded/); assert.match(text(tree), /new_scientific_audience/);
  assert.match(text(tree), /Legacy frequency \(saved\)/);
});
test("invalid saved lists/numbers are labelled rather than defaulted", () => {
  const tree = DigestRunDetails({ run: run("old", { digest_snapshot: { include_keywords: [42], target_audience: {}, maximum_papers: "20" } }), settingsHref: "settings" });
  assert.match(text(tree), /Not recorded/); assert.doesNotMatch(text(tree), /General audience/);
});
test("workspace read-only details track the selected run and link to the separate live editor", async () => {
  const view = await workspace("run_id=r1&output_tab=details&run_from=2026-08-01&run_failed=1&return_to=%2Fradar%3Fpage%3D4");
  const saved = component(view.render(), "DigestRunDetails");
  assert.equal(saved.props.run, view.props.latestRun);
  const url = new URL(saved.props.settingsHref, "https://radar.example");
  assert.equal(url.searchParams.get("digest_tab"), "details"); assert.equal(url.searchParams.get("run_id"), "r1");
  assert.equal(url.searchParams.get("output_tab"), "details"); assert.equal(url.searchParams.get("run_failed"), "1");
  assert.equal(url.searchParams.get("return_to"), "/radar?page=4");
  view.router.search.set("run_id", "older"); view.resource.loading = true;
  assert.equal(nodes(view.render()).some(n => n.type === "DigestRunDetails"), false);
  view.resource.loading = false; view.resource.error = "offline";
  assert.match(text(view.render()), /Saved settings are unavailable/);
  view.resource.data = run("older", { digest_snapshot: { topic: "Earlier snapshot" } }); view.resource.error = "";
  assert.equal(component(view.render(), "DigestRunDetails").props.run.digest_snapshot.topic, "Earlier snapshot");
});
test("admin keeps its existing run tabs and does not receive an editable form or a user snapshot link", async () => {
  const view = await workspace("output_tab=details&run_section=output", true);
  const tree = view.render(); assert.equal(nodes(tree).some(n => n.type === "DigestRunDetails"), false);
  assert.equal(nodes(tree).some(n => n.type === "Tab" && n.props.value === "details"), false);
});
test("hidden output cannot focus a paper or a former run tab during polling", async () => {
  const view = await workspace("output_tab=papers&run_id=r1&paper_run_id=r1&paper_id=p1");
  view.props.latestRun.search_data = {}; view.props.visible = false;
  assert.equal(component(view.render(), "PaperSummariesResult").props.targetPaperId, null);
  view.router.search.set("output_tab", "details"); view.render(); assert.equal(view.runtime.events.length, 0);
});
test("user gets linked page tabs; live editor is centered and retained while output is default", async () => {
  const view = await page(); let tree = view.render();
  assert.equal(pageTabs(tree).props.value, "output"); assert.equal(panel(tree, "details").props.hidden, true);
  assert.equal(panel(tree, "output").props.hidden, false);
  for (const n of nodes(pageTabs(tree)).filter(n => n.type === "Tab")) {
    const p = find(tree, node => node.props.id === n.props["aria-controls"]);
    assert.equal(p.props.role, "tabpanel"); assert.equal(p.props["aria-labelledby"], n.props.id);
  }
  const initialForm = component(tree, "DigestForm");
  assert.equal(initialForm.props.initialValues.topic, "Current topic"); assert.equal(initialForm.props.visible, false);
  assert.equal(component(tree, "DigestWorkspace").props.details, undefined);
  assert.ok(nodes(panel(tree, "details")).some(n => n.props.sx?.maxWidth === 960 && n.props.sx.mx === "auto"));
  pageTabs(tree).props.onChange(null, "details"); tree = view.render();
  assert.equal(component(tree, "DigestForm").key, initialForm.key); assert.equal(component(tree, "DigestForm").props.visible, true);
  assert.equal(component(tree, "DigestWorkspace").props.visible, false);
  assert.equal(view.router.search.get("run_id"), "r1"); assert.equal(view.requests.length, 0);
});
for (const status of ["queued", "running", "failed"]) {
  test(`no successful run is required for output/history and saved snapshot views: ${status}`, async () => {
    const view = await page({ historyRuns: [run("first", { status, briefing: null })] });
    const tree = view.render(); assert.equal(pageTabs(tree).props.value, "output");
    assert.equal(component(tree, "DigestWorkspace").props.runs[0].status, status);
    assert.equal(nodes(tree).some(n => n.type === "Tabs" && /Latest radar run/.test(n.props["aria-label"])), false);
  });
}
test("new digest defaults to a truthful output empty state, not an editable run-scoped form", async () => {
  const view = await page({ historyRuns: [] }); const tree = view.render();
  assert.match(text(panel(tree, "output")), /No research runs yet/);
  assert.equal(nodes(panel(tree, "output")).some(n => n.type === "DigestForm"), false);
  assert.equal(panel(tree, "details").props.hidden, true); assert.equal(view.requests.length, 0);
  assert.equal(new URL(button(tree, "Edit current digest details").props.to, "https://radar.example").searchParams.get("digest_tab"), "details");
});
test("old-run deep links, reload and Back/Forward preserve both levels of selection", async () => {
  const query = "run_id=old&output_tab=details&run_failed=1&return_to=%2Fradar%3Fpage%3D2";
  const view = await page({ query }); let tree = view.render(); assert.equal(pageTabs(tree).props.value, "output");
  pageTabs(tree).props.onChange(null, "details"); const settingsURL = view.router.search.toString();
  assert.equal(view.router.search.get("run_id"), "old"); assert.equal(view.router.search.get("output_tab"), "details");
  const reloaded = await page({ query: settingsURL }); assert.equal(pageTabs(reloaded.render()).props.value, "details");
  view.router.search = new URLSearchParams(query); assert.equal(pageTabs(view.render()).props.value, "output");
  view.router.search = new URLSearchParams(settingsURL); assert.equal(pageTabs(view.render()).props.value, "details");
  assert.equal(view.router.search.get("return_to"), "/radar?page=2");
});
test("saving live settings never alters the selected run and never starts research", async () => {
  const old = run("old"); const view = await page({ query: "digest_tab=details&run_id=old&output_tab=details", historyRuns: [old] });
  const before = JSON.stringify(old);
  await component(view.render(), "DigestForm").props.onSubmit({ topic: "Updated topic" });
  const tree = view.render(); assert.equal(component(tree, "DigestForm").props.initialValues.topic, "Updated topic");
  assert.equal(JSON.stringify(old), before); assert.equal(view.router.search.get("run_id"), "old");
  assert.deepEqual(view.requests.map(r => r[0]), ["update"]);
  assert.equal(pageTabs(tree).props.value, "details");
});
test("save failure keeps form identity and reports its error; tab changes do not submit", async () => {
  const view = await page({ query: "digest_tab=details" }); const before = component(view.render(), "DigestForm");
  view.api.update = async () => { throw Error("Save unavailable"); };
  await before.props.onSubmit({ topic: "Draft" }); let tree = view.render();
  assert.equal(component(tree, "DigestForm").key, before.key);
  assert.equal(component(tree, "DigestForm").props.submitNotice.severity, "error");
  pageTabs(tree).props.onChange(null, "output"); tree = view.render(); pageTabs(tree).props.onChange(null, "details");
  assert.equal(component(view.render(), "DigestForm").key, before.key); assert.equal(view.requests.length, 0);
});
test("new run and retry deliberately reveal progress in output without stale paper targeting", async () => {
  const view = await page({ query: "digest_tab=details&output_tab=details&paper_id=p&paper_run_id=old&return_to=%2Fradar%3Fpage%3D2" });
  const tree = view.render(); const dialog = find(tree, n => n.type === "Dialog" && n.props["aria-labelledby"] === "confirm-run-title");
  button(dialog, "Run now").props.onClick(); await new Promise(resolve => setImmediate(resolve)); view.render();
  assert.equal(view.router.search.get("digest_tab"), "output"); assert.equal(view.router.search.get("run_id"), "new-run");
  assert.equal(view.router.search.get("output_tab"), "steps"); assert.equal(view.router.search.has("paper_id"), false);
  assert.equal(view.router.search.get("return_to"), "/radar?page=2");
  const retryView = await page({ query: "digest_tab=details" });
  await component(retryView.render(), "DigestWorkspace").props.onRetry(run("r1", { status: "failed" })); retryView.render();
  assert.equal(retryView.router.search.get("digest_tab"), "output"); assert.equal(retryView.router.search.get("output_tab"), "steps");
});
test("only explicit editor navigation focuses the page tab and scrolls to page top, once", async () => {
  const view = await page(); view.render(); view.flushFrames(); assert.equal(view.runtime.events.length, 0);
  view.router.search.set("digest_tab", "details"); view.router.key = "settings-link"; view.router.state = { focusDigestSettingsFor: "d1" };
  view.render(); assert.equal(view.runtime.events.length, 0); view.flushFrames();
  assert.deepEqual(view.runtime.events, [["focus", "Digest Details"], ["windowScroll", { top: 0, left: 0, behavior: "instant" }]]);
  const count = view.runtime.events.length; view.render(); view.flushFrames(); assert.equal(view.runtime.events.length, count);
});
test("admin details remain on the existing navigation, without user tabs or user run controls", async () => {
  const view = await page({ admin: true, historyRuns: [], saved: { ...digest, owner: { full_name: "Owner", email: "owner@example.test" } } });
  const tree = view.render(); assert.ok(component(tree, "AdminDigestNavigation"));
  assert.equal(nodes(tree).some(n => n.type === "Tabs"), false); assert.equal(component(tree, "DigestForm").props.visible, true);
  assert.equal(nodes(tree).some(n => n.type === "DigestScheduleControl" || n.type === "DigestWorkspace"), false);
});


test("the user editing panel contains only its retained guidance and the live form", async () => {
  const view = await page({ query: "digest_tab=details" }); const tree = view.render();
  const details = panel(tree, "details");
  assert.ok(component(details, "DigestForm"));
  assert.match(text(details), /Update the saved settings used for future runs/);
  assert.match(text(details), /Existing runs keep their own read-only settings and results/);
  assert.doesNotMatch(text(details), /Current digest details|Current topic|Radar controls|Delete digest/);
  assert.equal(nodes(details).some(n => n.type === "DigestScheduleControl" || n.type === "DigestWorkspace" || n.props.component === "aside"), false);
  assert.equal(panel(tree, "output").props.hidden, true);
  assert.equal(component(tree, "DigestScheduleControl").props.visible, false);
});

test("Output & History owns the topic, explainer, controls, history and separate delete action", async () => {
  const view = await page(); const tree = view.render(); const output = panel(tree, "output");
  assert.equal(find(pageTabs(tree), n => n.type === "Tab" && n.props.value === "output").props.label, "Output & History");
  assert.equal(nodes(tree).filter(n => n.props.component === "h1").length, 1);
  assert.equal(text(find(output, n => n.props.component === "h1")), "Current topic");
  assert.ok(component(output, "DigestScheduleControl")); assert.ok(component(output, "DigestWorkspace"));
  assert.ok(button(output, "Delete digest"));
  assert.equal(component(output, "DigestScheduleControl").props.visible, true);
  assert.equal(nodes(output).some(n => n.type === "DigestForm"), false);
  assert.doesNotMatch(text(tree), /Current digest details/);
});

test("the compact output explainer links to the editor while keeping the old-run context", async () => {
  const view = await page({ query: "run_id=old&output_tab=details&run_failed=1&return_to=%2Fradar%3Fpage%3D3" });
  const intro = find(panel(view.render(), "output"), n => n.props["aria-label"] === "How this digest works");
  const link = find(intro, n => n.type === "Link" && text(n) === "Digest Details");
  const url = new URL(link.props.to, "https://radar.example");
  assert.equal(url.searchParams.get("digest_tab"), "details"); assert.equal(url.searchParams.get("run_id"), "old");
  assert.equal(url.searchParams.get("output_tab"), "details"); assert.equal(url.searchParams.get("run_failed"), "1");
  assert.equal(url.searchParams.get("return_to"), "/radar?page=3");
  assert.equal(link.props.state.focusDigestSettingsFor, "d1");
  assert.match(text(intro), /To update digest parameters/); assert.match(text(intro), /Run now/); assert.match(text(intro), /Schedule/);
  assert.equal(nodes(intro).some(n => n.type === "strong" && text(n) === "Save"), false);
  assert.equal(view.requests.length, 0);
});

for (const source of ["explainer", "empty state", "snapshot"]) {
  test(`${source} editing link opens at page top without any save or research request`, async () => {
    const view = await page({ historyRuns: [], query: "run_id=old&output_tab=details&run_from=2026-08-01" });
    const tree = view.render();
    const link = source === "explainer" ? find(tree, n => n.type === "Link" && text(n) === "Digest Details")
      : source === "empty state" ? button(tree, "Edit current digest details")
      : button(DigestRunDetails({ run: run("old"), settingsHref: "/radar/digests/d1?digest_tab=details&run_id=old&output_tab=details" }), "Edit current digest details");
    view.router.search = new URL(link.props.to, "https://radar.example").searchParams;
    view.router.key = `link-${source}`; view.router.state = link.props.state;
    view.render(); view.flushFrames();
    assert.deepEqual(view.runtime.events.at(-1), ["windowScroll", { top: 0, left: 0, behavior: "instant" }]);
    assert.equal(view.router.search.get("run_id"), "old"); assert.equal(view.requests.length, 0);
    assert.equal(view.runtime.events.some(([kind]) => kind === "scroll"), false);
  });
}

test("a quick return to output cancels a pending editor-link scroll and focus", async () => {
  const view = await page(); view.render();
  view.router.search.set("digest_tab", "details"); view.router.key = "link"; view.router.state = { focusDigestSettingsFor: "d1" };
  view.render(); assert.equal(view.frames.size, 1);
  view.router.search.set("digest_tab", "output"); view.router.key = "back"; view.router.state = null;
  view.render(); view.flushFrames(); assert.equal(view.frames.size, 0); assert.equal(view.runtime.events.length, 0);
});

test("unrelated route state, ordinary tabs and repeated reads do not force page-top navigation", async () => {
  const view = await page(); let tree = view.render();
  pageTabs(tree).props.onChange(null, "details"); view.render(); view.flushFrames();
  assert.equal(view.runtime.events.length, 0);
  view.router.state = { focusDigestSettingsFor: "another-digest" }; view.router.key = "other";
  view.render(); view.flushFrames(); assert.equal(view.runtime.events.length, 0);
});

test("explicit navigation waits for the digest to load before restoring the page top", async () => {
  const view = await page({ query: "digest_tab=details" });
  view.router.state = { focusDigestSettingsFor: "d1" }; view.router.key = "loading-link";
  view.initial.loading = true; view.render(); view.flushFrames(); assert.equal(view.runtime.events.length, 0);
  view.initial.loading = false; view.render(); view.flushFrames();
  assert.deepEqual(view.runtime.events.at(-1), ["windowScroll", { top: 0, left: 0, behavior: "instant" }]);
});

test("the relocated deletion action retains its confirmation and running-digest guard", async () => {
  const busy = await page({ active: run("active", { status: "running" }) });
  assert.equal(button(panel(busy.render(), "output"), "Delete digest").props.disabled, true);
  const view = await page(); let tree = view.render();
  button(panel(tree, "output"), "Delete digest").props.onClick(); tree = view.render();
  const confirmation = find(tree, n => n.type === "Dialog" && text(n).includes("Delete this digest?"));
  assert.equal(confirmation.props.open, true); assert.equal(view.requests.length, 0);
  await button(confirmation, "Delete permanently").props.onClick();
  assert.deepEqual(view.requests, [["delete", "d1"], ["navigate", "/radar"]]);
});

test("admin retains its topic, explanatory text and deletion control without output user links", async () => {
  const view = await page({ admin: true, historyRuns: [] }); const tree = view.render();
  assert.equal(text(find(tree, n => n.props.component === "h1")), "Current topic");
  assert.match(text(tree), /Review and update the research scope and reporting settings/);
  assert.ok(button(tree, "Delete digest")); assert.equal(nodes(tree).some(n => n.props["aria-label"] === "How this digest works"), false);
});
