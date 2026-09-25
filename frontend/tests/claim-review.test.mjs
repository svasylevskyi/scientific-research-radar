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
  runInNewContext(outputText, {module, exports: module.exports, Error, URLSearchParams, AbortController, crypto: {randomUUID: () => globalThis.crypto.randomUUID()},
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
class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }
async function panel(props = {digestId: 'digest', runId: 'run', completed: true}) {
  const runtime = hooks(); const submitted = []; let implementation = async () => ({id: 'review'});
  const resource = {loading: false, error: '', refresh: async () => {}, data: {
    settings: {version: 3, config: {claim_review: {mode: 'observe', max_claims: 10, max_review_usd: '1'}}},
    history: {items: [], total: 0},
  }};
  const {ClaimReviewPanel} = await load('../src/components/ClaimReviewPanel.tsx', {
    react: runtime.react,
    '../api/claimReviews': {claimReviewsApi: {start: async payload => { submitted.push(payload); return implementation(payload); }}},
    '../api/client': {ApiError}, '../api/researchQuality': {researchQualityApi: {}},
    '../api/benchmarkReview': {downloadJson: () => {}},
    '../hooks/usePollingResource': {usePollingResource: () => resource},
  });
  return {resource, props, submitted, failWith: fn => {implementation = fn;}, render: () => runtime.render(() => ClaimReviewPanel(props))};
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('AI review requires explicit paid-action confirmation and never starts during loading', async () => {
  const form = await panel();
  const first = form.render();
  assert.equal(form.submitted.length, 0);
  assert.equal(button(first, 'Review claims with AI').props.disabled, false);
  button(first, 'Review claims with AI').props.onClick();
  const dialog = elements(form.render()).find(item => item.type === 'Dialog');
  assert.equal(dialog.props.open, true);
  assert.match(text(dialog), /OpenAI calls/);
  assert.match(text(dialog), /will not change delivery/);
  assert.equal(form.submitted.length, 0);
  button(form.render(), 'Start review').props.onClick(); await flush();
  assert.equal(form.submitted.length, 1);
  assert.equal(form.submitted[0].run_id, 'run');
  assert.equal(form.submitted[0].digest_id, 'digest');
  assert.equal(form.submitted[0].expected_settings_version, 3);
});

test('off, stale, unfinished and already-running states block paid review actions', async () => {
  const form = await panel();
  form.resource.data.settings.config.claim_review.mode = 'off';
  assert.equal(button(form.render(), 'Review claims with AI').props.disabled, true);
  form.resource.data.settings.config.claim_review.mode = 'observe'; form.resource.error = 'Settings could not refresh';
  assert.equal(button(form.render(), 'Review claims with AI').props.disabled, true);
  form.resource.error = ''; form.props.completed = false;
  assert.equal(button(form.render(), 'Review claims with AI').props.disabled, true);
  form.props.completed = true;
  form.resource.data.history.items = [{id: 'x', status: 'queued', selected_claims: 2, completed_claims: 0, cases: [], created_at: '2026-09-25T10:00:00Z', known_estimated_usd: '0', reserved_usd: '1'}];
  assert.equal(button(form.render(), 'Review claims with AI').props.disabled, true);
  assert.match(text(form.render()), /Review in progress/);
});

test('double clicks and ambiguous transport retries preserve a single paid request identity', async () => {
  const form = await panel(); let reject;
  form.failWith(() => new Promise((_, failed) => {reject = failed;}));
  const start = button(form.render(), 'Start review'); start.props.onClick(); start.props.onClick();
  assert.equal(form.submitted.length, 1);
  reject(new Error('Network connection lost')); await flush();
  form.resource.data.settings.version = 4; form.failWith(async () => ({}));
  button(form.render(), 'Start review').props.onClick(); await flush();
  assert.equal(form.submitted.length, 2);
  assert.deepEqual(form.submitted[0], form.submitted[1]);
  assert.equal(form.submitted[1].expected_settings_version, 3);
});

test('definite preflight rejection permits a fresh request with refreshed policy', async () => {
  const form = await panel();
  form.failWith(async () => {throw new ApiError(409, 'Settings changed');});
  button(form.render(), 'Start review').props.onClick(); await flush();
  form.resource.data.settings.version = 4; form.failWith(async () => ({}));
  button(form.render(), 'Start review').props.onClick(); await flush();
  assert.equal(form.submitted[1].expected_settings_version, 4);
  assert.notEqual(form.submitted[0].request_id, form.submitted[1].request_id);
});

test('benchmark comparison requires publication and keeps heldout selection explicit', async () => {
  const form = await panel({benchmarkId: 'benchmark', latestPublication: null});
  assert.equal(button(form.render(), 'Compare AI with benchmark').props.disabled, true);
  form.props.latestPublication = 2;
  assert.equal(button(form.render(), 'Compare AI with benchmark').props.disabled, false);
  field(form.render(), 'Comparison split').props.onChange({target: {value: 'heldout'}});
  field(form.render(), 'Published revision').props.onChange({target: {value: '1'}});
  assert.match(text(form.render()), /planned evaluation/);
  button(form.render(), 'Start review').props.onClick(); await flush();
  assert.equal(form.submitted[0].publication, 1);
  assert.equal(form.submitted[0].split, 'heldout');
  assert.equal(form.submitted[0].benchmark_id, 'benchmark');
  assert.equal(form.submitted[0].run_id, undefined);
});

test('AI reviewer settings offer off and observe with explicit cost controls', async () => {
  const {ClaimReviewSettings, defaultClaimReview} = await load('../src/components/ClaimReviewSettings.tsx');
  const tree = ClaimReviewSettings({value: defaultClaimReview, disabled: true, onChange() {}});
  assert.equal(defaultClaimReview.mode, 'off');
  const modes = elements(field(tree, 'AI reviewer mode')).filter(item => item.type === 'MenuItem');
  assert.deepEqual(modes.map(item => item.props.value), ['off', 'observe']);
  assert.equal(field(tree, 'Daily USD reservation budget').props.disabled, true);
  assert.match(text(tree), /paid OpenAI calls/);
});
