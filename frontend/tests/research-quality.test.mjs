import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
async function load(path, dependencies = {}) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } });
  const module = { exports: {} };
  runInNewContext(outputText, { module, exports: module.exports,
    require: (name) => dependencies[name] ?? (name === "@mui/material" ? new Proxy({}, { get: (_, key) => key }) : require(name)) });
  return module.exports;
}
const { ResearchQualityNotice } = await load("../src/components/ResearchQualityNotice.tsx", {
  "../runHistory": await load("../src/runHistory.ts"),
});
function render(tree) {
  if (Array.isArray(tree)) return tree.map(render);
  if (typeof tree?.type === "function") return render(tree.type(tree.props));
  return tree?.props ? { ...tree, props: { ...tree.props, children: render(tree.props.children) } } : tree;
}
function elements(tree) {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  return tree?.props ? [tree, ...elements(tree.props.children)] : [];
}
function text(tree) {
  if (typeof tree === "string") return tree;
  if (Array.isArray(tree)) return tree.map(text).join(" ");
  return tree?.props ? text(tree.props.children) + " " + (tree.props.label ?? "") : "";
}
const run = { status: "completed", quality_status: "hold", quality_delivery_blocked: true,
  quality_config: { version: 2, engine_version: "1", config: { mode: "enforce" } },
  quality_findings: [{ code: "reporting_period", severity: "hold", message: "Paper outside the reporting period.", paper_ids: ["paper-a"] }] };

test("quality indications are hidden from user views for every result", () => {
  for (const status of ["hold", "warning", "pass", "not_evaluated"]) {
    assert.equal(ResearchQualityNotice({ run: { ...run, quality_status: status }, admin: false }), null);
  }
});

test("a new manual pass keeps the original delivery hold visible", () => {
  const evaluation = { status: "pass", findings: [], config: run.quality_config,
    created_at: "2026-09-25T08:00:00Z", created_by_name: "Reviewer" };
  const tree = render(ResearchQualityNotice({ run, admin: true, evaluation }));
  assert.match(text(tree), /Automatic email is blocked/);
  assert.match(text(tree), /manual evaluation does not release it/);
  assert.match(text(tree), /Original automatic check ·\s+Hold/);
  assert.match(text(tree), /Latest manual evaluation/);
  assert.match(text(tree), /Reviewer/);
  assert.match(text(tree), /paper-a/);
  assert.equal(elements(tree).find((item) => item.type === "Chip").props.label, "Pass");
});

test("observation findings explain the recorded decision without implying enforcement", () => {
  const tree = render(ResearchQualityNotice({ run: { ...run, quality_delivery_blocked: false,
    quality_config: { ...run.quality_config, config: { mode: "observe" } } }, admin: true }));
  assert.match(text(tree), /Observation mode allows delivery/);
  assert.match(text(tree), /settings version 2/i);
  assert.match(text(tree), /paper-a/);
  assert.match(text(tree), /not factual accuracy/);
  assert.match(text(tree), /no OpenAI requests/);
});

test("legacy output stays not evaluated until a separate assessment exists", () => {
  const tree = render(ResearchQualityNotice({ run: { ...run, quality_delivery_blocked: false,
    quality_status: "not_evaluated", quality_config: null, quality_findings: [] }, admin: true }));
  assert.match(text(tree), /not evaluated/i);
  assert.match(text(tree), /Legacy run/);
  assert.equal(elements(tree).find((item) => item.type === "Chip").props.label, "Not evaluated");
});

test("quality mutations send JSON objects once and include the displayed settings revision", async () => {
  const requests = [];
  const { researchQualityApi } = await load("../src/api/researchQuality.ts", {
    "./client": { apiRequest: async (path, options) => { requests.push({ path, options }); return {}; } },
  });
  const payload = { expected_version: 2, config: { mode: "observe" }, change_reason: "Review" };
  await researchQualityApi.save(payload);
  assert.equal(requests[0].options.body, payload);
  await researchQualityApi.evaluate("digest-a", "run-b", 3);
  assert.equal(requests[1].path, "/admin/digests/digest-a/runs/run-b/quality-evaluations");
  assert.equal(requests[1].options.method, "POST");
  assert.equal(JSON.stringify(requests[1].options.body), '{"expected_settings_version":3}');
  await researchQualityApi.evaluations("digest-a", "run-b", 2);
  assert.match(requests[2].path, /offset=20&limit=20$/);
});

