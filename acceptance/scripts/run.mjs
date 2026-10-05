import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { chromium } from '@playwright/test';
import { readConfig, preflight, root } from '../lib/config.mjs';
import { acquireLock, writeState, expectedEmail } from '../lib/state.mjs';
import { installGuard } from '../lib/network.mjs';

const [command, ...args] = process.argv.slice(2);
const permitted = new Set(['--role=user', '--role=admin', '--project=desktop', '--project=mobile', '--headed', '--public-only', '--allow-digest-writes']);
if (args.some(arg => !permitted.has(arg)) || !['auth', 'smoke', 'list'].includes(command)) throw Error('Use documented auth/smoke/list options; custom configs, retries, worker counts and repeat flags are not supported.');
const config = readConfig();
if (process.env.CI) throw Error('Do not point CI at shared development. Use npm test and npm run selftest for isolated tooling validation.');
const release = acquireLock();
try {
  if (command !== 'list') await preflight(config);
  if (command === 'auth') {
    const role = args.includes('--role=admin') ? 'admin' : 'user';
    if (!expectedEmail(config, role)) throw Error('Configure the dedicated account email before authentication.');
    const browser = await chromium.launch({ headless: false });
    try {
      const context = await browser.newContext({ baseURL: config.baseURL, serviceWorkers: 'block', acceptDownloads: false });
      const guard = await installGuard(context, config, role, { login: true });
      const page = await context.newPage();
      console.log(`Sign in with the configured ${role} account in the browser. No password is recorded by this helper.`);
      await page.goto(`${config.baseURL}/radar/login`);
      await page.getByLabel('Email address', { exact: false }).fill(expectedEmail(config, role));
      const deadline = Date.now() + 5 * 60 * 1000;
      while (!guard.state.verifiedUser && Date.now() < deadline && !page.isClosed()) {
        guard.assertSafe(); await new Promise(resolve => setTimeout(resolve, 250));
      }
      guard.assertSafe();
      if (!guard.state.verifiedUser) throw Error('Login was not completed. No session saved.');
      await page.getByRole('heading', { name: /^Welcome,/, level: 1 }).waitFor({ timeout: 15000 });
      writeState(config, role, guard.state.verifiedUser, await context.storageState());
      console.log(`Saved a private ${role} session under .local/. Do not share it or use it in a second concurrent run.`);
    } finally { await browser.close(); }
  } else {
    const cli = createRequire(import.meta.url).resolve('@playwright/test/cli');
    const options = args.filter(arg => arg.startsWith('--project=') || arg === '--headed');
    if (command === 'list') options.push('--list');
    if (args.includes('--public-only')) options.push('--grep', '@public');
    const writes = command === 'smoke' && args.includes('--allow-digest-writes');
    if (writes && !config.allowDigestWrites) throw Error('Also set allowDigestWrites=true to consent to the one-record CRUD test.');
    console.log(writes ? 'Approved: create/edit/delete ONE isolated smoke digest. Research, schedule and payment writes remain blocked.' : 'Read-only smoke: authentication refresh only; no real digest, schedule, payment, email or research commands.');
    const child = spawn(process.execPath, [cli, 'test', '--config=playwright.config.mjs', ...options], {
      cwd: root, stdio: 'inherit', env: { ...process.env, RADAR_ACCEPTANCE_WRITE_APPROVAL: writes ? 'yes' : 'no', RADAR_ACCEPTANCE_LIST_ONLY: command === 'list' ? 'yes' : 'no' },
    });
    const stop = () => child.kill();
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
    const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (value) => resolve(value ?? 1)); });
    process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
    process.exitCode = code;
  }
} finally { release(); }
