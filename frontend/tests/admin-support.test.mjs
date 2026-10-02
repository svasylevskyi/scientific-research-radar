import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Isolated component/DOM doubles. These tests do not claim browser or AT acceptance.
const componentNames = new Proxy({}, {get: (_, key) => String(key)});
const jsx = (type, props, key) => ({type, key, props: props ?? {}});
async function load(path, dependencies = {}, globals = {}) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const output = ts.transpileModule(source, {compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  }, reportDiagnostics: true, fileName: path});
  assert.deepEqual(output.diagnostics, [], `Syntax: ${path}`);
  const module = {exports: {}};
  runInNewContext(output.outputText, {module, exports: module.exports, URLSearchParams, Date, Intl, Error,
    ...globals, require: name => {
      if (name in dependencies) return dependencies[name];
      if (name === 'react/jsx-runtime') return {jsx, jsxs: jsx, Fragment: 'Fragment'};
      if (name === '@mui/material' || name.startsWith('@mui/icons-material/') || name.startsWith('../components/')) return componentNames;
      throw new Error(`Missing test dependency ${name}`);
    }});
  return module.exports;
}
function elements(tree) {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  return tree?.props ? [tree, ...elements(tree.props.children), ...elements(tree.props.actions)] : [];
}
function text(tree) {
  if (typeof tree === 'string' || typeof tree === 'number') return String(tree);
  if (Array.isArray(tree)) return tree.map(text).join(' ');
  return tree?.props ? text(tree.props.children) : '';
}
const button = (tree, label) => elements(tree).find(node => node.type === 'Button' && text(node) === label);
const field = (tree, label) => elements(tree).find(node => node.props.label === label);
const component = (tree, type) => elements(tree).find(node => node.type === type);
const event = {preventDefault() {}};
const noop = () => {};
function hooks() {
  const slots = []; let cursor = 0; let effects = []; let changed = false;
  const focused = []; const scrolled = [];
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], value => {
        const next = typeof value === 'function' ? value(slots[index]) : value;
        if (!Object.is(slots[index], next)) changed = true;
        slots[index] = next;
      }];
    },
    useRef(initial) { const index = cursor++; return slots[index] ??= {current: initial}; },
    useCallback(fn, deps) {
      const index = cursor++;
      if (!slots[index] || deps.some((value, i) => !Object.is(value, slots[index].deps[i]))) slots[index] = {deps, fn};
      return slots[index].fn;
    },
    useEffect(fn, deps) {
      const index = cursor++;
      if (!slots[index] || deps.some((value, i) => !Object.is(value, slots[index].deps[i]))) {
        effects.push(() => { slots[index]?.cleanup?.(); slots[index] = {deps, cleanup: fn()}; });
      }
    },
  };
  return {react, focused, scrolled, render(fn) {
    let tree;
    for (let tries = 0; tries < 10; tries++) {
      cursor = 0; effects = []; changed = false; tree = fn();
      for (const node of elements(tree)) {
        const ref = node.props.ref ?? node.props.inputRef;
        if (ref && !ref.current) ref.current = {validity: {typeMismatch: false},
          focus: () => focused.push(node.props.id ?? node.props.label ?? node.type),
          scrollIntoView: () => scrolled.push(node.props.id ?? node.props.label ?? node.type)};
      }
      effects.forEach(effect => effect());
      if (!changed) return tree;
    }
    throw new Error('Test render did not stabilize');
  }};
}
const support = await load('../src/admin/support.ts');
const nav = await load('../src/navigationContext.ts');
function router(initial = '') {
  const state = {search: new URLSearchParams(initial), options: null, history: []};
  state.tools = {Link: 'RouterLink', useSearchParams: () => [state.search, (update, options) => {
    state.history.push(state.search.toString());
    state.search = typeof update === 'function' ? update(state.search) : new URLSearchParams(update);
    state.options = options;
  }], useParams: () => ({userId: 'target'})};
  return state;
}
const defaultUser = {id: 'target', full_name: 'Ada Lovelace', email: 'ada@example.test', is_active: true,
  role: 'user', is_super_admin: false, created_at: '2026-09-01T00:00:00', subscription_plan_name: 'Explorer'};

