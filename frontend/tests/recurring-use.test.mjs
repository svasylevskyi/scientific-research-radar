import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const jsx = (type, props, key) => ({ type, props: props ?? {}, key });
const mui = new Proxy({}, { get: (_, key) => String(key) });
async function load(path, dependencies = {}) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const result = ts.transpileModule(source, { fileName: path, reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } });
  assert.deepEqual(result.diagnostics, [], path);
  const module = { exports: {} };
  runInNewContext(result.outputText, { module, exports: module.exports, Date, Intl, URLSearchParams,
    require(name) {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
      if (name === "@mui/material") return mui;
      if (name.startsWith("@mui/icons-material/")) return { default: name };
      if (name in dependencies) return dependencies[name];
      throw Error(`Unexpected dependency: ${name}`);
    },
  });
  return module.exports;
}
function nodes(node) {
  if (Array.isArray(node)) return node.flatMap(nodes);
  return node && typeof node === "object" ? [node, ...nodes(node.props?.children)] : [];
}
function text(node) {
  if (Array.isArray(node)) return node.map(text).join(" ");
  if (node == null || typeof node === "boolean") return "";
  if (typeof node !== "object") return String(node);
  if (node.props.hidden || (node.type === "Dialog" && !node.props.open) || (node.type === "Collapse" && !node.props.in)) return "";
  return [node.type === "Chip" ? node.props.label : "", text(node.props.children)].join(" ").replace(/\s+/g, " ");
}
const find = (tree, predicate) => nodes(tree).find(predicate);
const field = (tree, label) => find(tree, n => n.type === "TextField" && n.props.label === label);
const button = (tree, label) => find(tree, n => n.type === "Button" && text(n).trim().replace(/\(\s+/g, "(").replace(/\s+\)/g, ")") === label);
const noop = () => {};
const event = { preventDefault: noop };
let nextRuntime = 0;
function hooks() {
  const frames = new Map(); let frame;
  const prefix = `runtime-${nextRuntime++}`;
  const events = [];
  function slot(initial) {
    const index = frame.cursor++;
    if (!(index in frame.values)) frame.values[index] = typeof initial === "function" ? initial() : initial;
    return [frame.values[index], index];
  }
  return {
    events,
    react: {
      useId() { return slot(() => `${prefix}-${frame.name}-${frame.cursor}`)[0]; },
      useState(initial) {
        const target = frame; const [value, index] = slot(initial);
        return [value, next => { target.values[index] = typeof next === "function" ? next(target.values[index]) : next; }];
      },
      useRef(initial) { return slot(() => ({ current: initial }))[0]; },
      useCallback: fn => fn,
      useEffect(fn, deps) {
        const target = frame, index = frame.cursor++;
        const old = target.values[index];
        if (!old || deps.some((value, i) => !Object.is(value, old.deps[i]))) {
          target.effects.push(() => { old?.cleanup?.(); target.values[index] = { deps, cleanup: fn() }; });
        }
      },
    },
    render(fn, name = "root") {
      frame = frames.get(name) ?? { name, values: [], cursor: 0, effects: [] };
      frames.set(name, frame); frame.cursor = 0; frame.effects = [];
      const tree = fn();
      // DOM/ref doubles check explicit focus intent; they are not browser acceptance.
      for (const node of nodes(tree)) {
        for (const ref of [node.props?.ref, node.props?.inputRef]) {
          if (ref && typeof ref === "object") ref.current = {
            focus: () => events.push(["focus", node.props.id ?? node.type]),
            scrollIntoView: () => events.push(["scroll", node.props.id ?? node.type]),
          };
        }
      }
      frame.effects.forEach(fn => fn());
      return tree;
    },
  };
}
const scheduleHelpers = await load("../src/schedulePresentation.ts");
const usageHelpers = await load("../src/usagePresentation.ts");
const schedule = { frequency: "weekly", starts_at: "2030-02-11T10:00:00Z", ends_at: null, time_zone: "Europe/Warsaw", send_email: true };
const preview = { state: "scheduled", as_of: "2030-02-10T10:00:00Z", next_scheduled_at: "2030-02-11T10:00:00Z", upcoming_runs: ["2030-02-11T10:00:00Z", "2030-02-18T10:00:00Z"], time_zone: "Europe/Warsaw", send_email: true, active_run_id: null, waiting_digest_id: null, allowance_available_at: null, exhausted: false };
function access(overrides = {}) {
  return { mode: "sandbox", billing_type: "stripe", allowed: true, reason: "Access enabled", period_end: "2030-03-01T12:00:00Z", grace_until: null,
    plan: { name: "Current saved revision", configuration: { runs_per_month: 10, manual_runs_per_month: 3, papers_per_month: 100, max_digests: 5, max_papers_per_run: 20, schedule_frequencies: ["weekly", "monthly"], email_delivery: true } },
    remaining: { runs: 5, manual_runs: 1, papers: 60, digests: 2 }, usage: { completed_runs: 4, reserved_runs: 1, manual_runs: 2, completed_papers: 25, reserved_papers: 15 },
    digest_count: 3, retained_digest_count: 7, schedule_allowed: true, ...overrides };
}

