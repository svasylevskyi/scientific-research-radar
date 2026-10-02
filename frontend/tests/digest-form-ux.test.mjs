import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// Isolated component/state tests. Real React/MUI rendering is a separate browser check.
const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const topics = JSON.parse(await read("../src/data/digest-topic-hints.json"));
const jsx = (type, props, key) => ({ type, props: props ?? {}, key });
const mui = new Proxy({}, { get: (_, key) => key });
async function load(path, dependencies = {}) {
  const source = await read(path);
  const output = ts.transpileModule(source, {
    fileName: path, reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  });
  assert.equal(output.diagnostics?.length ?? 0, 0);
  const module = { exports: {} };
  runInNewContext(output.outputText, { module, exports: module.exports, require(name) {
    if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
    if (name === "@mui/material") return mui;
    if (name.startsWith("@mui/icons-material/")) return { default: name };
    if (name in dependencies) return dependencies[name];
    throw Error(`Unexpected dependency: ${name}`);
  } });
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
const find = (tree, predicate) => { const node = nodes(tree).find(predicate); assert.ok(node); return node; };
const topicInput = (tree) => find(tree, n => n.type === "TextField" && n.props.label === "Digest topic");
const field = (tree, name) => find(tree, n => n.props["data-digest-field"] === name);
const clickText = (tree, label) => find(tree, n => n.type === "Button" && text(n) === label).props.onClick();
const hints = await load("../src/digestTopicHints.ts", { "./data/digest-topic-hints.json": topics });
const valid = { topic: "An arbitrary field not in the examples", description: "Context",
  includeKeywords: ["first"], excludeKeywords: ["second"], targetAudience: ["general"],
  reportingFrom: "2026-08-01", reportingTo: "2026-08-15", maximumPapers: "7" };
let serial = 0;
async function harness(overrides = {}) {
  const values = [], dependencies = [], effects = [], events = [], requests = [];
  let cursor = 0, effectCursor = 0, hintCalls = 0;
  const id = `form-${serial++}`;
  let props = { initialValues: { ...valid }, isSubmitting: false, submitLabel: "Create digest", onSubmit: async (input) => { requests.push(input); }, ...overrides };
  const loaded = await load("../src/components/DigestForm.tsx", {
    "../digestTopicHints": { randomDigestTopicHint: () => { hintCalls++; return hints.randomDigestTopicHint(() => 0.5); } },
    "./KeywordInput": { KeywordInput: "KeywordInput" },
    react: {
      useId: () => id,
      useState(initial) { const slot = cursor++; if (!(slot in values)) values[slot] = typeof initial === "function" ? initial() : initial;
        return [values[slot], next => { values[slot] = typeof next === "function" ? next(values[slot]) : next; }]; },
      useRef(initial) { const slot = cursor++; if (!(slot in values)) values[slot] = { current: initial }; return values[slot]; },
      useEffect(fn, deps) { const slot = effectCursor++; if (!dependencies[slot] || deps.some((d, i) => !Object.is(d, dependencies[slot][i]))) effects.push(fn); dependencies[slot] = deps; },
    },
  });
  const dom = (label) => ({ scrollIntoView(options) { events.push(["scroll", label, options.block, options.behavior]); },
    focus(options) { events.push(["focus", label, options.preventScroll]); } });
  return { requests, events, defaults: loaded.createDefaultDigestFormValues,
    hintCalls: () => hintCalls,
    render(nextProps = {}) {
      props = { ...props, ...nextProps }; cursor = 0; effectCursor = 0;
      const tree = loaded.DigestForm(props);
      for (const node of nodes(tree)) {
        if (node.props.ref) {
          node.props.ref.current = node.props.component === "form" ? {
            querySelector(selector) { const name = selector.match(/"(.+)"/)[1]; return { querySelector() { return dom(name); } }; },
          } : dom(text(node));
        }
      }
      for (const fn of effects.splice(0)) fn();
      return tree;
    },
    async submit(tree) { await tree.props.onSubmit({ preventDefault() {} }); },
  };
}

test("all 30 topic hints are unique and every random position is reachable", () => {
  assert.equal(topics.length, 30); assert.equal(new Set(topics).size, 30);
  for (let i = 0; i < topics.length; i++) assert.equal(hints.randomDigestTopicHint(() => (i + 0.1) / topics.length), `e.g. ${topics[i]}`);
  for (const bad of [-1, 1, NaN, Infinity]) assert.equal(hints.randomDigestTopicHint(() => bad), `e.g. ${topics[0]}`);
});
test("topic hint is a stable placeholder, never a value or a selectable restriction", async () => {
  const app = await harness({ initialValues: { ...valid, topic: "" } });
  let tree = app.render(); const first = topicInput(tree);
  assert.equal(first.props.value, ""); assert.match(first.props.placeholder, /^e\.g\. /);
  assert.equal(first.props.onFocus, undefined);
  tree = app.render(); assert.equal(topicInput(tree).props.placeholder, first.props.placeholder); assert.equal(app.hintCalls(), 1);
  topicInput(tree).props.onChange({ target: { value: "Any newly invented research question" } });
  tree = app.render(); assert.equal(topicInput(tree).props.value, "Any newly invented research question");
  await app.submit(tree); assert.equal(app.requests[0].topic, "Any newly invented research question");
  assert.equal(app.hintCalls(), 1);
});
test("empty topic stays required even while a random example is shown", async () => {
  const app = await harness({ initialValues: { ...valid, topic: "  " } });
  await app.submit(app.render()); const tree = app.render();
  assert.equal(topicInput(tree).props.error, true); assert.equal(app.requests.length, 0);
});
test("one form keeps both keyword fields visible with explicit optional labels", async () => {
  const tree = (await harness()).render();
  assert.equal(nodes(tree).filter(n => n.props.component === "form").length, 1);
  assert.equal(nodes(tree).filter(n => n.type === "KeywordInput").length, 2);
  assert.ok(text(tree).includes("Fields marked * are required"));
  const keywords = nodes(tree).filter(n => n.type === "KeywordInput");
  assert.deepEqual(keywords.map(n => n.props.label), ["Include keywords (optional)", "Exclude keywords (optional)"]);
  assert.equal(field(tree, "description").props.label, "Digest description (optional)");
  assert.ok(!nodes(tree).some(n => ["Accordion", "Stepper", "Step"].includes(n.type) || n.props.component === "details"));
});
test("invalid submit reveals a summary and links focus the appropriate field", async () => {
  const app = await harness({ initialValues: { ...valid, topic: "", targetAudience: [], reportingTo: "2026-07-01" } });
  await app.submit(app.render()); let tree = app.render();
  assert.ok(app.events.some(e => e[0] === "focus" && e[1].startsWith("Please check")));
  clickText(tree, "Target audience: Select at least one target audience.");
  assert.deepEqual(app.events.at(-1), ["focus", "targetAudience", true]);
  clickText(tree, "Reporting period to: End date must be on or after the start date.");
  assert.deepEqual(app.events.at(-2), ["scroll", "reportingTo", "center", "auto"]);
  const count = app.events.length; tree = app.render(); assert.equal(app.events.length, count);
  await app.submit(tree); app.render(); assert.ok(app.events.length > count);
});
test("editing a field clears its error without stealing keyboard focus", async () => {
  const app = await harness({ initialValues: { ...valid, topic: "", targetAudience: [] } });
  await app.submit(app.render()); let tree = app.render(); const count = app.events.length;
  topicInput(tree).props.onChange({ target: { value: "New topic" } }); tree = app.render();
  assert.equal(topicInput(tree).props.error, false); assert.equal(app.events.length, count);
  assert.match(text(tree), /Select at least one target audience/);
});
test("rejected save preserves all fields and supports a deliberate retry", async () => {
  let attempts = 0;
  const app = await harness({ onSubmit: async () => { attempts++; if (attempts === 1) throw Error("provider details must not leak"); } });
  await app.submit(app.render()); let tree = app.render();
  assert.ok(text(tree).includes("Your entries are still here")); assert.doesNotMatch(text(tree), /provider details/);
  assert.equal(topicInput(tree).props.value, valid.topic); assert.equal(field(tree, "description").props.value, valid.description);
  assert.equal(nodes(tree).find(n => n.type === "KeywordInput").props.value, valid.includeKeywords);
  assert.equal(field(tree, "maximumPapers").props.value, valid.maximumPapers);
  assert.ok(app.events.some(e => e[0] === "focus" && e[1].includes("Your entries are still here")));
  await app.submit(tree); tree = app.render(); assert.equal(attempts, 2); assert.doesNotMatch(text(tree), /Could not save the digest/);
});
test("parent-reported save error is focused once after submission and preserved edits remain", async () => {
  const app = await harness(); let tree = app.render();
  topicInput(tree).props.onChange({ target: { value: "Edited before server failure" } });
  app.render({ isSubmitting: true, submitNotice: null });
  tree = app.render({ isSubmitting: false, submitNotice: { severity: "error", message: "Save failed" } });
  assert.equal(topicInput(tree).props.value, "Edited before server failure");
  assert.deepEqual(app.events.at(-1), ["focus", "Save failed", true]);
  const count = app.events.length;
  app.render({ submitNotice: { severity: "error", message: "Save failed" } }); assert.equal(app.events.length, count);
  app.render({ submitNotice: { severity: "success", message: "Saved" } }); assert.equal(app.events.length, count);
});
test("disabled or submitting forms and overlapping Enter submits cannot create duplicate saves", async () => {
  for (const flag of ["submitDisabled", "isSubmitting"]) {
    const app = await harness({ [flag]: true }); await app.submit(app.render()); assert.equal(app.requests.length, 0);
  }
  let release, calls = 0;
  const app = await harness({ onSubmit: () => { calls++; return new Promise(resolve => { release = resolve; }); } });
  const tree = app.render(); const first = app.submit(tree); await app.submit(tree);
  assert.equal(calls, 1); release(); await first;
});
test("saving retains the original payload contract and never sends the hint", async () => {
  const app = await harness({ initialValues: { ...valid, topic: "  My science  ", description: "   " } });
  await app.submit(app.render());
  const payload = JSON.parse(JSON.stringify(app.requests[0]));
  assert.deepEqual(payload, { topic: "My science", description: null, include_keywords: ["first"], exclude_keywords: ["second"], target_audience: ["general"], reporting_from: "2026-08-01", reporting_to: "2026-08-15", maximum_papers: 7 });
});
test("plan-aware limits, date validity, description length and keyword counts retain validation", async () => {
  for (const [overrides, error] of [
    [{ maximumPapers: "2.5" }, "whole number"], [{ maximumPapers: "0" }, "whole number"],
    [{ maximumPapers: "11" }, "whole number"], [{ reportingTo: "2999-01-01" }, "future"],
    [{ reportingFrom: "" }, "Start date"], [{ reportingTo: "" }, "End date"],
    [{ description: "a".repeat(301) }, "300 characters"],
    [{ includeKeywords: Array(21).fill("x") }, "20 include keywords"],
    [{ excludeKeywords: Array(21).fill("y") }, "20 exclude keywords"],
  ]) {
    const app = await harness({ initialValues: { ...valid, ...overrides }, paperLimit: 10 });
    await app.submit(app.render()); const tree = app.render();
    assert.equal(app.requests.length, 0); assert.ok(text(tree).includes(error));
  }
});
test("field/helper relationships and IDs are unique across creation/edit form instances", async () => {
  const a = (await harness()).render(), b = (await harness()).render();
  assert.notEqual(topicInput(a).props.id, topicInput(b).props.id);
  const description = field(a, "description");
  const helperIds = description.props.slotProps.htmlInput["aria-describedby"].split(" ");
  for (const id of helperIds) assert.ok(nodes(a).some(n => n.props.id === id));
  const select = find(a, n => n.type === "Select");
  assert.ok(nodes(a).some(n => n.props.id === select.props.labelId));
  assert.ok(nodes(a).some(n => n.props.id === select.props["aria-describedby"]));
  assert.equal(field(a, "targetAudience").props.required, true);
});
test("date layout and selected audience labels allow narrow-screen wrapping", async () => {
  const tree = (await harness()).render();
  assert.ok(nodes(tree).some(n => n.type === "Stack" && n.props.direction?.xs === "column"));
  const select = find(tree, n => n.type === "Select");
  const rendered = select.props.renderValue(["science_communicators_educators"]);
  const chip = find(rendered, n => n.type === "Chip");
  assert.equal(chip.props.sx["& .MuiChip-label"].whiteSpace, "normal");
  const keyword = await read("../src/components/KeywordInput.tsx");
  assert.match(keyword, /whiteSpace: "normal", overflowWrap: "anywhere"/);
});
test("new digest defaults are unchanged and remain independent of random hints", async () => {
  const app = await harness(); const defaults = app.defaults();
  assert.equal(defaults.topic, ""); assert.equal(defaults.maximumPapers, "20");
  assert.deepEqual([...defaults.targetAudience], ["general"]); assert.equal(app.hintCalls(), 0);
});

test("a hidden page-tab form keeps its draft and defers failure focus until visible", async () => {
  const app = await harness(); let tree = app.render();
  topicInput(tree).props.onChange({ target: { value: "Unsaved topic across page tabs" } });
  tree = app.render({ visible: false, submitNotice: { severity: "error", message: "Save failed" } });
  assert.equal(topicInput(tree).props.value, "Unsaved topic across page tabs");
  assert.equal(app.events.length, 0);
  tree = app.render({ visible: true });
  assert.equal(topicInput(tree).props.value, "Unsaved topic across page tabs");
  assert.ok(app.events.some(([kind]) => kind === "focus"));
  assert.equal(app.requests.length, 0);
});
