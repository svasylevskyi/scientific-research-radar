import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
const require = createRequire(import.meta.url);
async function load(path, dependencies = {}) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const {outputText} = ts.transpileModule(source, {compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  }});
  const module = {exports: {}};
  runInNewContext(outputText, {module, exports: module.exports, Error, URLSearchParams,
    require: name => dependencies[name] ?? (name === '@mui/material' || name.startsWith('./')
      ? new Proxy({}, {get: (_, key) => String(key)}) : require(name)),
  });
  return module.exports;
}
function hooks() {
  const slots = []; let cursor = 0; let effects = [];
  return {
    react: {
      useState: initial => {
        const index = cursor++;
        if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
        return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
      },
      useRef: initial => { const index = cursor++; return slots[index] ??= {current: initial}; },
      useCallback: fn => fn,
      useEffect: (fn, deps) => {
        const index = cursor++;
        if (!slots[index] || deps.some((value, i) => !Object.is(value, slots[index].deps[i]))) {
          effects.push(() => { slots[index]?.cleanup?.(); slots[index] = {deps, cleanup: fn()}; });
        }
      },
    },
    render: fn => { cursor = 0; effects = []; const tree = fn(); effects.forEach(fn => fn()); return tree; },
  };
}
function elements(tree) {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  return tree?.props ? [tree, ...elements(tree.props.children)] : [];
}
function text(tree) {
  if (typeof tree === 'string') return tree;
  if (Array.isArray(tree)) return tree.map(text).join(' ');
  return tree?.props ? text(tree.props.children) : '';
}
const field = (tree, label) => elements(tree).find(item => item.props.label === label);
const button = (tree, label) => elements(tree).find(item => item.type === 'Button' && text(item) === label);
const runHistory = await load('../src/runHistory.ts');
const data = {case: {id: 'c001', scope: 'finding', claim: 'An example claim', split: 'development', cited_passage_ids: ['missing-reference']},
  sources: [{id: 's1', title: 'Example', authors: ['Researcher'], kind: 'arxiv_abstract', permission_note: 'CC0 abstract metadata',
    source_url: 'https://arxiv.org/abs/1706.03762v7', passages: [{id: 's1.abstract', text: 'A limited result.'}]}],
  review: null, history: [], history_total: 0};
const noop = () => {};
async function caseForm(api = {}) {
  const runtime = hooks();
  const component = await load('../src/components/BenchmarkCaseForm.tsx', {
    react: runtime.react, '../runHistory': runHistory, '../api/benchmarkReview': {benchmarkApi: api},
  });
  const props = {benchmarkId: 'benchmark', data, superAdmin: false, blocked: false,
    onSaved: async () => {}, onDirty: noop, onSaving: noop};
  return {...component, props, render: () => runtime.render(() => component.BenchmarkCaseForm(props))};
}

test('reviews require fresh human attestations and distinguish missing evidence from contradiction', async () => {
  const {initialReview, reviewReady} = await caseForm();
  const form = initialReview({...data, review: {version: 8, state: 'approved', verdict: 'supported',
    rationale: 'Another reviewer', evidence_passage_ids: ['s1.abstract'], human_reviewed: true, permissions_checked: true}});
  assert.equal(form.expected_version, 8);
  assert.equal(form.human_reviewed, false);
  assert.equal(form.permissions_checked, false);
  const approved = {...form, state: 'approved', human_reviewed: true, permissions_checked: true};
  assert.equal(reviewReady(approved, false, false), true);
  assert.equal(reviewReady({...approved, evidence_passage_ids: []}, false, false), false);
  assert.equal(reviewReady({...approved, verdict: 'insufficient_evidence', evidence_passage_ids: []}, false, false), true);
  assert.equal(reviewReady({...approved, rationale: ' '}, false, false), false);
  assert.equal(reviewReady(approved, true, false), false);
  assert.equal(reviewReady({...approved, resolve_dispute: true}, true, true), true);
});

test('double submits create one request and stale-save failures preserve the rationale', async () => {
  let calls = 0; let reject;
  const form = await caseForm({saveReview: () => { calls++; return new Promise((_, fail) => { reject = fail; }); }});
  field(form.render(), 'Reason for your decision').props.onChange({target: {value: 'My unsaved rationale'}});
  const tree = form.render();
  const first = tree.props.onSubmit({preventDefault: noop});
  const second = tree.props.onSubmit({preventDefault: noop});
  assert.equal(calls, 1);
  reject(Object.assign(new Error('Case changed. Reload.'), {status: 409}));
  await Promise.all([first, second]);
  const after = form.render();
  assert.equal(field(after, 'Reason for your decision').props.value, 'My unsaved rationale');
  assert.match(text(after), /Your edits are still shown/);
  assert.equal(button(after, 'Save draft').props.disabled, true);
  assert.match(text(after), /missing-reference/);
});

test('criteria drafts survive summary refresh and retain their original concurrency revision', async () => {
  const runtime = hooks(); let request;
  const {BenchmarkCriteriaForm} = await load('../src/components/BenchmarkCriteriaForm.tsx', {
    react: runtime.react, '../api/benchmarkReview': {benchmarkApi: {saveCriteria: async (_, payload) => { request = payload; return {}; }}},
  });
  const criteria = {status: 'draft', minimum_reviewed_cases: 20, minimum_source_families: 5,
    minimum_prediction_coverage: 1, minimum_accuracy: .9, maximum_false_acceptance_rate: 0, maximum_regressions: 0};
  const props = {data: {summary: {id: 'benchmark', revision: 3}, criteria}, editable: true,
    blocked: false, onSaved: noop, onDirty: noop, onSaving: noop};
  const render = () => runtime.render(() => BenchmarkCriteriaForm(props));
  field(render(), 'Minimum accuracy (0–1)').props.onChange({target: {value: '0.95'}});
  field(render(), 'Reason for criteria change or approval').props.onChange({target: {value: 'My criteria decision'}});
  render();
  props.data = {summary: {id: 'benchmark', revision: 5}, criteria: {...criteria, minimum_accuracy: .8}};
  const tree = render();
  assert.equal(field(tree, 'Minimum accuracy (0–1)').props.value, '0.95');
  await tree.props.onSubmit({preventDefault: noop});
  assert.equal(request.expected_revision, 3);
  assert.equal(request.minimum_accuracy, .95);
});