// Pure helpers: do not recompute schedules, balances or subscription eligibility.
test("schedule validation preserves required dates, optional end and exclusive cutoff", () => {
  const { scheduleDateErrors: errors } = scheduleHelpers;
  assert.equal(Object.keys(errors("2030-02-11T10:00", "")).length, 0);
  assert.ok(errors("", "").start);
  assert.ok(errors("2030-02-30T10:00", "").start);
  assert.ok(errors("2030-02-11T10:00", "invalid").end);
  assert.ok(errors("2030-02-11T10:00", "2030-02-11T10:00").end);
  assert.ok(errors("2030-02-11T10:00", "2030-02-10T10:00").end);
  assert.equal(Object.keys(errors("2030-02-11T10:00", "2030-02-11T10:01")).length, 0);
});
test("date presentation respects the saved zone and does not fabricate a fallback date", () => {
  const { scheduleDateLabel: label } = scheduleHelpers;
  const value = "2030-02-11T10:00:00Z";
  assert.notEqual(label(value, "Europe/Warsaw"), label(value, "America/Los_Angeles"));
  assert.equal(label(null, "UTC"), "Not available");
  assert.equal(label("not-a-date", "UTC"), "Date unavailable");
  assert.equal(label(value, "Bad/Zone"), "Date unavailable in the saved time zone");
  assert.equal(scheduleHelpers.localScheduleInput(new Date("invalid")), "");
});
test("DST gap round-trip is rejected in the supported test timezones", () => {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (zone === "Europe/Warsaw") assert.ok(scheduleHelpers.scheduleDateErrors("2030-03-31T02:30", "").start);
  if (zone === "America/Los_Angeles") assert.ok(scheduleHelpers.scheduleDateErrors("2030-03-10T02:30", "").start);
});
test("every schedule state has a distinct label", () => {
  const states = ["not_scheduled", "scheduled", "due", "queued", "running", "waiting_for_run", "waiting_for_subscription", "waiting_for_allowance", "ended"];
  assert.equal(new Set(states.map(scheduleHelpers.scheduleStateLabel)).size, states.length);
});
test("progress paths use server IDs, never confuse the waiting digest with this digest", () => {
  assert.equal(scheduleHelpers.scheduleProgressPath("d", { ...preview, state: "due" }), null);
  assert.equal(scheduleHelpers.scheduleProgressPath("d", { ...preview, state: "running", active_run_id: "r" }), "/radar/digests/d?run_id=r&output_tab=steps");
  assert.equal(scheduleHelpers.scheduleProgressPath("d", { ...preview, state: "waiting_for_run", waiting_digest_id: "other" }), "/radar/digests/other");
  assert.equal(scheduleHelpers.scheduleProgressPath("d", { ...preview, state: "waiting_for_run" }), null);
  assert.equal(scheduleHelpers.scheduleProgressPath("d", { ...preview, state: "waiting_for_run", waiting_digest_id: "x?y#z" }), "/radar/digests/x%3Fy%23z");
});
test("allowance display uses backend remaining values without subtracting reservations again", () => {
  for (const key of ["runs", "manual_runs", "papers", "digests"]) {
    assert.equal(usageHelpers.allowanceCard(access(), key).remaining, String(access().remaining[key]));
  }
  assert.equal(usageHelpers.allowanceCard(access(), "papers").limit, 100);
});
test("zero, missing and complimentary allowances remain distinct", () => {
  assert.equal(usageHelpers.allowanceCard(access({ remaining: { runs: 0 } }), "runs").state, "None remaining");
  assert.equal(usageHelpers.allowanceCard(access({ remaining: { runs: null } }), "runs").remaining, "Unverified");
  assert.equal(usageHelpers.allowanceCard(access({ mode: "complimentary", plan: null, remaining: { runs: null } }), "runs").remaining, "No subscription limit");
  assert.equal(usageHelpers.allowanceCard(access({ mode: "complimentary", plan: null, remaining: {} }), "runs").remaining, "Unverified");
  const a = access(); a.plan.configuration.manual_runs_per_month = 0; a.remaining.manual_runs = 0;
  assert.equal(usageHelpers.allowanceCard(a, "manual_runs").state, "Not included");
  for (const invalid of [undefined, null, -1, NaN, Infinity, "3", 1.5]) assert.equal(usageHelpers.usageNumber(invalid), "Not available");
  assert.equal(usageHelpers.usageNumber(0), "0");
});
test("a yearly pending checkout cannot label Free or complimentary access as paid", () => {
  const billing = { attempt: { interval: "annual" } };
  assert.equal(usageHelpers.currentBillingInterval(access(), billing), "Yearly");
  assert.equal(usageHelpers.currentBillingInterval(access({ billing_type: "free" }), billing), "Free — no subscription payment");
  assert.equal(usageHelpers.currentBillingInterval(access({ mode: "complimentary" }), billing), "No subscription billing");
  assert.equal(usageHelpers.currentBillingInterval(access(), { attempt: null }), "Not verified");
});

