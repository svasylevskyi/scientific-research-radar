import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const source = await readFile(new URL('../src/allowancePresentation.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { allowanceMessage, allowanceText, allowanceDate } = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
const base = { allowed: true, create_allowed: false, create_reasons: ['Your digest limit is reached. Upgrade to a plan with more digests, or delete an unused digest to free a slot.'], remaining: { digests: 0, runs: 9, papers: 100, manual_runs: 0 }, period_end: '2026-10-15T10:59:38.878374+00:00', schedule_allowed: true, schedule_reasons: [], run_reasons: ['Monthly manual-run allowance is exhausted', 'Monthly allowances reset at 2026-10-15T10:59:38.878374+00:00. Saved results remain available.'], research_warning: 'Duplicated old warning' };
test('Explorer screenshot case has one reset, no digest-count warning, no repeated upsell', () => {
  const text = allowanceMessage(base, 'digest');
  assert.match(text, /manual runs/);
  assert.match(text, /use included schedules/);
  assert.equal((text.match(/reset/g) ?? []).length, 1);
  assert.doesNotMatch(text, /digest limit|Upgrade|upgrade|Duplicated|878374|\+00:00/);
});
test('creating a digest reports slots, not unrelated manual-run limits', () => {
  const text = allowanceMessage(base, 'create');
  assert.match(text, /digest limit/); assert.doesNotMatch(text, /manual|reset|Upgrade/);
  assert.equal(allowanceMessage({ ...base, create_allowed: true }, 'create'), null);
});
test('multiple research limits become one summary and do not promise scheduled research', () => {
  const text = allowanceMessage({ ...base, remaining: { ...base.remaining, runs: 0, papers: 0 } }, 'digest');
  assert.match(text, /research runs, papers, manual runs/);
  assert.match(text, /research resumes when allowances are available/);
  assert.equal((text.match(/Allowances reset/g) ?? []).length, 1);
});
test('paper shortfall and inactive-digest restrictions remain actionable', () => {
  const data = { ...base, remaining: { runs: 5, papers: 3, manual_runs: 2 }, run_reasons: ['Monthly paper allowance: 3 papers available, but this run requests 20. Reduce Maximum papers or upgrade your subscription.'] };
  assert.match(allowanceMessage(data, 'digest'), /3 papers available.*Reduce Maximum papers before running/);
  assert.match(allowanceMessage({ ...data, run_reasons: ['This digest is inactive under your plan. Choose it in Subscription and usage to run research; saved results remain available.'] }, 'digest'), /digest is inactive/);
});
test('missing access and healthy allowances do not invent warnings', () => {
  assert.equal(allowanceMessage(null, 'digest'), null);
  assert.equal(allowanceMessage({ ...base, remaining: { runs: 5, papers: 30, manual_runs: 2, digests: 0 }, run_reasons: [] }, 'digest'), null);
});
test('loss of access takes precedence over exhausted allowances', () => {
  assert.equal(allowanceMessage({ ...base, allowed: false, reason: 'Payment verification is required.' }, 'digest'), 'Payment verification is required.');
});
test('repeated restrictions deduplicate and scheduling exclusion has no inline sales prompt', () => {
  const reason = 'Scheduling is not included in your plan. Upgrade to a plan with scheduled runs.';
  const text = allowanceMessage({ ...base, remaining: {}, run_reasons: [reason], schedule_reasons: [reason], schedule_allowed: false }, 'digest');
  assert.equal(text, 'Scheduling is not included in your plan.');
});
test('timestamps are localized without raw offsets or seconds', () => {
  const value = base.period_end;
  assert.equal(allowanceText(`Reset at ${value}.`), `Reset at ${allowanceDate(value)}.`);
  assert.equal(allowanceDate('invalid'), 'the next allowance reset');
  assert.doesNotMatch(allowanceDate(value), /:38|878374|\+00:00/);
});
