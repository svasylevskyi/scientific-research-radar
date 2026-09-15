import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
async function moduleFrom(path, rewrite = s => s) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const output = ts.transpileModule(rewrite(source), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
}
const { createRefreshQueue } = await moduleFrom('../src/refreshQueue.ts');
const { subscriptionAction, subscriptionSection, isCurrentPlan } = await moduleFrom('../src/subscriptionPresentation.ts');
const flush = () => new Promise(resolve => setImmediate(resolve));
test('refresh after a mutation waits for a new read instead of reusing an older in-flight result', async () => {
  let finish; let reads = 0; let concurrent = 0; let maximum = 0;
  const queue = createRefreshQueue(async () => {
    reads++; concurrent++; maximum = Math.max(maximum, concurrent);
    if (reads === 1) await new Promise(resolve => { finish = resolve; });
    concurrent--;
  });
  const first = queue.refresh(); await flush();
  let completed = false;
  const afterMutation = queue.refresh().then(() => { completed = true; });
  await flush(); assert.equal(completed, false); assert.equal(reads, 1);
  finish(); await Promise.all([first, afterMutation]);
  assert.equal(reads, 2); assert.equal(maximum, 1);
});
test('several refresh requests coalesce and cleanup cancels a queued follow-up', async () => {
  let finish; let reads = 0;
  const queue = createRefreshQueue(async () => { reads++; await new Promise(resolve => { finish = resolve; }); });
  const first = queue.refresh(); await flush();
  queue.refresh(); queue.refresh(); queue.stop(); finish(); await first;
  await queue.refresh(); assert.equal(reads, 1);
});
test('refresh can recover after a failed load', async () => {
  let calls = 0;
  const queue = createRefreshQueue(async () => { if (++calls === 1) throw new Error('offline'); });
  await assert.rejects(queue.refresh(), /offline/);
  await queue.refresh(); assert.equal(calls, 2);
});
const access = { allowed: true, mode: 'sandbox', billing_type: 'stripe', remaining: { runs: 4, papers: 20, manual_runs: 3 }, reason: 'Paid access verified' };
const billing = { attempt: { code: 'explorer', subscription_status: 'active' } };
test('current-plan badges follow effective Free fallback rather than the old paid attempt', () => {
  assert.equal(isCurrentPlan({ code: 'explorer', billing_type: 'stripe' }, access, billing), true);
  assert.equal(isCurrentPlan({ code: 'researcher', billing_type: 'stripe' }, access, billing), false);
  const free = { ...access, billing_type: 'free' };
  assert.equal(isCurrentPlan({ code: 'explorer', billing_type: 'stripe' }, free, billing), false);
  assert.equal(isCurrentPlan({ code: 'free', billing_type: 'free' }, free, billing), true);
  assert.equal(isCurrentPlan({ code: 'free', billing_type: 'free' }, null, null), false);
});
test('pending upgrades direct subscribers to payment before suggesting another plan', () => {
  const action = subscriptionAction({ ...access, remaining: { runs: 0 } }, billing, {}, { upgrade: { state: 'pending_payment' } });
  assert.equal(action.hash, '#upgrade'); assert.match(action.label, /payment/);
});
test('renewal changes, unfinished checkout, billing issues, and exhausted allowance lead to the appropriate section', () => {
  assert.equal(subscriptionAction(access, billing, { change: { retry_allowed: true } }, {}).hash, '#changes');
  assert.equal(subscriptionAction(access, { ...billing, resume_allowed: true }, {}, {}).hash, '#billing');
  assert.equal(subscriptionAction({ ...access, payment_issue: 'Invoice unverified' }, billing, {}, {}).hash, '#billing');
  assert.equal(subscriptionAction({ ...access, remaining: { papers: 0 } }, billing, {}, {}).hash, '#plans');
  assert.equal(subscriptionAction(access, billing, {}, {}), null);
});
test('existing upgrade deep links open plan changes; unknown hashes are safe', () => {
  assert.equal(subscriptionSection('#upgrade'), 'plans');
  assert.equal(subscriptionSection('#changes'), 'plans');
  assert.equal(subscriptionSection('#billing'), 'billing');
  assert.equal(subscriptionSection('#digests'), 'digests');
  assert.equal(subscriptionSection('#notifications'), 'notifications');
  assert.equal(subscriptionSection('#unknown'), 'plans');
});
const api = await moduleFrom('../src/api/subscriptions.ts', s => s.replace(/import \{ apiRequest \} from ['"]\.\/client['"];?/, `
  export const requests = [];
  export let failPath = '';
  export function setFailure(path) { failPath = path; }
  function apiRequest(path, options = {}) {
    requests.push({ path, ...options });
    return path === failPath ? Promise.reject(new Error('offline')) : Promise.resolve({ items: [] });
  }
`));
test('billing API methods preserve structured request bodies, IDs, and read-only public access', async () => {
  await api.subscriptionsApi.schedule({ code: 'researcher', revision: 7, interval: 'annual', expected_period_end: '2026-12-01T00:00:00Z', digest_ids: ['d1'] });
  assert.deepEqual(api.requests.at(-1).body.digest_ids, ['d1']);
  assert.equal(typeof api.requests.at(-1).body, 'object');
  await api.subscriptionsApi.previewUpgrade({ code: 'researcher', revision: 7 });
  assert.equal(api.requests.at(-1).path, '/subscription/billing/upgrades/preview');
  await api.subscriptionsApi.upgradeAction('quote-1', 'confirm');
  assert.equal(api.requests.at(-1).path, '/subscription/billing/upgrades/quote-1/confirm');
  await api.subscriptionsApi.plans(); assert.equal(api.requests.at(-1).authenticate, false);
  await api.subscriptionsApi.enrolmentPlans();
  assert.equal(api.requests.at(-1).path, '/subscription/enrolment-plans');
  assert.notEqual(api.requests.at(-1).authenticate, false);
});
test('subscription refresh includes all sections and fails rather than publishing a partial result', async () => {
  api.requests.length = 0;
  const snapshot = await api.loadSubscription();
  assert.equal(api.requests.length, 7);
  assert.deepEqual(Object.keys(snapshot).sort(), ['access', 'activeDigests', 'billing', 'changes', 'freeDigests', 'notices', 'upgrades']);
  api.setFailure('/subscription/billing/notifications');
  await assert.rejects(api.loadSubscription(), /offline/);
  api.setFailure('');
});