async function manualPanel(evaluate, resource) {
  const state = [];
  let cursor = 0;
  const { AdminRunQuality } = await load("../src/components/AdminRunQuality.tsx", {
    react: {
      useCallback: (fn) => fn,
      useState: (initial) => {
        const index = cursor++;
        if (!(index in state)) state[index] = initial;
        return [state[index], (value) => { state[index] = value; }];
      },
      useRef: (initial) => {
        const index = cursor++;
        return state[index] ??= { current: initial };
      },
    },
    "../api/researchQuality": { researchQualityApi: { evaluate } },
    "../hooks/usePollingResource": { usePollingResource: () => resource },
    "./ResearchQualityNotice": { ResearchQualityNotice: "QualityNotice", QualityDetails: "QualityDetails" },
    "./AdminSourceVerification": { AdminSourceVerification: "SourceVerification" },
  });
  return (status = "completed") => {
    cursor = 0;
    return AdminRunQuality({ digestId: "digest-a", run: { ...run, id: "run-b", status } });
  };
}
const qualityResource = () => ({
  data: { settings: { version: 4 }, history: { total: 0, items: [] }, latest: null },
  error: "", loading: false, refresh: async () => {},
});
const action = (tree) => elements(tree).find((item) => item.type === "Button" && /evaluate quality/i.test(text(item)));

test("manual evaluation is disabled for active runs and unavailable settings", async () => {
  const resource = qualityResource();
  const panel = await manualPanel(() => assert.fail("Disabled action must not call the API"), resource);
  assert.equal(action(panel("running")).props.disabled, true);
  resource.error = "Could not load settings";
  const button = action(panel());
  assert.equal(button.props.disabled, true);
  button.props.onClick();
  resource.error = "";
  resource.loading = true;
  assert.equal(action(panel()).props.disabled, true);
});

test("repeated clicks submit once, show failure, and allow a deliberate retry", async () => {
  const resource = qualityResource();
  let reject;
  let calls = 0;
  const panel = await manualPanel(() => {
    calls += 1;
    return new Promise((_, fail) => { reject = fail; });
  }, resource);
  const button = action(panel());
  button.props.onClick();
  button.props.onClick();
  assert.equal(calls, 1);
  assert.match(text(panel()), /Evaluating/);
  reject(new Error("Settings changed. Refresh before evaluating."));
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(text(panel()), /evaluation failed|Settings changed/i);
  assert.equal(action(panel()).props.disabled, false);
});

const { SourcePaperEvidence } = await load('../src/components/AdminSourceVerification.tsx', {
  '../api/researchQuality': {}, '../hooks/usePollingResource': {}, '../runHistory': await load('../src/runHistory.ts'),
});
test('source evidence separates metadata verification from full-text access', () => {
  const tree = render(SourcePaperEvidence({ paper: {
    external_id: 'paper-a', title: 'Example paper', status: 'verified',
    claimed: { title: 'Example paper', authors: ['A. Author'], dates: ['2020-01-01'], identifier: 'paper-a' },
    checks: [{ field: 'title', status: 'match', message: 'Titles match.' }], notes: [],
    evidence: { provider: 'crossref', cached: true, retrieved_at: '2026-09-25T08:00:00Z',
      request_url: 'https://api.crossref.org/works?filter=doi:10.1234/example', identifier: '10.1234/example',
      metadata: { title: 'Example paper', identifier: '10.1234/example', authors: ['Ada Author'], dates: ['2020-01-01'],
        url: 'https://doi.org/10.1234/example', full_text_links: ['https://example.com/paper.pdf'], abstract: 'A short metadata excerpt.' },
    },
  } }));
  assert.match(text(tree), /Verified metadata/);
  assert.match(text(tree), /Cached response/);
  assert.match(text(tree), /Full text was not fetched/);
  assert.match(text(tree), /access not tested/);
  assert.match(text(tree), /Saved:.*Example paper/);
  assert.match(text(tree), /Source:.*Example paper/);
});
test('unavailable provider evidence stays unverified', () => {
  const tree = render(SourcePaperEvidence({ paper: {
    external_id: 'paper-a', title: 'Example paper', status: 'unverified',
    claimed: { identifier: 'paper-a', title: 'Example paper' }, checks: [],
    notes: ['Provider unavailable; retry later.'], evidence: null,
  } }));
  assert.match(text(tree), /Unable to fully verify/);
  assert.match(text(tree), /Provider unavailable/);
  assert.doesNotMatch(text(tree), /Verified metadata/);
});
test('source rechecks include the current revision and use paginated read-only history', async () => {
  const requests = [];
  const { researchQualityApi } = await load('../src/api/researchQuality.ts', {
    './client': { apiRequest: async (path, options) => { requests.push({ path, options }); return {}; } },
  });
  await researchQualityApi.verifySources('digest-a', 'run-b', 7);
  await researchQualityApi.sources('digest-a', 'run-b', 2);
  assert.equal(requests[0].options.method, 'POST');
  assert.equal(JSON.stringify(requests[0].options.body), '{"expected_settings_version":7}');
  assert.match(requests[0].path, /source-verifications$/);
  assert.match(requests[1].path, /offset=5&limit=5$/);
  assert.equal(requests[1].options, undefined);
});