test('return context is limited to known internal support destinations', () => {
  for (const value of ['https://evil.test/admin/users', '//evil.test', '/admin/users/../billing', '/admin/users%2felse', '/admin/users\\evil',
    '/admin/users#anchor', '/admin/messages-other', '/admin/messages\n', 'javascript:alert(1)', '/admin/users?' + 'x'.repeat(8192)]) {
    assert.equal(support.safeSupportReturn(value), null, value);
  }
  assert.equal(support.safeSupportReturn('/admin/messages?page=3&message_id=m1'), '/admin/messages?page=3&message_id=m1');
  assert.equal(support.safeSupportReturn('/admin/users/u?return_to=%2Fadmin%2Fusers%3Fpage%3D2'), '/admin/users/u?return_to=%2Fadmin%2Fusers%3Fpage%3D2');
});
test('matching-user search encodes literal sender details and preserves the exact message/page', () => {
  const path = support.matchingUsersPath('a+b&x@example.test', '/admin/messages?page=3&message_id=m1');
  const params = new URLSearchParams(path.split('?')[1]);
  assert.equal(params.get('query'), 'a+b&x@example.test');
  assert.equal(params.get('support_return'), '/admin/messages?page=3&message_id=m1');
  assert.equal(new URLSearchParams(support.matchingUsersPath('x'.repeat(321), '/admin/messages').split('?')[1]).get('query').length, 120);
  assert.equal(new URLSearchParams(support.matchingUsersPath('a@test', 'https://evil.test').split('?')[1]).has('support_return'), false);
});
test('list counts and dates do not invent zero usage or invalid calendar values', () => {
  assert.equal(support.listRange(2, 20, 35, 15, 'accounts'), '21–35 of 35 accounts');
  assert.equal(support.listRange(1, 20, 0, 0, 'messages'), '0 messages');
  assert.match(support.listRange(3, 20, 21, 0, 'messages'), /No items on this page/);
  assert.equal(support.adminDate('bad'), 'Not available');
  assert.equal(support.adminDate(null), 'Not available');
  assert.equal(support.adminDate('2026-09-01T00:00:00'), support.adminDate('2026-09-01T00:00:00Z'));
});
test('fresh account reads preserve unsaved fields but initialize and reset other accounts', () => {
  let editor = support.receiveAccount(null, defaultUser);
  editor.draft.full_name = 'Unsaved name';
  const refreshed = support.receiveAccount(editor, {...defaultUser, email: 'new@example.test'});
  assert.equal(refreshed.user.email, 'new@example.test');
  assert.equal(refreshed.draft.full_name, 'Unsaved name');
  assert.equal(refreshed.draft.email, 'ada@example.test');
  assert.equal(support.receiveAccount(refreshed, {...defaultUser, id: 'different'}).draft.full_name, defaultUser.full_name);
  assert.equal(support.receiveAccount(support.receiveAccount(null, defaultUser), {...defaultUser, full_name: 'Remote name'}).draft.full_name, 'Remote name');
});
async function listView(kind, initial, data) {
  const runtime = hooks(); const route = router(initial); const requests = [];
  const resource = {data, error: '', loading: false, refresh: async () => {}, retryAt: 0, retrying: false};
  let loader;
  const {AdminUsersPage, AdminDigestsPage} = await load(`../src/pages/Admin${kind}Page.tsx`, {
    react: runtime.react, 'react-router-dom': route.tools, '../navigationContext': nav, '../admin/support': support,
    '../api/admin': {adminApi: {listUsers: args => requests.push(args)}},
    '../api/digests': {adminDigestsApi: {list: args => requests.push(args)}},
    '../hooks/useListPageBounds': {useListPageBounds: noop},
    '../hooks/usePollingResource': {usePollingResource: fn => { loader = fn; return resource; }},
  });
  const render = () => runtime.render(AdminUsersPage ?? AdminDigestsPage);
  return {render, route, resource, requests, load: () => loader(new AbortController().signal)};
}
test('users search resets only page/query and restores context with Back/Forward', async () => {
  const view = await listView('Users', new URLSearchParams({page: '3', query: 'Ada', support_return: '/admin/messages?page=2&message_id=m'}).toString(), {items: [defaultUser], total: 61});
  let tree = view.render(); view.load();
  assert.equal(view.requests[0].offset, 40);
  assert.equal(view.requests[0].query, 'Ada');
  const link = button(tree, 'View user');
  assert.equal(nav.listReturnTo(new URLSearchParams(link.props.to.split('?')[1]), '/admin/users'), '/admin/users?' + view.route.search);
  field(tree, 'Name or email').props.onChange({target: {value: 'Grace'}});
  tree = view.render(); elements(tree).find(node => node.props.component === 'form').props.onSubmit(event);
  assert.equal(view.route.search.get('page'), null);
  assert.equal(view.route.search.get('query'), 'Grace');
  assert.match(view.route.search.get('support_return'), /message_id=m/);
  view.render(); // Commit the submitted URL before the separate Back navigation.
  view.route.search = new URLSearchParams('query=Ada&page=3');
  assert.equal(field(view.render(), 'Name or email').props.value, 'Ada');
  button(view.render(), 'Clear search').props.onClick();
  assert.equal(view.route.search.get('query'), null);
});
test('users tables/cards have the same view action and do not show false empty states on failed reads', async () => {
  const view = await listView('Users', '', {items: [defaultUser], total: 1});
  const tree = view.render();
  assert.equal(elements(tree).filter(node => node.type === 'AccountStatusChip').length, 2);
  assert.equal(elements(tree).filter(node => node.type === 'Button' && text(node) === 'View user').length, 2);
  assert.equal(component(tree, 'Table').props['aria-label'], 'User accounts');
  view.resource.data = null; view.resource.error = 'Unavailable';
  const failed = view.render();
  assert.equal(component(failed, 'AdminListFooter'), undefined);
  assert.doesNotMatch(text(failed), /No user accounts|No matching users/);
});
test('digest filters, related-owner links and history retain their contexts', async () => {
  const view = await listView('Digests', 'owner_query=Ada&page=3&support_return=%2Fadmin%2Fusers%2Fu', {items: [], total: 55});
  let tree = view.render(); view.load();
  assert.equal(view.requests[0].ownerQuery, 'Ada');
  assert.equal(view.requests[0].offset, 40);
  const list = component(tree, 'DigestList');
  assert.equal(nav.listReturnTo(new URLSearchParams(list.props.historyPath({id: 'd'}).split('?')[1]), '/admin/digests'), '/admin/digests?' + view.route.search);
  const ownerLink = list.props.ownerPath({owner_id: 'u'});
  assert.match(new URLSearchParams(ownerLink.split('?')[1]).get('support_return'), /owner_query=Ada/);
  button(tree, 'Clear filter').props.onClick();
  assert.equal(view.route.search.get('page'), null);
  assert.equal(view.route.search.get('owner_query'), null);
  assert.equal(view.route.search.get('support_return'), '/admin/users/u');
});
const message = {id: 'm1', name: 'Visitor', email: 'visitor+tag@example.test', message: 'Help with my digest.\nSecond line.',
  created_at: '2026-09-01T10:00:00Z', reviewed_at: null};