test('read-only admins cannot submit criteria even when a handler is invoked directly', async () => {
  const runtime = hooks();
  const {BenchmarkCriteriaForm} = await load('../src/components/BenchmarkCriteriaForm.tsx', {
    react: runtime.react, '../api/benchmarkReview': {benchmarkApi: {saveCriteria: () => assert.fail('Not editable')}},
  });
  const tree = runtime.render(() => BenchmarkCriteriaForm({data: {criteria: {}, summary: {}}, editable: false,
    blocked: false, onDirty: noop, onSaved: noop, onSaving: noop}));
  assert.equal(elements(tree).some(item => item.type === 'Button'), false);
  await tree.props.onSubmit({preventDefault: noop});
});

test('diagnostic tabs start with quality and keep benchmark forms mounted between views', async () => {
  const runtime = hooks(); const costCalls = [];
  const {AdminRunDiagnostics} = await load('../src/components/AdminRunDiagnostics.tsx', {
    react: runtime.react, './AdminRunCosts': {useAdminRunCosts: enabled => { costCalls.push(enabled); return {}; },
      AdminCostSummary: 'CostSummary', AdminCostDetails: 'CostDetails'},
  });
  const props = {digestId: 'd', selectedId: 'r', run: {id: 'r'}, visible: true};
  const render = () => runtime.render(() => AdminRunDiagnostics(props));
  let tree = render();
  assert.deepEqual(elements(tree).filter(item => item.type === 'Tab').map(item => item.props.label), ['Research Quality', 'Costs', 'Steps']);
  assert.equal(elements(tree).find(item => item.type === 'Tabs').props.value, 'quality');
  elements(tree).find(item => item.type === 'Tabs').props.onChange(null, 'costs');
  tree = render();
  const quality = elements(tree).find(item => item.props.id === 'diagnostic-panel-quality');
  assert.equal(quality.props.sx.display, 'none');
  assert.equal(elements(quality).some(item => item.type === 'BenchmarkReviewPanel'), true);
  assert.equal(costCalls.at(-1), true);
  props.visible = false; tree = render();
  assert.equal(tree.props.hidden, true);
  assert.equal(costCalls.at(-1), false);
  props.selectedId = 'r2'; render();
  assert.equal(elements(render()).find(item => item.type === 'Tabs').props.value, 'quality');
});

test('section buttons change local visibility without navigation; user output tabs remain intact', async () => {
  async function workspace(admin) {
    const runtime = hooks();
    const {DigestWorkspace} = await load('../src/components/DigestWorkspace.tsx', {
      react: runtime.react, 'react-router-dom': {useSearchParams: () => [new URLSearchParams(), () => assert.fail('Section changes must not navigate')]},
      '../api/client': {ApiError: Error}, '../api/digests': {}, '../auth/AuthContext': {useAuth: () => ({user: {id: 'u'}})},
      '../pagePolling': {startPagePolling: () => noop}, '../runHistory': runHistory,
    });
    const run = {id: 'r', status: 'completed', started_at: '2026-09-25T10:00:00Z', paper_results: [], briefing: {}};
    return () => runtime.render(() => DigestWorkspace({admin, digestId: 'd', runs: [run], latestRun: run,
      details: 'Digest form', runBlocked: false, onRetry: noop, onUpdate: noop}));
  }
  const render = await workspace(true);
  let tree = render();
  assert.equal(button(tree, 'Run Diagnostics').props['aria-pressed'], true);
  assert.equal(elements(tree).find(item => item.props.id === 'admin-run-output').props.hidden, true);
  assert.equal(elements(tree).some(item => ['Digest Details', 'Run Diagnostics'].includes(item.props.label)), false);
  button(tree, 'Run Output').props.onClick(); tree = render();
  assert.equal(button(tree, 'Run Output').props['aria-pressed'], true);
  assert.equal(elements(tree).find(item => item.type === 'AdminRunDiagnostics').props.visible, false);
  assert.equal(elements(tree).find(item => item.props.id === 'admin-run-output').props.hidden, false);
  const userTree = (await workspace(false))();
  assert.equal(button(userTree, 'Run Diagnostics'), undefined);
  assert.ok(field(userTree, 'Digest Details'));
  assert.ok(field(userTree, 'Run Steps'));
});

test('benchmark API sends concurrency versions and selects frozen exports explicitly', async () => {
  const requests = [];
  const {benchmarkApi} = await load('../src/api/benchmarkReview.ts', {
    './client': {apiRequest: async (...args) => { requests.push(args); return {}; }},
  });
  const payload = {expected_version: 7, state: 'draft', rationale: 'Draft'};
  await benchmarkApi.saveReview('benchmark', 'c:1', payload);
  assert.match(requests[0][0], /cases\/c%3A1$/);
  assert.equal(requests[0][1].body, payload);
  await benchmarkApi.publish('benchmark', 9, 'Freeze labels');
  assert.equal(requests[1][1].body.expected_revision, 9);
  await benchmarkApi.export('benchmark', 2);
  assert.match(requests[2][0], /export\?publication=2$/);
  assert.equal(requests[2][1], undefined);
});
