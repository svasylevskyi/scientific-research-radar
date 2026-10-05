/** Isolated tooling validation only: loopback static build, synthetic catalogue, no real API/accounts. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { root } from '../lib/config.mjs';
import { installGuard } from '../lib/network.mjs';
import { sampleNavigation, planIntervals, publicNavigation } from '../lib/public-cases.mjs';

const dist = path.resolve(root, '../frontend/dist');
await readFile(path.join(dist, 'index.html')); // Fail with a clear missing-build error before launching.
const calls = [];
const plan = { code: 'free', revision: 1, name: 'Free', description: 'Synthetic self-test plan; not a real offer.',
  billing_type: 'free', currency: 'EUR', monthly_price: '0.00', annual_price: null, tax_display: 'inclusive',
  max_digests: 2, max_papers_per_run: 5, papers_per_month: 10, runs_per_month: 2,
  manual_runs_per_month: 2, schedule_frequencies: [], email_delivery: false };
const types = { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.html': 'text/html', '.woff2': 'font/woff2' };
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  calls.push([req.method, pathname]);
  if (pathname === '/redirect') { res.writeHead(302, { location: 'https://example.invalid/never-follow' }); res.end(); return; }
  if (pathname === '/api/v1/subscription/plans') {
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ sandbox: true, items: [plan, {
      ...plan, code: 'paid', name: 'Synthetic paid plan', billing_type: 'stripe', monthly_price: '9.00', annual_price: '90.00',
    }] })); return;
  }
  if (pathname.startsWith('/api/')) {
    res.writeHead(401, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ detail: 'Anonymous loopback self-test.' })); return;
  }
  try {
    const candidate = path.resolve(dist, '.' + decodeURIComponent(pathname));
    if (!candidate.startsWith(dist + path.sep) && candidate !== dist) throw Error('outside static directory');
    const file = path.extname(pathname) ? candidate : path.join(dist, 'index.html');
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
// Internal loopback test configuration is not accepted by the remote runner's HTTPS validator.
const config = { baseURL: origin, userEmail: 'nobody@example.test', adminEmail: null, allowDigestWrites: false };
let browser;
try {
  browser = await chromium.launch();
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    for (const scenario of [sampleNavigation, planIntervals, publicNavigation]) {
      const context = await browser.newContext({ baseURL: origin, viewport, serviceWorkers: 'block' });
      const guard = await installGuard(context, config, 'public');
      const page = await context.newPage();
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      try {
        await scenario(page); guard.assertSafe(); assert.deepEqual(errors, []);
        console.log(`PASS isolated built-UI ${scenario.name} ${viewport.width}px`);
      } finally { await context.close(); }
    }
  }
  const context = await browser.newContext({ baseURL: origin, serviceWorkers: 'block' });
  const guard = await installGuard(context, config, 'public');
  const page = await context.newPage(); await page.goto('/');
  const forbidden = ['/api/v1/subscription/billing/checkout', '/api/v1/digests/11111111-1111-1111-1111-111111111111/runs', '/api/v1/contact'];
  for (const p of forbidden) await page.evaluate(p => fetch(p, { method: 'POST' }).catch(() => null), p);
  await page.evaluate(() => fetch('https://example.invalid/blocked').catch(() => null));
  assert.ok(guard.violations.length >= 4);
  for (const p of forbidden) assert.equal(calls.some(([method, url]) => method === 'POST' && url === p), false);
  guard.simulateSaveFailure();
  const simulated = await page.evaluate(async () => (await fetch('/api/v1/digests', { method: 'POST' })).status);
  assert.equal(simulated, 503); assert.equal(calls.some(([method, url]) => method === 'POST' && url === '/api/v1/digests'), false);
  await context.close();
  console.log('PASS browser request fence: payment/research/contact/external requests blocked and failure simulation did not reach the server.');
} finally {
  await browser?.close();
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