async function messagesView(initial = 'page=2&message_id=m1', api = {}, clipboard) {
  const runtime = hooks(); const route = router(initial); const calls = [];
  const resource = {data: {items: [message], total: 22, revision: 0}, error: '', loading: false, retrying: false, retryAt: 0,
    refresh: async () => { calls.push('refresh'); }};
  let loader;
  const {AdminMessagesPage} = await load('../src/pages/AdminMessagesPage.tsx', {
    react: runtime.react, 'react-router-dom': route.tools, '../navigationContext': nav, '../admin/support': support,
    '../api/client': {ApiError: Error}, '../api/contact': {contactApi: {
      list: async page => { calls.push(['list', page]); return {items: [message], total: 22}; },
      review: async (...args) => { calls.push(args); return {...message, reviewed_at: '2026-10-01T00:00:00Z'}; }, ...api}},
    '../hooks/useListPageBounds': {useListPageBounds: noop},
    '../hooks/usePollingResource': {usePollingResource: fn => { loader = fn; return resource; }},
  }, {navigator: {clipboard}});
  return {runtime, route, resource, calls, load: () => loader(new AbortController().signal), render: () => runtime.render(AdminMessagesPage)};
}
test('a copied message URL restores the correct page and dialog without modifying review state', async () => {
  const view = await messagesView(); const tree = view.render(); await view.load();
  assert.deepEqual(view.calls, [['list', 2]]);
  assert.equal(component(tree, 'Dialog').props.open, true);
  assert.match(text(component(tree, 'Dialog')), /Help with my digest/);
  assert.match(text(tree), /does not verify ownership/);
  const lookup = button(tree, 'Find matching users').props.to;
  assert.equal(new URLSearchParams(lookup.split('?')[1]).get('support_return'), '/admin/messages?page=2&message_id=m1');
});
test('missing message IDs do not open another record or search across arbitrary pages', async () => {
  const view = await messagesView('page=2&message_id=other'); const tree = view.render();
  assert.equal(component(tree, 'Dialog').props.open, false);
  assert.match(text(tree), /no other message has been opened/);
  button(tree, 'Clear selection').props.onClick();
  assert.equal(view.route.search.get('message_id'), null);
  assert.equal(view.route.search.get('page'), '2');
  assert.deepEqual(view.calls, []);
});
test('message pagination uses URL state and clears only the selected message', async () => {
  const view = await messagesView();
  component(view.render(), 'AdminListFooter').props.onChange(1);
  assert.equal(view.route.search.get('page'), null);
  assert.equal(view.route.search.get('message_id'), null);
  view.route.search = new URLSearchParams('page=2&message_id=m1');
  assert.equal(component(view.render(), 'Dialog').props.open, true);
});
test('review writes are explicit and repeated clicks submit once; GETs started earlier cannot undo success', async () => {
  let finish; const writes = [];
  const view = await messagesView(undefined, {review: (...args) => { writes.push(args); return new Promise(resolve => { finish = resolve; }); }});
  let tree = view.render(); const staleRead = await view.load();
  const action = button(tree, 'Mark reviewed').props.onClick;
  action(); action(); view.render();
  assert.deepEqual(writes, [['m1', true]]);
  finish({...message, reviewed_at: '2026-10-01T00:00:00Z'});
  await new Promise(resolve => setImmediate(resolve));
  view.resource.data = staleRead;
  tree = view.render();
  assert.ok(button(tree, 'Mark as new'));
  assert.match(text(tree), /Message marked reviewed. No reply was sent/);
  assert.equal(view.route.search.get('message_id'), 'm1');
});
test('failed review retains the same message, reports the error and permits retry after refresh', async () => {
  const view = await messagesView(undefined, {review: async () => { throw new Error('Review failed'); }});
  button(view.render(), 'Mark reviewed').props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  const tree = view.render();
  assert.ok(button(tree, 'Mark reviewed'));
  assert.equal(component(tree, 'Dialog').props.open, true);
  assert.match(text(tree), /Review failed/);
  assert.ok(view.runtime.focused.includes('Alert'));
  assert.doesNotMatch(text(tree), /Message marked reviewed/);
});
test('review response after URL navigation does not open or mark a different message', async () => {
  let finish;
  const view = await messagesView(undefined, {review: () => new Promise(resolve => { finish = resolve; })});
  button(view.render(), 'Mark reviewed').props.onClick();
  view.route.search = new URLSearchParams('page=2&message_id=m2');
  view.resource.data.items.push({...message, id: 'm2', message: 'A different message'});
  view.render();
  finish({...message, reviewed_at: '2026-10-01T00:00:00Z'});
  await new Promise(resolve => setImmediate(resolve));
  const tree = view.render();
  assert.match(text(component(tree, 'Dialog')), /A different message/);
  assert.ok(button(tree, 'Mark reviewed'));
  assert.doesNotMatch(text(component(tree, 'Dialog')), /Message marked reviewed/);
});
test('stale message reads disable mutation but retain the content and retry notice', async () => {
  const view = await messagesView(); view.resource.error = 'Connection lost';
  const tree = view.render();
  assert.match(text(component(tree, 'Dialog')), /Review actions are paused/);
  assert.equal(button(tree, 'Mark reviewed').props.disabled, true);
  button(tree, 'Mark reviewed').props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(view.calls, []);
});
test('clipboard success is reported only after completion; unsupported clipboard offers manual copy', async () => {
  const copies = [];
  const view = await messagesView(undefined, {}, {writeText: async email => { copies.push(email); }});
  button(view.render(), 'Copy email address').props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(copies, [message.email]);
  assert.match(text(view.render()), /Email address copied/);
  const denied = await messagesView();
  button(denied.render(), 'Copy email address').props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  assert.match(text(denied.render()), /Select and copy the email address/);
});
async function userView(user = defaultUser, api = {}, actor = {...defaultUser, id: 'operator', role: 'admin'}) {
  const runtime = hooks(); const route = router('return_to=%2Fadmin%2Fusers%3Fquery%3DAda%26page%3D3'); const calls = [];
  const resource = {data: {user, revision: 0}, error: '', loading: false, refresh: async () => { calls.push('refresh'); }, retryAt: 0, retrying: false};
  let loader;
  const {ManagedUserPage, AdminUserDetailPage} = await load('../src/pages/AdminUserDetailPage.tsx', {
    react: runtime.react, 'react-router-dom': route.tools, '../navigationContext': nav, '../admin/support': support,
    '../api/client': {ApiError: Error}, '../auth/AuthContext': {useAuth: () => ({user: actor, refreshUser: api.refreshUser ?? (async () => {})})},
    '../api/admin': {adminApi: {getUser: async () => user, updateUser: async (id, input) => { calls.push(['save', id, input]); return {...user, ...input}; },
      updateRole: async (id, role) => { calls.push(['role', id, role]); return {...user, role}; }, ...api}},
    '../hooks/usePollingResource': {usePollingResource: fn => { loader = fn; return resource; }},
  });
  return {runtime, route, resource, calls, wrapper: AdminUserDetailPage,
    render: () => runtime.render(() => ManagedUserPage({userId: user.id})), load: () => loader(new AbortController().signal)};
}
test('account page keys state by user ID and related links retain user-list context', async () => {
  const view = await userView();
  assert.equal(view.wrapper().key, 'target');
  const tree = view.render();
  assert.equal(button(tree, 'Back to users').props.to, '/admin/users?query=Ada&page=3');
  for (const label of ['View user’s digests', 'Subscription access', 'Billing synchronization', 'Subscription observation']) {
    const to = button(tree, label).props.to;
    const origin = new URLSearchParams(to.split('?')[1]).get('support_return');
    assert.equal(nav.listReturnTo(new URLSearchParams(origin.split('?')[1]), '/admin/users'), '/admin/users?query=Ada&page=3');
  }
});
test('account drafts survive fresh reads and failed saves, and failure brings feedback into view', async () => {
  const view = await userView(defaultUser, {updateUser: async () => { throw new Error('Email is already in use'); }});
  field(view.render(), 'Full name').props.onChange({target: {value: 'Unsaved name'}});
  view.resource.data = {user: {...defaultUser, subscription_plan_name: 'Researcher'}, revision: 0};
  let tree = view.render();
  assert.equal(field(tree, 'Full name').props.value, 'Unsaved name');
  await elements(tree).find(node => node.props.component === 'form').props.onSubmit(event);
  tree = view.render();
  assert.equal(field(tree, 'Full name').props.value, 'Unsaved name');
  assert.match(text(tree), /Email is already in use/);
  assert.ok(view.runtime.focused.includes('Alert'));
});
test('validation blocks invalid names and empty emails, with focus links to fields', async () => {
  const view = await userView();
  field(view.render(), 'Full name').props.onChange({target: {value: ' '}});
  field(view.render(), 'Email address').props.onChange({target: {value: ''}});
  await elements(view.render()).find(node => node.props.component === 'form').props.onSubmit(event);
  const tree = view.render();
  assert.deepEqual(view.calls, []);
  button(tree, 'Full name').props.onClick();
  assert.ok(view.runtime.focused.includes('managed-full-name'));
  button(tree, 'Email address').props.onClick();
  assert.ok(view.runtime.focused.includes('managed-email'));
});
test('account save has synchronous duplicate guard and ignores pre-write reads after success', async () => {
  let finish; const writes = [];
  const view = await userView(defaultUser, {updateUser: (...args) => { writes.push(args); return new Promise(resolve => { finish = resolve; }); }});
  field(view.render(), 'Full name').props.onChange({target: {value: 'Saved name'}});
  const staleRead = await view.load();
  const action = elements(view.render()).find(node => node.props.component === 'form').props.onSubmit;
  const first = action(event); await action(event);
  assert.equal(writes.length, 1);
  assert.equal(field(view.render(), 'Full name').props.disabled, true);
  finish({...defaultUser, full_name: 'Saved name'}); await first;
  view.resource.data = staleRead;
  const tree = view.render();
  assert.equal(field(tree, 'Full name').props.value, 'Saved name');
  assert.match(text(tree), /User details updated/);
});
test('role failure leaves confirmation open; role success retains unsaved account details', async () => {
  let fail = true;
  const view = await userView(defaultUser, {updateRole: async () => { if (fail) throw new Error('Role rejected'); return {...defaultUser, role: 'admin'}; }});
  field(view.render(), 'Full name').props.onChange({target: {value: 'Keep this draft'}});
  button(view.render(), 'Promote to admin').props.onClick();
  let tree = view.render();
  const dialog = component(tree, 'Dialog');
  assert.equal(button(dialog, 'Cancel').props.autoFocus, true);
  button(dialog, 'Promote to admin').props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  tree = view.render();
  assert.equal(component(tree, 'Dialog').props.open, true);
  assert.match(text(component(tree, 'Dialog')), /Role rejected/);
  fail = false; button(component(tree, 'Dialog'), 'Promote to admin').props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  tree = view.render();
  assert.equal(component(tree, 'Dialog').props.open, false);
  assert.equal(field(tree, 'Full name').props.value, 'Keep this draft');
});
test('self/protected accounts cannot open role or closure mutations, including invoked handlers', async () => {
  for (const [user, actor] of [[{...defaultUser, role: 'admin'}, {...defaultUser, role: 'admin'}],
    [{...defaultUser, is_super_admin: true}, {...defaultUser, id: 'op', role: 'admin', is_super_admin: true}]]) {
    const view = await userView(user, {}, actor); let tree = view.render();
    const role = button(tree, user.role === 'admin' ? 'Demote to user' : 'Promote to admin');
    assert.equal(role.props.disabled, true); role.props.onClick();
    button(tree, 'Close account').props.onClick(); tree = view.render();
    assert.equal(component(tree, 'Dialog').props.open, false);
    assert.equal(component(tree, 'CloseAccountDialog').props.open, false);
    assert.deepEqual(view.calls, []);
  }
});
test('stale account information blocks writes without deleting unsaved edits', async () => {
  const view = await userView();
  field(view.render(), 'Full name').props.onChange({target: {value: 'Keep me'}});
  view.resource.error = 'Read failed'; const tree = view.render();
  await elements(tree).find(node => node.props.component === 'form').props.onSubmit(event);
  assert.deepEqual(view.calls, []);
  assert.equal(field(tree, 'Full name').props.value, 'Keep me');
  assert.equal(button(tree, 'Save details').props.disabled, true);
});
test('profile refresh failure is not reported as a failed account save', async () => {
  const view = await userView(defaultUser, {refreshUser: async () => { throw new Error('Profile read failed'); }}, {...defaultUser, role: 'admin'});
  const tree = view.render();
  await elements(tree).find(node => node.props.component === 'form').props.onSubmit(event);
  assert.match(text(view.render()), /User details were saved/);
  assert.doesNotMatch(text(view.render()), /Could not update this user/);
});
test('billing navigation preserves source account context only while the same account is selected', async () => {
  const origin = '/admin/users/u?return_to=%2Fadmin%2Fusers%3Fquery%3DAda%26page%3D3';
  const route = router(new URLSearchParams({support_return: origin}));
  const {AdminBillingNavigation} = await load('../src/components/AdminBillingNavigation.tsx', {'react-router-dom': route.tools, '../admin/support': support});
  const tree = AdminBillingNavigation({current: 'access', userId: 'u'});
  assert.equal(button(tree, 'User details').props.to, origin);
  assert.equal(new URLSearchParams(button(tree, 'Synchronization').props.to.split('?')[1]).get('support_return'), origin);
  const other = AdminBillingNavigation({current: 'access', userId: 'different'});
  assert.equal(button(other, 'User details').props.to, '/admin/users/different');
  assert.equal(new URLSearchParams(button(other, 'Synchronization').props.to.split('?')[1]).has('support_return'), false);
});
test('admin digest actions and owner links have mobile/desktop parity without adding admin actions to public workspace', async () => {
  const {DigestList} = await load('../src/components/DigestList.tsx', {'react-router-dom': {Link: 'RouterLink'}});
  const digest = {id: 'd', topic: 'Very long scientific topic', owner: {full_name: 'Ada', email: 'ada@test'},
    reporting_from: '2026-09-01', reporting_to: '2026-09-10', maximum_papers: 20, schedule: null, latest_successful_run_at: null};
  const props = {digests: [digest], detailPath: () => '/detail', historyPath: () => '/runs', ownerPath: () => '/owner'};
  const tree = DigestList({...props, showOwner: true});
  assert.equal(elements(tree).filter(node => node.type === 'Button' && text(node) === 'View digest').length, 2);
  assert.equal(elements(tree).filter(node => node.type === 'Button' && text(node) === 'View runs').length, 2);
  assert.equal(elements(tree).filter(node => node.type === 'Link' && node.props.to === '/owner').length, 2);
  const publicTree = DigestList({...props, showOwner: false});
  assert.equal(button(publicTree, 'View runs'), undefined);
  assert.ok(button(publicTree, 'View'));
});
test('shared toolbar and pagination wrap while retaining a wide page shell', async () => {
  const route = router();
  const {AdminPageHeading, AdminListFooter, AccountStatusChip} = await load('../src/components/AdminSupport.tsx', {
    'react-router-dom': route.tools, '../admin/support': support, '../api/accountClosure': {closureLabels: {waiting: 'Closure waiting'}},
  });
  const heading = AdminPageHeading({title: 'Users', description: 'Explainer', actions: 'Controls'});
  assert.equal(elements(heading).find(node => node.props.children === 'Controls').props.flexWrap, 'wrap');
  const footer = AdminListFooter({page: 2, pageSize: 20, total: 25, count: 5, noun: 'accounts', onChange: noop});
  assert.match(text(footer), /21–25 of 25 accounts/);
  assert.equal(component(footer, 'Pagination').props.siblingCount, 0);
  assert.equal(AccountStatusChip({user: {...defaultUser, closure_state: 'waiting'}}).props.label, 'Closure waiting');
});
