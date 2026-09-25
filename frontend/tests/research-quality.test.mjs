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
  assert.match(text(tree), /Automatic email blocked/);
  assert.match(text(tree), /never change it, release a hold/);
  assert.match(text(tree), /Original automatic findings ·\s+Hold/);
  assert.doesNotMatch(text(tree), /Latest manual evaluation|Reviewer/);
  assert.match(text(tree), /paper-a/);
  assert.equal(elements(tree).find((item) => item.type === "Chip").props.label, "Automatic email blocked");
});

test("observation findings explain the recorded decision without implying enforcement", () => {
  const tree = render(ResearchQualityNotice({ run: { ...run, quality_delivery_blocked: false,
    quality_config: { ...run.quality_config, config: { mode: "observe" } } }, admin: true }));
  assert.match(text(tree), /Observation mode allows delivery/);
  assert.match(text(tree), /settings version 2/i);
  assert.match(text(tree), /paper-a/);
  assert.match(text(tree), /Later checks and AI reviews never change it/);
});

test("legacy output stays not evaluated until a separate assessment exists", () => {
  const tree = render(ResearchQualityNotice({ run: { ...run, quality_delivery_blocked: false,
    quality_status: "not_evaluated", quality_config: null, quality_findings: [] }, admin: true }));
  assert.match(text(tree), /not evaluated/i);
  assert.match(text(tree), /Legacy run/);
  assert.equal(elements(tree).find((item) => item.type === "Chip").props.label, "Not blocked by quality checks");
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
        return [state[index], (value) => { state[index] = typeof value === "function" ? value(state[index]) : value; }];
      },
      useRef: (initial) => {
        const index = cursor++;
        return state[index] ??= { current: initial };
      },
    },
    "../api/researchQuality": { researchQualityApi: { evaluate } },
    "../api/runQualityResults": { loadRunQualityResults: () => {} },
    "../qualityOverview": await load("../src/qualityOverview.ts"),
    "../runHistory": await load("../src/runHistory.ts"),
    "../hooks/usePollingResource": { usePollingResource: () => resource },
    "./ResearchQualityNotice": { ResearchQualityNotice: "QualityNotice", QualityDetails: "QualityDetails" },
    "./AdminSourceVerification": { AdminSourceVerification: "SourceVerification" },
    "./AdminSourceContent": { AdminSourceContent: "SourceContent" },
    "./ClaimReviewPanel": { ClaimReviewControls: "ClaimReviewControls" },
  });
  return (status = "completed") => {
    cursor = 0;
    return AdminRunQuality({ digestId: "digest-a", run: { ...run, id: "run-b", status } });
  };
}
const qualityResource = () => ({
  data: { settings: { version: 4 }, evaluations: { total: 0, items: [] }, content: { items: [], legacy: false }, latestEvaluation: null },
  error: "", loading: false, refresh: async () => {},
});
const action = (tree) => elements(tree).find((item) => item.type === "Button" && /Run local checks|Evaluating/i.test(text(item)));

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

const { ContentEvidence } = await load('../src/components/AdminSourceContent.tsx', {
  '../api/researchQuality': {}, '../hooks/usePollingResource': {}, '../runHistory': await load('../src/runHistory.ts'),
});
test('summary evidence shows source passages and licence without claiming semantic verification', () => {
  const tree = render(ContentEvidence({ item: {
    document: { external_id: 'paper-a', title: 'Example', basis: 'abstract_only', authors: ['Author'],
      retrieved_at: '2026-09-25T08:00:00Z', source_version: 'v1', policy_version: '1', cached: true,
      source_url: 'https://arxiv.org/abs/1706.03762', license_url: 'https://creativecommons.org/publicdomain/zero/1.0/',
      permission_source: 'https://info.arxiv.org/help/api/tou.html', rights_notice: 'Metadata permission', notes: [],
      passages: [{ id: 'p-one', section: 'Abstract', text: 'The observed result is limited to this experiment.' }] },
    statements: [{ text: 'An example finding.', passage_ids: ['p-one'], references_valid: true }], warnings: [],
  } }));
  assert.match(text(tree), /abstract only/);
  assert.match(text(tree), /Cached content/);
  assert.match(text(tree), /The observed result is limited/);
  assert.match(text(tree), /An example finding/);
  assert.doesNotMatch(text(tree), /Verified claim|Scientific accuracy confirmed/i);
  assert.equal(elements(tree).find(item => item.type === 'Link' && text(item).includes('Reuse licence')).props.href,
    'https://creativecommons.org/publicdomain/zero/1.0/');
});
test('missing evidence references remain explicit and source content reads do not trigger generation', async () => {
  const tree = render(ContentEvidence({ item: {
    document: { title: 'Example', authors: [], retrieved_at: '2026-09-25T08:00:00Z', passages: [], notes: [] },
    statements: [{ text: 'Unverified claim', passage_ids: ['unknown'], references_valid: false }], warnings: ['Source unavailable'],
  } }));
  assert.match(text(tree), /Human review required/);
  assert.match(text(tree), /Unknown passage/);
  const requests = [];
  const { researchQualityApi } = await load('../src/api/researchQuality.ts', {
    './client': { apiRequest: async (...args) => { requests.push(args); return {}; } },
  });
  await researchQualityApi.content('digest-a', 'run-b');
  assert.deepEqual(requests[0], ['/admin/digests/digest-a/runs/run-b/source-content']);
});
test('source attribution retains the notice, licence link, and modification statement', async () => {
  const { SourceAttribution } = await load('../src/components/SourceAttribution.tsx');
  const tree = render(SourceAttribution({ value: { title: 'Original title', authors: ['Author One'],
    source_url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC123/', license_url: 'https://creativecommons.org/licenses/by/4.0/',
    rights_notice: 'Copyright Authors', changes: 'Formatting normalized; original AI summary.' } }));
  assert.match(text(tree), /Original title.*Author One/);
  assert.match(text(tree), /Copyright Authors/);
  assert.match(text(tree), /Formatting normalized/);
});

