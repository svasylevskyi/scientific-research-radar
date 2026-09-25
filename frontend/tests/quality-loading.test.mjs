import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

async function load(path, dependencies) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const {outputText} = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}});
  const module = {exports: {}};
  runInNewContext(outputText, {module, exports: module.exports, URLSearchParams, Error, require: name => dependencies[name]});
  return module.exports;
}
async function loader() {
  const requests = []; let fail = '';
  const client = {apiRequest: async (path, options) => {
    requests.push({path, options});
    if (path.includes(fail) && fail) throw new Error('Unavailable');
    const url = new URL(path, 'https://radar.test');
    if (/quality-evaluations|source-verifications|claim-reviews/.test(path)) {
      const offset = Number(url.searchParams.get('offset'));
      return {items: [{id: `${url.pathname}-${offset}`}], total: 40, offset};
    }
    if (path.endsWith('source-content')) return {items: [], legacy: false};
    if (path === '/admin/research-quality') return {version: 3, config: {}};
    return {id: 'run', quality_status: 'hold', quality_delivery_blocked: true};
  }};
  const dependencies = {'./client': client};
  const quality = await load('../src/api/researchQuality.ts', dependencies);
  const claims = await load('../src/api/claimReviews.ts', dependencies);
  const digests = await load('../src/api/digests.ts', dependencies);
  const {loadRunQualityResults} = await load('../src/api/runQualityResults.ts', {
    './researchQuality': quality, './claimReviews': claims, './digests': digests,
  });
  return {requests, loadRunQualityResults, fail: path => {fail = path;}};
}

test('saved-result refresh reads all five areas, fetches settings once, and never posts', async () => {
  const fixture = await loader();
  const result = await fixture.loadRunQualityResults('digest', 'run', {evaluations: 1, sources: 1, reviews: 1});
  assert.equal(fixture.requests.length, 6);
  assert.equal(fixture.requests.filter(request => request.path === '/admin/research-quality').length, 1);
  assert.ok(fixture.requests.every(request => !request.options?.method || request.options.method === 'GET'));
  assert.equal(result.run.quality_delivery_blocked, true);
  assert.equal(result.latestEvaluation, result.evaluations.items[0]);
  assert.equal(result.latestSource, result.sources.items[0]);
  assert.equal(result.latestReview, result.reviews.items[0]);
});

test('browsing older history retains the newest overview results', async () => {
  const fixture = await loader();
  const result = await fixture.loadRunQualityResults('digest', 'run', {evaluations: 2, sources: 3, reviews: 2});
  assert.equal(result.evaluations.offset, 20);
  assert.equal(result.sources.offset, 10);
  assert.equal(result.reviews.offset, 5);
  for (const latest of [result.latestEvaluation, result.latestSource, result.latestReview]) assert.match(latest.id, /-0$/);
  assert.equal(fixture.requests.filter(request => request.path === '/admin/research-quality').length, 1);
  assert.ok(fixture.requests.every(request => !request.options?.method));
});

test('one failed result rejects the refresh instead of publishing a mixed snapshot', async () => {
  const fixture = await loader();
  fixture.fail('source-content');
  await assert.rejects(fixture.loadRunQualityResults('digest', 'run', {evaluations: 1, sources: 1, reviews: 1}), /Unavailable/);
});

const flush = () => new Promise(resolve => setImmediate(resolve));
function hooks() {
  let cursor = 0, effects = []; const slots = [];
  const react = {
    useState: initial => {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], value => {slots[index] = typeof value === 'function' ? value(slots[index]) : value;}];
    },
    useRef: initial => {const index = cursor++; return slots[index] ??= {current: initial};},
    useCallback: fn => fn,
    useEffect: (fn, deps) => {
      const index = cursor++;
      if (!slots[index] || deps.some((value, i) => value !== slots[index].deps[i])) effects.push(() => {
        slots[index]?.cleanup?.(); slots[index] = {deps, cleanup: fn()};
      });
    },
  };
  return {react, render(fn) {cursor = 0; effects = []; const result = fn(); effects.forEach(fn => fn()); return result;}};
}

test('pagination retains saved results, rejects abandoned responses, and recovers from a failed refresh', async () => {
  const runtime = hooks();
  const queue = await load('../src/refreshQueue.ts', {});
  const {usePollingResource} = await load('../src/hooks/usePollingResource.ts', {
    react: runtime.react, '../refreshQueue': queue,
    '../pagePolling': {startPagePolling: refresh => {void refresh(); return () => {}; }},
  });
  let fail = false;
  let current = async () => {if (fail) throw new Error('Disconnected'); return 'page one';};
  const render = () => runtime.render(() => usePollingResource(current, 30000, true));
  render(); await flush(); assert.equal(render().data, 'page one');
  let finishOld;
  current = () => new Promise(resolve => {finishOld = resolve;});
  render(); await flush();
  assert.equal(render().loading, true);
  assert.equal(render().data, 'page one');
  current = async () => {if (fail) throw new Error('Disconnected'); return 'page three';};
  render(); await flush();
  finishOld('obsolete page two'); await flush();
  assert.equal(render().data, 'page three');
  fail = true;
  await render().refresh();
  assert.equal(render().data, 'page three');
  assert.match(render().error, /Disconnected/);
  fail = false;
  await render().refresh(); assert.equal(render().error, '');
});
