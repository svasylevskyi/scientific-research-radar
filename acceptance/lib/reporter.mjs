import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { root, readConfig } from './config.mjs';

/** A content-minimal evidence record. Detailed traces are opt-in and always private. */
export default class AcceptanceReporter {
  onBegin(_config, suite) { this.tests = suite.allTests(); this.started = new Date(); }
  onEnd(result) {
    if (process.env.RADAR_ACCEPTANCE_LIST_ONLY === 'yes') return;
    const config = readConfig();
    const stamp = this.started.toISOString().replace(/[:.]/g, '-');
    const folder = path.join(root, 'results', stamp);
    mkdirSync(folder, { recursive: true });
    const rows = this.tests.map(test => {
      const last = test.results.at(-1);
      const state = !last || last.status === 'skipped' ? 'NOT CHECKED' : last.status === 'passed' ? 'PASS' : 'FAIL';
      // Titles and project names are authored in the repository. Do not serialize errors/API records.
      return { id: test.title, project: test.parent.project()?.name ?? '', state, durationMs: last?.duration ?? 0 };
    });
    const record = { schemaVersion: 1, startedAt: this.started.toISOString(), completedAt: new Date().toISOString(),
      origin: config.baseURL, releaseCommit: config.releaseCommit, releaseCommitEvidence: 'operator supplied; not a server attestation',
      status: result.status, incomplete: rows.some(row => row.state === 'NOT CHECKED'), cases: rows };
    writeFileSync(path.join(folder, 'results.json'), JSON.stringify(record, null, 2) + '\n');
    const lines = ['# Development browser acceptance', '', `Target: ${config.baseURL}`,
      `Release: ${config.releaseCommit} (operator supplied)`, `Started: ${record.startedAt}`, '',
      '**This is not Stripe, scientific-quality, legal or production sign-off. Skipped/interrupted cases remain NOT CHECKED.**', '',
      '| Case | Viewport | Result |', '| --- | --- | --- |',
      ...rows.map(row => `| ${row.id.replaceAll('|', '/')} | ${row.project} | ${row.state} |`)];
    writeFileSync(path.join(folder, 'summary.md'), lines.join('\n') + '\n');
    console.log(`Acceptance evidence: ${folder}${record.incomplete ? ' (INCOMPLETE: some cases not checked)' : ''}`);
  }
}
