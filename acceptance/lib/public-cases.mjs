import { expect } from '@playwright/test';
export async function noOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'No horizontal page overflow').toBe(true);
}
export async function sampleNavigation(page) {
  await page.goto('/');
  const gallery = page.getByRole('region', { name: 'Research digest samples' });
  const heading = gallery.getByRole('heading', { level: 2 });
  await expect(heading).toBeVisible();
  const original = await heading.innerText();
  await gallery.getByRole('button', { name: 'Next sample', exact: true }).click();
  await expect(heading).not.toHaveText(original);
  await gallery.getByRole('button', { name: 'Previous sample', exact: true }).click();
  await expect(heading).toHaveText(original);
  // Choose by its explicit accessibility state, not its random initial position.
  const targetName = await gallery.locator('button[aria-controls]:not([aria-current="true"])').first().getAttribute('aria-label');
  const target = gallery.getByRole('button', { name: targetName, exact: true });
  await target.focus(); await page.keyboard.press('Enter');
  await expect(target).toHaveAttribute('aria-current', 'true');
  await gallery.getByRole('button', { name: 'Read summary and sources' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(gallery.getByRole('button', { name: 'Read summary and sources' })).toBeFocused();
  await noOverflow(page);
}

export async function planIntervals(page) {
  await page.goto('/plans');
  await expect(page.getByRole('heading', { name: 'Subscription Plans', exact: true })).toBeVisible();
  const tabs = page.getByRole('tablist', { name: 'Billing interval' });
  const monthly = tabs.getByRole('tab', { name: 'Monthly', exact: true });
  await monthly.focus(); await page.keyboard.press('ArrowRight');
  await expect(tabs.getByRole('tab', { name: 'Yearly', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel', { name: 'Yearly', exact: true })).toBeVisible();
  await page.keyboard.press('ArrowLeft'); await expect(monthly).toHaveAttribute('aria-selected', 'true');
  await noOverflow(page);
}

export async function publicNavigation(page) {
  for (const route of ['/about', '/contact', '/privacy', '/terms']) {
    await page.goto(route); await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await noOverflow(page);
  }
  await page.goto('/radar/digests/new'); await expect(page).toHaveURL(/\/radar\/login$/);
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Forgot your password?' })).toBeVisible();
  // No registration, recovery email, or login-failure spam is sent by smoke tests.
}
