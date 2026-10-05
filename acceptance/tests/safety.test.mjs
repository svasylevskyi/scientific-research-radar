import test from 'node:test';
import assert from 'node:assert/strict';
import { validateConfig, preflight } from '../lib/config.mjs';
import { requestDecision } from '../lib/network.mjs';
import { verifyIdentity } from '../lib/state.mjs';

const source = { environment: 'development', baseURL: 'https://dev.example.test', allowedOrigin: 'https://dev.example.test', releaseCommit: 'a'.repeat(40),
  userEmail: 'reader@example.test', adminEmail: 'admin@example.test', digestId: null, runId: null, allowDigestWrites: false, captureDiagnostics: false };
const config = validateConfig(source);
const current = { role: 'user', verifiedUser: { id: 'u' }, allowWrites: false, topic: null, createdId: null };
const decision = (method, path, state = current, body, cfg = config) => requestDecision(cfg, state, new URL(path, config.baseURL).href, method, body);

for (const [key, value] of [
  ['baseURL', 'https://dev.example.test/path'], ['baseURL', 'http://dev.example.test'],
  ['baseURL', 'https://user:password@dev.example.test'], ['baseURL', 'https://dev.example.test/?next=prod'],
  ['baseURL', 'https://dev.example.test/#token'], ['allowedOrigin', 'https://different.example.test'],
  ['environment', 'production'], ['releaseCommit', 'main'], ['digestId', '../other'], ['runId', 'a'.repeat(36)],
  ['allowDigestWrites', 'false'], ['captureDiagnostics', 'true'], ['unknown', 'field'],
]) test(`configuration rejects ${key}: ${value}`, () => assert.throws(() => validateConfig({ ...source, [key]: value })));
test('known valid explicit configuration is normalized and frozen', () => { assert.equal(config.baseURL, source.baseURL); assert.ok(Object.isFrozen(config)); });
test('production labels are rejected even when both origin settings match', () => assert.throws(() => validateConfig({ ...source, baseURL: 'https://radar-prod.example.test', allowedOrigin: 'https://radar-prod.example.test' })));
test('preflight is anonymous and does not follow redirects', async () => {
  let options;
  await preflight(config, async (_url, input) => { options = input; return { status: 200, json: async () => ({ sandbox: true, items: [] }) }; });
  assert.equal(options.redirect, 'manual'); assert.equal(options.credentials, 'omit'); assert.equal(options.method, undefined);
});
for (const value of [{ sandbox: false, items: [] }, { items: [] }, { sandbox: true }, null]) test(`preflight refuses missing/live/malformed mode: ${JSON.stringify(value)}`, async () => {
  await assert.rejects(preflight(config, async () => ({ status: 200, json: async () => value })));
});
test('preflight refuses redirects and unexpected final origin', async () => {
  await assert.rejects(preflight(config, async () => ({ status: 302 })));
  await assert.rejects(preflight(config, async () => ({ status: 200, url: 'https://elsewhere.example.test' })));
});
for (const path of ['/api/v1/digests/11111111-1111-1111-1111-111111111111/runs', '/api/v1/subscription/billing/checkout',
  '/api/v1/subscription/billing/checkout/replace', '/api/v1/subscription/billing/resume', '/api/v1/subscription/billing/upgrades/preview',
  '/api/v1/subscription/billing/refresh', '/api/v1/auth/register', '/api/v1/auth/forgot-password', '/api/v1/contact', '/api/v1/digests/11111111-1111-1111-1111-111111111111/schedule']) {
  test(`side effects stay blocked: ${path}`, () => { for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) assert.equal(decision(method, path), 'deny'); });
}
test('GET access is allowlisted; arbitrary internal and external requests fail closed', () => {
  assert.equal(decision('GET', '/api/v1/subscription?digest_id=x'), 'allow');
  assert.equal(decision('GET', '/api/v1/admin/spending'), 'deny');
  assert.equal(decision('GET', 'https://checkout.stripe.com/pay/x'), 'deny');
  assert.equal(decision('GET', 'https://dev.example.test.evil.test/'), 'deny');
  assert.equal(decision('GET', '/api/v1/digests%2fruns'), 'deny');
  assert.equal(decision('GET', '/api/v1/unknown-expensive-read'), 'deny');
});
test('login requires the correct explicitly chosen account; refresh is allowed', () => {
  assert.equal(decision('POST', '/api/v1/auth/login', { ...current, login: true }, { email: source.userEmail }), 'allow');
  assert.equal(decision('POST', '/api/v1/auth/login', { ...current, login: true }, { email: 'wrong@example.test' }), 'deny');
  assert.equal(decision('POST', '/api/v1/auth/login', current, { email: source.userEmail }), 'deny');
  assert.equal(decision('POST', '/api/v1/auth/refresh'), 'allow');
});
test('only confirmed ordinary non-super-admin identities are accepted', () => {
  const user = { email: source.userEmail, role: 'user', is_super_admin: false, is_active: true };
  assert.equal(verifyIdentity(user, config, 'user'), user);
  for (const change of [{ role: 'admin' }, { is_super_admin: true }, { is_active: false }, { email: source.adminEmail }]) assert.throws(() => verifyIdentity({ ...user, ...change }, config, 'user'));
});
test('CRUD needs both approvals, exact new topic and one-paper saved configuration', () => {
  const cfg = { ...config, allowDigestWrites: true };
  const state = { ...current, topic: 'Acceptance smoke test', allowWrites: true };
  const body = { topic: state.topic, maximum_papers: 1 };
  assert.equal(decision('POST', '/api/v1/digests', state, body, cfg), 'allow');
  assert.equal(decision('POST', '/api/v1/digests', state, body), 'deny');
  assert.equal(decision('POST', '/api/v1/digests', { ...state, allowWrites: false }, body, cfg), 'deny');
  assert.equal(decision('POST', '/api/v1/digests', { ...state, verifiedUser: null }, body, cfg), 'deny');
  assert.equal(decision('POST', '/api/v1/digests', state, { ...body, schedule: {} }, cfg), 'deny');
  assert.equal(decision('POST', '/api/v1/digests', state, { ...body, maximum_papers: 20 }, cfg), 'deny');
  assert.equal(decision('POST', '/api/v1/digests', { ...state, createAttempted: true }, body, cfg), 'deny');
});
test('no existing digest can be changed/deleted, even with write opt-in', () => {
  const cfg = { ...config, allowDigestWrites: true };
  const state = { ...current, topic: 'Acceptance smoke test', allowWrites: true, createdId: '11111111-1111-1111-1111-111111111111' };
  const body = { topic: state.topic, maximum_papers: 1 };
  assert.equal(decision('DELETE', `/api/v1/digests/${state.createdId}`, state, null, cfg), 'allow');
  assert.equal(decision('PATCH', `/api/v1/digests/${state.createdId}`, state, body, cfg), 'allow');
  assert.equal(decision('DELETE', '/api/v1/digests/22222222-2222-2222-2222-222222222222', state, null, cfg), 'deny');
  assert.equal(decision('PUT', `/api/v1/digests/${state.createdId}/schedule`, state, {}, cfg), 'deny');
});
test('simulated failure is explicitly intercepted, not a permitted real write', () => {
  assert.equal(decision('POST', '/api/v1/digests', { ...current, simulateCreateFailure: true }), 'simulate');
  assert.equal(decision('POST', '/api/v1/digests'), 'deny');
});