test('one overview refresh reloads saved data without running any checks', async () => {
  const resource = qualityResource(); let reads = 0;
  resource.refresh = async () => { reads++; };
  const panel = await manualPanel(() => assert.fail('Refresh must never evaluate'), resource);
  const tree = panel();
  const buttons = elements(tree).filter(item => item.type === 'Button' && /Refresh/.test(text(item)));
  assert.equal(buttons.length, 1);
  assert.equal(text(buttons[0]).trim(), 'Refresh results');
  buttons[0].props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(reads, 1);
  resource.error = 'Disconnected';
  assert.match(text(panel()), /outdated.*paused/);
  assert.equal(action(panel()).props.disabled, true);
  assert.equal(elements(panel()).find(item => item.type === 'Button' && /Refresh results/.test(text(item))).props.disabled, false);
});

const overview = await load('../src/qualityOverview.ts');
test('structural assessment separates metadata and saved-evidence findings from local findings', () => {
  const combined = {...run, quality_findings: [
    {code: 'source_metadata_conflict', severity: 'hold'},
    {code: 'source_evidence_incomplete', severity: 'warning'},
    {code: 'sparse_results', severity: 'warning'},
  ]};
  const local = overview.structuralAssessment(combined);
  assert.equal(local.status, 'warning');
  assert.equal(local.findings.length, 1);
  assert.equal(local.findings[0].code, 'sparse_results');
  assert.equal(combined.quality_delivery_blocked, true);
  assert.equal(overview.structuralAssessment(combined, {status: 'pass', findings: [], config: run.quality_config}).status, 'pass');
  assert.equal(overview.structuralAssessment({...run, quality_status: 'not_evaluated', quality_findings: []}).status, 'not_evaluated');
  assert.equal(overview.structuralAssessment({...run, quality_findings: [{code: 'evaluation_failed', severity: 'hold'}]}).status, 'hold');
});

test('missing evidence and partial AI review never imply verified research', () => {
  assert.equal(overview.sourceSummary(null), 'Not verified');
  assert.match(overview.sourceSummary({papers: [], findings: [{code: 'provider_error'}]}), /unavailable/);
  assert.match(overview.evidenceSummary({legacy: true, items: []}), /Not captured/);
  assert.match(overview.evidenceSummary({legacy: false, items: [
    {document: {status: 'available', passages: [{id: 'p'}]}, warnings: [], statements: [{references_valid: true}]},
    {document: {status: 'unavailable', passages: []}, warnings: ['Missing text'], statements: []},
  ]}), /1 of 2 papers.*1 with evidence limitations/);
  assert.equal(overview.aiSummary(null), 'Not reviewed');
  assert.match(overview.aiSummary({status: 'completed', completed_claims: 2, selected_claims: 2, total_claims: 10}), /2\/2.*10 available/);
});

test('pending and unconfigured runs do not claim that email was delivered', () => {
  const pending = render(ResearchQualityNotice({run: {...run, status: 'running', quality_delivery_blocked: false}, admin: true}));
  assert.match(text(pending), /No completed delivery decision/);
  const free = render(ResearchQualityNotice({run: {...run, quality_status: 'not_evaluated', quality_config: null, quality_delivery_blocked: false}, admin: true}));
  assert.match(text(free), /Not blocked by quality checks/);
  assert.match(text(free), /Delivery also depends on scheduling and email settings/);
});

test('settings group controls by purpose and keep external costs and permission enforcement explicit', async () => {
  const {QualityPolicySettings} = await load('../src/components/QualityPolicySettings.tsx', {
    './ClaimReviewSettings': await load('../src/components/ClaimReviewSettings.tsx'),
  });
  const config = {mode: 'observe', source_verification_mode: 'observe', check_duplicates: true,
    check_reporting_dates: true, check_source_access: true, check_evidence_links: true, sparse_paper_threshold: 3};
  let changed;
  const tree = render(QualityPolicySettings({config, onChange: value => {changed = value;}, editable: false,
    threshold: '3', setThreshold() {}, thresholdValid: true}));
  const copy = text(tree);
  for (const heading of ['Automatic checks and delivery', 'Structural checks', 'Source verification', 'Evidence availability', 'AI observations']) assert.ok(copy.includes(heading));
  assert.match(copy, /Saving settings runs no checks/);
  assert.match(copy, /External Crossref\/arXiv metadata requests/);
  assert.match(copy, /paid OpenAI calls/);
  assert.match(copy, /never disables permission checks/);
  const inputs = elements(tree).filter(item => item.type === 'TextField');
  assert.ok(inputs.length > 5);
  assert.ok(inputs.every(item => item.props.disabled));
  const editable = render(QualityPolicySettings({config, onChange: value => {changed = value;}, editable: true,
    threshold: '3', setThreshold() {}, thresholdValid: true}));
  const source = elements(editable).find(item => item.props.label === 'Independent source verification');
  source.props.onChange({target: {value: 'off'}});
  assert.equal(changed.source_verification_mode, 'off');
  assert.equal(changed.mode, 'observe');
  assert.equal(changed.check_evidence_links, true);
});
