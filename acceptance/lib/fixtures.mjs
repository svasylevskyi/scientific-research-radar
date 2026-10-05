import { test as base, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { readConfig, preflight, root } from './config.mjs';
import { readState, writeState } from './state.mjs';
import { installGuard } from './network.mjs';

export const config = readConfig();
export const test = base.extend({
  accountRole: ['public', { option: true }],
  sessions: [async ({ browser }, use, info) => {
    if (info.config.workers !== 1 || info.config.fullyParallel || info.project.retries) throw Error('Acceptance requires one worker, no parallelism and no automatic retries.');
    const sessions = new Map();
    await use(async role => {
      if (sessions.has(role)) return sessions.get(role);
      await preflight(config);
      const saved = role === 'public' ? null : readState(config, role);
      const context = await browser.newContext({
        baseURL: config.baseURL, storageState: saved?.storage,
        viewport: info.project.use.viewport, isMobile: !!info.project.use.isMobile,
        hasTouch: !!info.project.use.hasTouch, serviceWorkers: 'block', acceptDownloads: false,
        ignoreHTTPSErrors: false, reducedMotion: 'reduce',
      });
      const guard = await installGuard(context, config, role, {
        allowWrites: process.env.RADAR_ACCEPTANCE_WRITE_APPROVAL === 'yes',
      });
      const session = { context, guard, role, user: saved?.user };
      sessions.set(role, session); return session;
    });
    for (const session of sessions.values()) {
      // Persist rotated refresh cookies, never duplicate a stale seed into parallel contexts.
      if (session.role !== 'public' && session.guard.state.verifiedUser) {
        writeState(config, session.role, session.guard.state.verifiedUser, await session.context.storageState());
      }
      await session.context.close();
    }
  }, { scope: 'worker' }],
  app: async ({ sessions, accountRole }, use, info) => {
    const { context, guard } = await sessions(accountRole);
    guard.violations.length = 0; guard.writes.length = 0; guard.snapshots.clear();
    Object.assign(guard.state, { topic: null, createdId: null, createAttempted: false, simulateCreateFailure: false });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', () => errors.push('Uncaught application error (inspect locally).'));
    if (config.captureDiagnostics) await context.tracing.start({ screenshots: true, snapshots: true });
    try { await use({ page, guard }); }
    finally {
      if (config.captureDiagnostics) {
        const folder = path.join(root, '.local', 'diagnostics'); mkdirSync(folder, { recursive: true, mode: 0o700 });
        await context.tracing.stop({ path: path.join(folder, `${info.project.name}-${info.testId.replace(/[^a-z0-9-]/gi, '_')}.zip`) });
      }
      // Inspect before closing; closing a page can normally abort its in-flight reads.
      const violations = [...guard.violations];
      await page.close();
      if (accountRole !== 'public' && guard.state.verifiedUser) writeState(config, accountRole, guard.state.verifiedUser, await context.storageState());
      expect(violations, 'Safety guard rejected an unexpected request; this is not a passing acceptance case.').toEqual([]);
      expect(errors, 'The page raised an uncaught JavaScript error.').toEqual([]);
    }
  },
});
export { expect };
export { noOverflow } from './public-cases.mjs';
export async function workspace(page) {
  await page.goto('/radar');
  await expect(page.getByRole('heading', { level: 1, name: /^Welcome,/ })).toBeVisible();
}
export function digestURL() {
  return `/radar/digests/${config.digestId}${config.runId ? `?run_id=${config.runId}` : ''}`;
}
export async function outputPage(page) {
  await page.goto(digestURL());
  await expect(page.getByRole('tab', { name: 'Output & History', exact: true })).toHaveAttribute('aria-selected', 'true');
}