async function outlook(options = {}) {
  const runtime = hooks();
  const resource = { data: preview, error: "", loading: false, refresh: noop, ...options.resource };
  const edited = [];
  const { ScheduleOutlook } = await load("../src/components/ScheduleOutlook.tsx", {
    react: runtime.react, "react-router-dom": { Link: "RouterLink" },
    "../api/digests": { digestsApi: { schedulePreview: () => assert.fail("No real calls") } },
    "../auth/AuthContext": { useAuth: () => ({ user: { email: "reader@example.test" } }) },
    "../hooks/usePollingResource": { usePollingResource: () => resource },
    "./ResourceNotice": { ResourceNotice: "ResourceNotice" }, "../schedulePresentation": scheduleHelpers,
  });
  return { runtime, resource, edited, render: () => runtime.render(() => ScheduleOutlook({ digestId: "d", schedule, exhausted: false, onEdit: () => edited.push(true), ...options.props })) };
}
test("saved summary emphasizes the exact server planned time and preference", async () => {
  const view = await outlook(); const tree = view.render();
  assert.match(text(tree), /Next planned start/);
  assert.ok(text(tree).includes(scheduleHelpers.scheduleDateLabel(preview.next_scheduled_at, preview.time_zone)));
  assert.match(text(tree), /Europe\/Warsaw/);
  assert.match(text(tree), /reader@example.test/);
  assert.match(text(tree), /not guaranteed completion or email-delivery times/);
  assert.equal(view.runtime.events.length, 0);
});
test("upcoming dates expand without writes or focus movement", async () => {
  const view = await outlook(); let tree = view.render();
  const toggle = button(tree, "Upcoming runs (2)");
  assert.equal(toggle.props["aria-expanded"], false);
  toggle.props.onClick(); tree = view.render();
  assert.equal(find(tree, n => n.type === "Collapse").props.in, true);
  assert.equal(button(tree, "Upcoming runs (2)").props["aria-expanded"], true);
  assert.equal(view.runtime.events.length, 0);
});
test("queued and running states link to their server-provided run", async () => {
  for (const state of ["queued", "running"]) {
    const view = await outlook({ resource: { data: { ...preview, state, active_run_id: "r" } } });
    assert.equal(button(view.render(), "View progress").props.to, "/radar/digests/d?run_id=r&output_tab=steps");
  }
});
test("waiting states expose the relevant existing action", async () => {
  const other = await outlook({ resource: { data: { ...preview, state: "waiting_for_run", waiting_digest_id: "other" } } });
  assert.equal(button(other.render(), "Open active digest").props.to, "/radar/digests/other");
  const limited = await outlook({ resource: { data: { ...preview, state: "waiting_for_allowance", allowance_available_at: "2030-03-01T00:00:00Z" } } });
  assert.equal(button(limited.render(), "Review usage").props.to, "/radar/subscription");
  assert.match(text(limited.render()), /The actual start may be later/);
  const paused = await outlook({ resource: { data: { ...preview, state: "waiting_for_subscription", next_scheduled_at: null, send_email: false, subscription_message: "Save explicitly to resume." } } });
  assert.match(text(paused.render()), /Save explicitly to resume/);
  assert.match(text(paused.render()), /On — reader@example.test/); // saved preference, not preview's default false
  button(paused.render(), "Review schedule").props.onClick();
  assert.equal(paused.edited.length, 1);
});
test("allowance availability beyond the end is not presented as an upcoming start", async () => {
  const view = await outlook({ props: { schedule: { ...schedule, ends_at: "2030-02-20T00:00:00Z" } },
    resource: { data: { ...preview, state: "waiting_for_allowance", allowance_available_at: "2030-03-01T00:00:00Z" } } });
  assert.match(text(view.render()), /schedule ends before allowance returns/);
  assert.ok(button(view.render(), "Review schedule"));
});
test("ended schedule may still have a running job; deleting is not described as stopping it", async () => {
  const view = await outlook({ resource: { data: { ...preview, state: "running", exhausted: true, active_run_id: "r", next_scheduled_at: null } } });
  assert.match(text(view.render()), /No more runs scheduled/);
  assert.match(text(view.render()), /already in progress will continue/);
  assert.ok(button(view.render(), "View progress"));
});
test("initial errors, stale data, paused-without-date and no schedule render honestly", async () => {
  const missing = await outlook({ resource: { data: null, error: "offline", loading: false } });
  assert.match(text(missing.render()), /Status unavailable/);
  assert.doesNotMatch(text(missing.render()), /Checking/);
  const stale = await outlook({ resource: { error: "offline" } });
  assert.match(text(stale.render()), /Last known: Scheduled/);
  assert.match(text(stale.render()), /Last reported planned start/);
  const none = await outlook({ resource: { data: { ...preview, state: "not_scheduled" } } });
  assert.match(text(none.render()), /No schedule is saved/);
  const paused = await outlook({ resource: { data: { ...preview, state: "waiting_for_subscription", next_scheduled_at: null } } });
  assert.match(text(paused.render()), /No start time is currently available/);
});

