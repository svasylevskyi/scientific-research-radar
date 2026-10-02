import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
async function load(path, dependencies = {}) {
  const {outputText} = ts.transpileModule(await readFile(new URL(path, import.meta.url), 'utf8'), {compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  }});
  const module = {exports: {}};
  runInNewContext(outputText, {module, exports: module.exports, URLSearchParams,
    require: name => dependencies[name] ?? (name === '@mui/material' || name.startsWith('../components/') || name.startsWith('./')
      ? new Proxy({}, {get: (_, key) => String(key)}) : require(name)),
  });
  return module.exports;
}
function elements(tree) {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  return tree?.props ? [tree, ...elements(tree.props.children), ...elements(tree.props.actions)] : [];
}
const context = await load('../src/navigationContext.ts');
const support = await load('../src/admin/support.ts');
const {pageNumber, withReturnTo, listReturnTo, sourceRunReturnTo, updateQuery} = context;

test('list and run return links reject external or unrelated destinations', () => {
  for (const value of ['https://evil.example/admin/digests', '//evil.example', '/admin/digests-other', '/admin/digests/../users', 'javascript:alert(1)', '/admin/digests\\evil']) {
    assert.equal(listReturnTo(new URLSearchParams({return_to: value}), '/admin/digests'), '/admin/digests');
  }
  assert.equal(sourceRunReturnTo(new URLSearchParams({return_to: '//evil.example/admin/digests/d/runs'})), null);
  assert.equal(sourceRunReturnTo(new URLSearchParams({return_to: '/admin/digests/d/runs/../../users'})), null);
  const run = '/admin/digests/d/runs?run_id=r&diagnostic_tab=costs';
  assert.equal(sourceRunReturnTo(new URLSearchParams({return_to: run})), run);
  assert.equal(listReturnTo(new URLSearchParams({return_to: '/admin/users?query=Ada&page=3'}), '/admin/users'), '/admin/users?query=Ada&page=3');
  for (const value of ['0', '-1', '2.5', 'abc', '1e3', '9007199254740991']) assert.equal(pageNumber(new URLSearchParams({page: value})), 1);
});

test('digest list links and detail/history navigation carry owner filters and pagination through a reload', async () => {
  let search = new URLSearchParams('owner_query=Ada+Lovelace&page=3');
  const original = search.toString();
  const requests = [];
  const router = {useSearchParams: () => [search, update => { search = typeof update === 'function' ? update(search) : new URLSearchParams(update); }]};
  const {AdminDigestsPage} = await load('../src/pages/AdminDigestsPage.tsx', {
    react: {useCallback: fn => fn}, 'react-router-dom': router, '../navigationContext': context, '../admin/support': support,
    '../api/digests': {adminDigestsApi: {list: args => { requests.push(args); }}},
    '../hooks/usePollingResource': {usePollingResource: loader => { loader(); return {data: {items: [], total: 75}, loading: false}; }},
    '../hooks/useListPageBounds': {useListPageBounds: () => {}},
  });
  let tree = AdminDigestsPage();
  assert.equal(requests[0].offset, 40);
  assert.equal(requests[0].ownerQuery, 'Ada Lovelace');
  const list = elements(tree).find(item => item.type === 'DigestList');
  for (const destination of [list.props.detailPath({id: 'd'}), list.props.historyPath({id: 'd'})]) {
    const query = new URLSearchParams(destination.split('?')[1]);
    assert.equal(listReturnTo(query, '/admin/digests'), '/admin/digests?' + original);
  }
  const detailQuery = updateQuery(new URLSearchParams(list.props.detailPath({id: 'd'}).split('?')[1]), {
    run_id: 'chosen', run_section: 'output', output_tab: 'papers', diagnostic_tab: 'costs',
  });
  const {AdminDigestNavigation} = await load('../src/components/AdminDigestNavigation.tsx', {
    'react-router-dom': {Link: 'RouterLink', useLocation: () => ({search: '?' + detailQuery})},
  });
  tree = AdminDigestNavigation({digestId: 'd', current: 'details'});
  for (const link of elements(tree).filter(item => item.type === 'Button')) {
    const query = new URLSearchParams(link.props.to.split('?')[1]);
    assert.equal(query.get('run_id'), 'chosen');
    assert.equal(query.get('output_tab'), 'papers');
    assert.equal(listReturnTo(query, '/admin/digests'), '/admin/digests?' + original);
  }
  tree = AdminDigestsPage();
  elements(tree).find(item => item.type === 'DigestOwnerFilter').props.onChange({ownerId: 'other'});
  assert.equal(search.has('page'), false);
  assert.equal(search.has('owner_query'), false);
  assert.equal(search.get('owner_id'), 'other');
});

test('users list restores search text and page from its URL and resets only pagination for a new search', async () => {
  let search = new URLSearchParams('query=Ada&page=3');
  let text = 'Ada';
  const requests = [];
  const {AdminUsersPage} = await load('../src/pages/AdminUsersPage.tsx', {
    react: {useCallback: fn => fn, useEffect: fn => fn(), useState: () => [text, value => { text = value; }]},
    'react-router-dom': {Link: 'RouterLink', useSearchParams: () => [search, update => { search = update(search); }]},
    '../navigationContext': context, '../admin/support': support, '../api/accountClosure': {closureLabels: {}},
    '../api/admin': {adminApi: {listUsers: args => { requests.push(args); }}},
    '../hooks/usePollingResource': {usePollingResource: loader => { loader(); return {data: {items: [{id: 'u', full_name: 'Ada', is_active: true}], total: 61}, loading: false}; }},
    '../hooks/useListPageBounds': {useListPageBounds: () => {}},
  });
  const tree = AdminUsersPage();
  assert.equal(requests[0].offset, 40);
  assert.equal(requests[0].query, 'Ada');
  const link = elements(tree).find(item => item.type === 'Button' && item.props.to);
  assert.equal(listReturnTo(new URLSearchParams(link.props.to.split('?')[1]), '/admin/users'), '/admin/users?query=Ada&page=3');
  // A subsequent submitted search belongs to page one.
  text = 'Grace';
  const editedTree = AdminUsersPage();
  elements(editedTree).find(item => item.props.component === 'form').props.onSubmit({preventDefault() {}});
  assert.equal(search.get('query'), 'Grace');
  assert.equal(search.has('page'), false);
});

test('an emptied last page returns to the nearest available page without losing filters', async () => {
  let search = new URLSearchParams('owner_id=u&page=3');
  let options;
  const {useListPageBounds} = await load('../src/hooks/useListPageBounds.ts', {
    react: {useEffect: fn => fn()}, '../navigationContext': context,
  });
  const setSearch = (update, value) => { search = update(search); options = value; };
  useListPageBounds(3, undefined, 20, setSearch);
  assert.equal(search.get('page'), '3');
  useListPageBounds(3, 40, 20, setSearch);
  assert.equal(search.get('page'), '2');
  assert.equal(search.get('owner_id'), 'u');
  assert.equal(options.replace, true);
  assert.equal(options.preventScrollReset, true);
});
