import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
async function load(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  return import(`data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022}}).outputText).toString('base64')}`);
}
const {spendingRange, validSpendingRange} = await load('../src/admin/spending.ts');
const {resultTab, loadRunHistory} = await load('../src/runHistory.ts');
test('UTC presets cross year boundaries and include the final day', () => {
  const now = new Date('2026-01-03T23:30:00-05:00');
  assert.deepEqual(spendingRange('today', now), {from: '2026-01-04', to: '2026-01-04'});
  assert.deepEqual(spendingRange('week', now), {from: '2025-12-29', to: '2026-01-04'});
  assert.deepEqual(spendingRange('month', now), {from: '2025-12-06', to: '2026-01-04'});
  assert.deepEqual(spendingRange('thisMonth', now), {from: '2026-01-01', to: '2026-01-04'});
  assert.deepEqual(spendingRange('lastMonth', now), {from: '2025-12-01', to: '2025-12-31'});
});
test('previous month handles leap years and long current months', () => {
  assert.deepEqual(spendingRange('lastMonth', new Date('2024-03-31T12:00:00Z')), {from: '2024-02-01', to: '2024-02-29'});
  assert.deepEqual(spendingRange('lastMonth', new Date('2025-03-31T12:00:00Z')), {from: '2025-02-01', to: '2025-02-28'});
});
test('date ranges enforce inclusive 93-day maximum, order, and no future dates', () => {
  assert.equal(validSpendingRange('2026-01-01', '2026-04-03', '2026-04-04'), true);
  assert.equal(validSpendingRange('2026-01-01', '2026-04-04', '2026-04-04'), false);
  assert.equal(validSpendingRange('2026-04-04', '2026-04-03', '2026-04-04'), false);
  assert.equal(validSpendingRange('2026-04-04', '2026-04-04', '2026-04-03'), false);
  assert.equal(validSpendingRange('', '', '2026-04-03'), false);
});
test('partial research output takes precedence over diagnostics while explicit tabs remain stable', () => {
  const partial = {briefing: false, trends: false, papers: true, diagnostics: true, details: true};
  assert.equal(resultTab('briefing', partial, true), 'papers');
  assert.equal(resultTab('diagnostics', partial, true), 'diagnostics');
  assert.equal(resultTab('details', partial, true), 'details');
  assert.equal(resultTab('briefing', {}, true), 'diagnostics');
  assert.equal(resultTab('briefing', {}, false), 'steps');
});
test('admin history loader includes runs beyond the first page', async () => {
  const offsets = [];
  const all = Array.from({length: 125}, (_, i) => ({id: String(i)}));
  const runs = await loadRunHistory(async offset => { offsets.push(offset); return {items: all.slice(offset, offset + 100), total: all.length}; });
  assert.deepEqual(offsets, [0, 100]);
  assert.equal(runs.length, 125);
  assert.equal(runs[124].id, '124');
});
