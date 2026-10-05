import { spawnSync } from 'node:child_process';
import { readdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { root } from '../lib/config.mjs';
for (const dir of ['lib', 'scripts', 'specs', 'tests']) for (const entry of readdirSync(path.join(root, dir))) {
  if (!entry.endsWith('.mjs')) continue;
  const result = spawnSync(process.execPath, ['--check', path.join(root, dir, entry)], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(1);
}
const folder = mkdtempSync(path.join(os.tmpdir(), 'radar-acceptance-list-'));
try {
  const configFile = path.join(folder, 'config.json');
  writeFileSync(configFile, JSON.stringify({ environment: 'development', baseURL: 'https://offline.dev.example.test', allowedOrigin: 'https://offline.dev.example.test',
    releaseCommit: 'a'.repeat(40), userEmail: 'user@example.test', adminEmail: 'admin@example.test', digestId: null, runId: null, allowDigestWrites: false, captureDiagnostics: false }));
  // Listing imports the real specs/configuration but runs no fixtures and makes no network calls.
  const result = spawnSync(process.execPath, [createRequire(import.meta.url).resolve('@playwright/test/cli'), 'test', '--list', '--config=playwright.config.mjs'], {
    cwd: root, env: { ...process.env, RADAR_ACCEPTANCE_CONFIG: configFile, RADAR_ACCEPTANCE_LIST_ONLY: 'yes' }, encoding: 'utf8',
  });
  if (result.status !== 0) { console.error(result.stderr); process.exitCode = 1; }
  else {
    console.log(result.stdout);
    if (!result.stdout.includes('24 tests')) throw Error('Expected twelve smoke cases across two viewports.');
  }
} finally { rmSync(folder, { recursive: true, force: true }); }
