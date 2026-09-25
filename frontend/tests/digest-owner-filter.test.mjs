import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
const require = createRequire(import.meta.url);
async function load(path, dependencies) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const {outputText} = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX}});
  const module = {exports: {}};
  runInNewContext(outputText, {module, exports: module.exports, AbortController, URLSearchParams,
    setTimeout: (...args) => setTimeout(...args), clearTimeout: (...args) => clearTimeout(...args),
    require: name => dependencies[name] ?? (name === '@mui/material' ? new Proxy({}, {get: (_, key) => key}) : require(name))});
  return module.exports;
}
function hooks() {
  const slots = []; let cursor = 0; let effects = [];
  return {
    react: {
      useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
        return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }]; },
      useRef(initial) { const index = cursor++; return slots[index] ??= {current: initial}; },
      useEffect(fn, deps) { const index = cursor++;
        if (!slots[index] || deps.some((value, i) => !Object.is(value, slots[index].deps[i])))
          effects.push(() => { slots[index]?.cleanup?.(); slots[index] = {deps, cleanup: fn()}; }); },
    },
    render(fn) { cursor = 0; effects = []; const result = fn(); effects.forEach(fn => fn()); return result; },
  };
}
const flush = () => new Promise(resolve => setImmediate(resolve));
async function filter(api, props = {}) {
  const runtime = hooks(); const changes = [];
  const {DigestOwnerFilter} = await load('../src/components/DigestOwnerFilter.tsx', {react: runtime.react, '../api/admin': {adminApi: api}});
  const root = () => runtime.render(() => DigestOwnerFilter({ownerId: '', query: '', onChange: value => changes.push(value), ...props}));
  return {changes, root, render: () => root().props.children[0]};
}

test('owner suggestions debounce at three characters and end with a full-text filter action', async t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  const requests = [];
  const form = await filter({listUsers: async params => { requests.push(params); return {items: Array.from({length: 5}, (_, i) => ({id: String(i), full_name: `Ada ${i}`, email: `ada${i}@example.com`}))}; }});
  form.render().props.onOpen();
  form.render().props.onInputChange(null, 'ad', 'input'); form.render();
  t.mock.timers.tick(1000); await flush(); assert.equal(requests.length, 0);
  form.render().props.onInputChange(null, 'ada', 'input'); form.render();
  t.mock.timers.tick(299); await flush(); assert.equal(requests.length, 0);
  t.mock.timers.tick(1); await flush();
  assert.equal(requests[0].query, 'ada'); assert.equal(requests[0].limit, 5); assert.equal(requests[0].sort, 'name');
  const tree = form.render();
  assert.equal(tree.props.options.length, 6);
  assert.equal(tree.props.options[5].kind, 'query');
  tree.props.onChange(null, tree.props.options[5]);
  assert.equal(form.changes.at(-1).query, 'ada');
  tree.props.onChange(null, tree.props.options[1]);
  assert.equal(form.changes.at(-1).ownerId, '1');
  tree.props.onChange(null, null);
  assert.equal(Object.keys(form.changes.at(-1)).length, 0);
});

test('superseded autocomplete requests are cancelled and cannot replace newer matches', async t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  const requests = []; const completions = [];
  const form = await filter({listUsers: params => { requests.push(params); return new Promise(resolve => completions.push(resolve)); }});
  form.render().props.onOpen(); form.render().props.onInputChange(null, 'alice', 'input'); form.render();
  t.mock.timers.tick(300); await flush();
  form.render().props.onInputChange(null, 'bob', 'input'); form.render();
  assert.equal(requests[0].signal.aborted, true);
  t.mock.timers.tick(300); await flush();
  completions[1]({items: [{id: 'b', full_name: 'Bob', email: 'b@example.com'}]}); await flush();
  completions[0]({items: [{id: 'a', full_name: 'Alice', email: 'a@example.com'}]}); await flush();
  assert.equal(form.render().props.options[0].user.full_name, 'Bob');
});

test('direct owner links load only that identity and never overwrite text typed while loading', async () => {
  let complete; let reads = 0;
  const form = await filter({getUser: async id => { assert.equal(id, 'selected'); reads++; return new Promise(resolve => { complete = resolve; }); }}, {ownerId: 'selected'});
  form.render().props.onInputChange(null, 'my new search', 'input'); form.render();
  complete({id: 'selected', full_name: 'Old Owner', email: 'old@example.com'}); await flush();
  assert.equal(reads, 1);
  assert.equal(form.render().props.inputValue, 'my new search');
});

test('Enter supports a text filter and owner APIs encode search terms and cancellation', async () => {
  const form = await filter({}); const tree = form.render();
  tree.props.onChange(null, '  part@example.com  ');
  assert.equal(form.changes[0].query, 'part@example.com');
  const requests = [];
  const dependencies = {'./client': {apiRequest: async (...args) => { requests.push(args); return {}; }}};
  const {adminApi} = await load('../src/api/admin.ts', dependencies);
  const {adminDigestsApi} = await load('../src/api/digests.ts', dependencies);
  const signal = new AbortController().signal;
  await adminApi.listUsers({offset: 0, limit: 5, query: 'Name %_', sort: 'name', signal});
  assert.equal(new URLSearchParams(requests[0][0].split('?')[1]).get('q'), 'Name %_');
  assert.equal(requests[0][1].signal, signal);
  await adminDigestsApi.list({offset: 20, limit: 20, ownerQuery: 'some+name@example.com', signal});
  const params = new URLSearchParams(requests[1][0].split('?')[1]);
  assert.equal(params.get('owner_query'), 'some+name@example.com');
  assert.equal(params.get('owner_id'), null);
  assert.equal(params.get('offset'), '20');
});


test('owner search button searches typed text and has the requested hints and icon', async () => {
  const form = await filter({});
  form.render().props.onInputChange(null, '  owner@example.com  ', 'input');
  let root = form.root();
  assert.equal(root.props.children[1].props.children, 'Search');
  root.props.children[1].props.onClick();
  assert.equal(form.changes.at(-1).query, 'owner@example.com');
  const input = form.render().props.renderInput({inputProps: {}, InputProps: {}});
  assert.equal(input.props.placeholder, 'Digest owner');
  assert.equal(input.props.helperText, 'Search name or email');
  assert.equal(input.props.slotProps.htmlInput['aria-label'], 'Digest owner');
  assert.ok(input.props.slotProps.input.startAdornment);
  form.render().props.onInputChange(null, '', 'input');
  form.root().props.children[1].props.onClick();
  assert.equal(Object.keys(form.changes.at(-1)).length, 0);
});
