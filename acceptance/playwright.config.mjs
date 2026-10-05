import { defineConfig } from '@playwright/test';
import { readConfig } from './lib/config.mjs';
const target = readConfig();
export default defineConfig({
  testDir: './specs', fullyParallel: false, workers: 1, retries: 0, maxFailures: 1,
  forbidOnly: true, timeout: 45000, globalTimeout: 12 * 60 * 1000,
  expect: { timeout: 12000 },
  outputDir: './results/browser',
  reporter: [['list'], ['./lib/reporter.mjs']],
  use: { browserName: 'chromium', baseURL: target.baseURL, ignoreHTTPSErrors: false,
    serviceWorkers: 'block', trace: 'off', screenshot: 'off', video: 'off' },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
});