async function controller(overrides = {}, apiOverrides = {}) {
  const runtime = hooks(); const writes = []; const saved = [];
  const props = { digestId: "d", schedule, exhausted: false, access: { data: access(), error: "" }, runButton: jsx("Button", { children: "Run now" }), onSaved: value => saved.push(value), ...overrides };
  const api = { async saveSchedule(id, payload) { writes.push(["save", id, payload]); return { schedule: payload }; },
    async deleteSchedule(id) { writes.push(["delete", id]); }, ...apiOverrides };
  const { DigestScheduleControl } = await load("../src/components/DigestScheduleControl.tsx", {
    react: runtime.react, "./ScheduleOutlook": { ScheduleOutlook: "ScheduleOutlook" }, "../schedulePresentation": scheduleHelpers,
    "../api/client": { ApiError: Error }, "../api/digests": { digestsApi: api },
    "../auth/AuthContext": { useAuth: () => ({ user: { email: "reader@example.test" } }) },
  });
  const render = () => runtime.render(() => DigestScheduleControl(props));
  function form() {
    const tree = render(); const component = find(tree, n => typeof n.type === "function" && n.type.name === "ScheduleForm");
    assert.ok(component);
    return runtime.render(() => component.type(component.props), "form");
  }
  return { runtime, props, writes, saved, render, form, open() { button(render(), props.schedule ? "Update schedule" : "Schedule runs").props.onClick(); return form(); } };
}
test("manual research stays separate; no schedule save is triggered by rendering/editing", async () => {
  const view = await controller({ schedule: null });
  assert.match(text(view.render()), /No schedule is saved/);
  assert.ok(button(view.render(), "Run now"));
  view.open(); assert.equal(view.writes.length, 0);
});
test("invalid dates reveal a linked error summary and prevent saving", async () => {
  const view = await controller(); let tree = view.open();
  field(tree, "First digest date and time").props.onChange({ target: { value: "" } });
  await view.form().props.onSubmit(event); tree = view.form();
  assert.equal(view.writes.length, 0);
  const summary = find(tree, n => n.type === "Alert" && text(n).includes("Check the schedule dates"));
  assert.equal(summary.props.tabIndex, -1);
  assert.equal(summary.props.role, "alert");
  const link = find(summary, n => n.type === "Button"); link.props.onClick();
  assert.ok(view.runtime.events.some(([kind, id]) => kind === "focus" && id.endsWith("-start")));
});
test("save sends the existing schedule contract and reports success", async () => {
  const view = await controller(); view.open();
  await view.form().props.onSubmit(event);
  assert.equal(view.writes.length, 1);
  const payload = view.writes[0][2];
  assert.deepEqual(Object.keys(payload).sort(), ["ends_at", "frequency", "send_email", "starts_at", "time_zone"]);
  assert.equal(payload.starts_at, schedule.starts_at.replace("Z", ".000Z"));
  assert.equal(payload.frequency, "weekly");
  assert.equal(payload.time_zone, Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  assert.equal(payload.ends_at, null);
  assert.equal(view.saved.length, 1);
  assert.match(text(view.render()), /Schedule saved/);
});
test("failed save retains drafts and normal access polling does not steal focus", async () => {
  const view = await controller({}, { saveSchedule: async () => { throw Error("Try again later"); } });
  let tree = view.open();
  field(tree, "Digest frequency").props.onChange({ target: { value: "monthly" } });
  field(tree, "End date and time (optional)").props.onChange({ target: { value: "2030-05-01T12:00" } });
  await view.form().props.onSubmit(event); tree = view.form();
  assert.match(text(tree), /Try again later/);
  assert.equal(field(tree, "Digest frequency").props.value, "monthly");
  assert.equal(field(tree, "End date and time (optional)").props.value, "2030-05-01T12:00");
  const before = view.runtime.events.length;
  view.props.access = { data: access(), error: "" }; view.form();
  assert.equal(view.runtime.events.length, before);
});
test("duplicate in-flight save is guarded before the next render", async () => {
  let resolve; let calls = 0;
  const view = await controller({}, { saveSchedule: () => { calls++; return new Promise(done => { resolve = done; }); } });
  const tree = view.open(); const first = tree.props.onSubmit(event); const second = tree.props.onSubmit(event);
  assert.equal(calls, 1); resolve({ schedule }); await Promise.all([first, second]);
});
test("restricted frequencies/email and lost access keep saves blocked but deletion available", async () => {
  const a = access(); a.schedule_allowed = false;
  const view = await controller({ access: { data: a, error: "offline" } }); const tree = view.open();
  assert.equal(button(tree, "Save schedule").props.disabled, true);
  assert.equal(button(tree, "Delete schedule").props.disabled, false);
  await tree.props.onSubmit(event); assert.equal(view.writes.length, 0);
  const b = access(); b.plan.configuration.email_delivery = false;
  const email = await controller({ access: { data: b, error: "" } });
  const input = find(email.open(), n => n.type === "FormControlLabel").props.control;
  assert.equal(input.props.disabled, false); // may turn off a saved disallowed preference
  await email.form().props.onSubmit(event); assert.equal(email.writes.length, 0);
  input.props.onChange({ target: { checked: false } });
  assert.equal(button(email.form(), "Save schedule").props.disabled, false);
});
test("timezone difference is explained without silently overwriting dates or adding a timezone selector", async () => {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const view = await controller({ schedule: { ...schedule, time_zone: zone === "UTC" ? "Europe/Warsaw" : "UTC" } });
  const tree = view.open();
  assert.match(text(tree), /Saving will use/);
  assert.equal(nodes(tree).filter(n => n.type === "TextField" && n.props.select).length, 1);
  assert.equal(field(tree, "First digest date and time").props.value, scheduleHelpers.localScheduleInput(new Date(schedule.starts_at)));
});
test("delete requires explicit confirmation, failed deletion stays visible and preserves the editor", async () => {
  let calls = 0;
  const view = await controller({}, { deleteSchedule: async () => { calls++; throw Error("Delete not confirmed"); } });
  let tree = view.open(); button(tree, "Delete schedule").props.onClick();
  tree = view.form(); const dialog = find(tree, n => n.type === "Dialog");
  assert.equal(dialog.props.open, true); assert.equal(calls, 0);
  button(dialog, "Delete schedule").props.onClick(); await new Promise(resolve => setImmediate(resolve)); tree = view.form();
  assert.equal(calls, 1); assert.equal(find(tree, n => n.type === "Dialog").props.open, true);
  assert.match(text(tree), /Delete not confirmed/); assert.match(text(tree), /already in progress will continue/);
  assert.equal(view.saved.length, 0);
});
test("successful delete calls the existing endpoint and does not cancel an active job", async () => {
  const view = await controller(); button(view.open(), "Delete schedule").props.onClick();
  button(find(view.form(), n => n.type === "Dialog"), "Delete schedule").props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(view.writes.map(row => row.slice(0, 2)), [["delete", "d"]]);
  assert.deepEqual(view.saved, [null]); assert.match(text(view.render()), /Schedule deleted/);
});

async function overview(overrides = {}) {
  const model = { access: access(), billing: { period_end: "2031-02-01T12:00:00Z", attempt: { interval: "annual", subscription_status: "active" }, cancel_at_period_end: false }, changes: {}, upgrades: {}, ...overrides };
  const { SubscriptionOverview } = await load("../src/components/SubscriptionOverview.tsx", {
    "react-router-dom": { Link: "RouterLink" }, "./SubscriptionData": { useSubscription: () => model },
    "../allowancePresentation": { allowanceDate: value => `DATE:${value}`, allowanceText: value => value },
    "../subscriptionPresentation": { subscriptionAction: () => overrides.action ?? null }, "../usagePresentation": usageHelpers,
  });
  return SubscriptionOverview();
}
test("overview separates yearly renewal from monthly reset and uses the current saved limits", async () => {
  const tree = await overview();
  assert.match(text(tree), /Yearly/); assert.match(text(tree), /2031-02-01/); assert.match(text(tree), /2030-03-01/);
  assert.match(text(tree), /separate from payment renewal/);
  const papers = find(tree, n => n.props["aria-label"] === "Papers");
  assert.match(text(papers), /60/); assert.match(text(papers), /100/);
  assert.match(text(papers), /Completed: 25/); assert.match(text(papers), /Reserved: 15/);
});
test("manual counted usage is not mislabeled completed and digest capacity does not reset", async () => {
  const tree = await overview();
  const manual = find(tree, n => n.props["aria-label"] === "Manual runs");
  assert.match(text(manual), /Counted: 2/); assert.match(text(manual), /Completed and reserved/);
  const slots = find(tree, n => n.props["aria-label"] === "Available digest slots");
  assert.match(text(slots), /Active digests: 3/); assert.match(text(slots), /retained: 7/);
  assert.match(text(slots), /do not reset monthly/);
  assert.equal(button(slots, "Manage active digests").props.to, "#digests");
});
test("scheduled plan change and the existing priority action remain actionable", async () => {
  const tree = await overview({ changes: { change: { state: "scheduled", plan_name: "Researcher", interval: "annual", effective_at: "2031-02-01T12:00:00Z" } },
    action: { text: "Payment is pending", label: "Complete upgrade payment", hash: "#upgrade" } });
  assert.match(text(tree), /Scheduled plan change/);
  assert.equal(button(tree, "Review or undo").props.to, "#changes");
  assert.equal(button(tree, "Complete upgrade payment").props.to, "#upgrade");
  assert.equal(button(tree, "Complete upgrade payment").props.variant, "outlined");
});
test("Free, complimentary, exhausted and grace states preserve the actual access distinction", async () => {
  const free = await overview({ access: access({ billing_type: "free" }) });
  assert.match(text(free), /Free — no subscription payment/); assert.doesNotMatch(text(free), /2031-02-01/);
  const gift = await overview({ access: access({ mode: "complimentary", plan: null, billing_type: null, remaining: { runs: null, papers: null, manual_runs: null, digests: null } }) });
  assert.match(text(gift), /No subscription limit/); assert.doesNotMatch(text(gift), /Unverified/);
  const exhausted = await overview({ access: access({ remaining: { runs: 0, papers: 0, manual_runs: 0, digests: 0 } }) });
  assert.match(text(exhausted), /None remaining/);
  const grace = await overview({ access: access({ grace_until: "2030-02-03T00:00:00Z", allowed: true }) });
  assert.match(text(grace), /Payment grace period/);
});
test("layout reflows and does not introduce forecast timers, automatic writes or narrowed page shells", async () => {
  const summary = await overview();
  assert.ok(find(summary, n => n.props.sx?.gridTemplateColumns === "repeat(auto-fit, minmax(min(100%, 220px), 1fr))"));
  const view = await controller();
  assert.ok(find(view.render(), n => n.type === "Stack" && n.props.flexWrap === "wrap"));
  assert.equal(view.open().props.sx.maxWidth, 960);
  for (const name of ["ScheduleOutlook", "SubscriptionOverview"]) {
    const source = await readFile(new URL(`../src/components/${name}.tsx`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /setInterval|saveSchedule\(|deleteSchedule\(|runNow\(|checkout\(|window\.location/);
  }
});
