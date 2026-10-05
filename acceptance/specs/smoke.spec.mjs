import { sampleNavigation, planIntervals, publicNavigation } from '../lib/public-cases.mjs';
import { randomUUID } from 'node:crypto';
import { test, expect, config, workspace, outputPage, noOverflow } from '../lib/fixtures.mjs';

const pageTabs = page => page.getByRole('tablist', { name: 'Digest page sections' });
const detailsTab = page => pageTabs(page).getByRole('tab', { name: 'Digest Details', exact: true });
const outputTab = page => pageTabs(page).getByRole('tab', { name: 'Output & History', exact: true });
const detailsPanel = page => page.getByRole('tabpanel', { name: 'Digest Details', exact: true });

// All case IDs are stable so release records can refer to them independently of wording.
test('SC01 @public sample navigation and dialog keyboard controls', async ({ app: { page } }) => sampleNavigation(page));

test('SC02 @public plan interval tabs work with keyboard without purchases', async ({ app: { page } }) => planIntervals(page));

test('SC03 @public information pages and protected-page sign-in redirect', async ({ app: { page } }) => publicNavigation(page));

test.describe('Ordinary subscriber', () => {
  test.use({ accountRole: 'user' });
  test('SC04 workspace loads and ordinary users cannot open admin pages', async ({ app: { page } }) => {
    await workspace(page); await expect(page.getByRole('heading', { name: 'Your digests', exact: true })).toBeVisible();
    await noOverflow(page);
    await page.goto('/admin/users'); await expect(page).toHaveURL(/\/radar$/);
    await expect(page.getByRole('heading', { name: /^Welcome,/ })).toBeVisible();
  });

  test('SC05 digest form required-field focus and unrestricted topic hint', async ({ app: { page, guard } }) => {
    await page.goto('/radar/digests/new');
    await expect.poll(() => guard.snapshots.has('/api/v1/subscription')).toBe(true);
    test.skip(!guard.snapshots.get('/api/v1/subscription').create_allowed, 'No creation allowance: use a dedicated account with a free digest slot.');
    const topic = page.getByRole('textbox', { name: /^Digest topic/ });
    await expect(topic).toHaveValue(''); await topic.focus();
    await expect(topic).toHaveAttribute('placeholder', /^e\.g\./);
    await page.getByRole('button', { name: 'Create digest', exact: true }).click();
    const error = page.getByRole('alert').filter({ hasText: /check the highlighted fields/i });
    await expect(error).toBeVisible();
    await error.getByRole('button', { name: /^Digest topic:/ }).click(); await expect(topic).toBeFocused();
    await topic.fill('Interdisciplinary questions chosen freely by the reader');
    await expect(page.getByRole('combobox', { name: 'Include keywords (optional)', exact: true })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Exclude keywords (optional)', exact: true })).toBeVisible();
    expect(guard.writes).toHaveLength(0); await noOverflow(page);
  });

  test('SC06 simulated failed create keeps entered values without creating a record', async ({ app: { page, guard } }) => {
    await page.goto('/radar/digests/new');
    await expect.poll(() => guard.snapshots.has('/api/v1/subscription')).toBe(true);
    test.skip(!guard.snapshots.get('/api/v1/subscription').create_allowed, 'No creation allowance.');
    const topic = page.getByRole('textbox', { name: /^Digest topic/ });
    await topic.fill('Acceptance-only unsaved draft');
    const description = page.getByRole('textbox', { name: 'Digest description (optional)', exact: true });
    await description.fill('This draft must survive a simulated response failure.');
    guard.simulateSaveFailure();
    await page.getByRole('button', { name: 'Create digest', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Acceptance-only simulated save failure.' })).toBeVisible();
    await expect(topic).toHaveValue('Acceptance-only unsaved draft');
    await expect(description).toHaveValue('This draft must survive a simulated response failure.');
    expect(guard.writes).toHaveLength(0);
  });

  test('SC07 shared plan cards keep current-plan and exact pending-checkout actions', async ({ app: { page, guard } }) => {
    for (const route of ['/radar/plans', '/radar/subscription#plans']) {
      guard.snapshots.clear();
      await page.goto(route);
      await expect.poll(() => ['/api/v1/subscription', '/api/v1/subscription/plans', '/api/v1/subscription/billing'].every(key => guard.snapshots.has(key))).toBe(true);
      const billing = guard.snapshots.get('/api/v1/subscription/billing');
      const access = guard.snapshots.get('/api/v1/subscription');
      const plans = guard.snapshots.get('/api/v1/subscription/plans')?.items;
      await expect(page.getByRole('heading', { name: 'Subscription Plans', exact: true })).toBeVisible();
      expect(Array.isArray(plans) && plans.length > 0).toBe(true);
      for (const [interval, label] of [['monthly', 'Monthly'], ['annual', 'Yearly']]) {
        await page.getByRole('tablist', { name: 'Billing interval' }).getByRole('tab', { name: label, exact: true }).click();
        const visible = page.getByRole('tabpanel', { name: label, exact: true });
        for (const plan of plans) {
          const card = visible.getByRole('region', { name: plan.name, exact: true });
          await expect(card).toBeVisible();
          const current = access?.billing_type === 'free' ? plan.billing_type === 'free' : access?.billing_type === 'stripe' && billing.attempt?.code === plan.code;
          if (current) await expect(card.getByRole('link', { name: 'Review Subscription', exact: true })).toBeVisible();
          else if (access?.billing_type !== 'stripe' && billing.resume_allowed && billing.attempt?.code === plan.code && billing.attempt.interval === interval) {
            await expect(card.getByRole('button', { name: 'Resume Checkout', exact: true })).toBeVisible();
          } else await expect(card.getByRole('button', { name: 'Resume Checkout', exact: true })).toHaveCount(0);
        }
        // Only open initial-checkout confirmation on Free. Paid upgrade preview itself is a write.
        if (access?.billing_type === 'free') {
          const option = visible.getByRole('button', { name: /^Upgrade to / }).filter({ visible: true });
          for (let i = 0; i < await option.count(); i++) {
            if (!await option.nth(i).isEnabled()) continue;
            await option.nth(i).click();
            const dialog = page.getByRole('dialog', { name: 'Continue to Payment?', exact: true });
            await expect(dialog).toBeVisible();
            await expect(dialog.getByRole('button', { name: 'Continue to Payment', exact: true })).toBeVisible();
            await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
            await expect(dialog).toHaveCount(0); break;
          }
        }
      }
      expect(guard.writes).toHaveLength(0); await noOverflow(page);
    }
  });

  test.describe('Saved research fixture', () => {
    test.skip(!config.digestId || !config.runId, 'Configure a dedicated digestId and completed runId for history checks.');
    test('SC08 historical details stay read-only and the editor opens at page top', async ({ app: { page } }) => {
      await outputPage(page);
      await page.getByRole('tablist', { name: 'Selected run output and saved details' }).getByRole('tab', { name: 'Digest Details', exact: true }).click();
      const snapshot = page.getByRole('region', { name: 'Digest details saved with this run' });
      await expect(snapshot).toBeVisible(); const before = await snapshot.innerText();
      await snapshot.getByRole('link', { name: 'Edit current digest details' }).click();
      await expect(detailsTab(page)).toHaveAttribute('aria-selected', 'true');
      await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
      const topic = detailsPanel(page).getByRole('textbox', { name: /^Digest topic/ });
      await expect(topic).toBeVisible(); await topic.fill('Acceptance draft, deliberately not saved');
      await expect(detailsPanel(page).getByText('Radar controls', { exact: true })).toHaveCount(0);
      await outputTab(page).click(); await expect(snapshot).toHaveText(before);
      await detailsTab(page).click(); await expect(topic).toHaveValue('Acceptance draft, deliberately not saved');
      await noOverflow(page);
    });
    test('SC09 supporting-paper navigation retains the run and browser history', async ({ app: { page } }) => {
      await outputPage(page);
      await page.getByRole('tablist', { name: 'Selected run output and saved details' }).getByRole('tab', { name: 'Digest Briefing', exact: true }).click();
      const output = page.getByRole('tabpanel', { name: 'Output & History', exact: true });
      await expect(output.getByRole('heading', { name: 'Executive summary', exact: true })).toBeVisible();
      const reference = output.locator('a[href*="paper_id="]').first();
      test.skip(await reference.count() === 0, 'Selected briefing has no resolvable supporting-paper link.');
      const before = page.url(); const href = new URL(await reference.getAttribute('href'), config.baseURL);
      await reference.click();
      await expect(page).toHaveURL(url => url.searchParams.get('run_id') === config.runId && url.searchParams.get('paper_id') === href.searchParams.get('paper_id'));
      await expect(page.getByRole('tab', { name: 'Paper Summaries', exact: true })).toHaveAttribute('aria-selected', 'true');
      await page.goBack(); await expect(page).toHaveURL(before);
      await page.goForward(); await expect(page).toHaveURL(url => url.searchParams.get('paper_id') === href.searchParams.get('paper_id'));
      await noOverflow(page);
    });
    test('SC10 schedule editor validates missing date without enabling a schedule', async ({ app: { page, guard } }) => {
      await outputPage(page);
      await expect.poll(() => guard.snapshots.has('/api/v1/subscription')).toBe(true);
      test.skip(!guard.snapshots.get('/api/v1/subscription').schedule_allowed, 'Scheduling is not currently available.');
      const control = page.getByRole('button', { name: /^(Schedule runs|Update schedule)$/ });
      await expect(control).toBeVisible();
      test.skip(!await control.isEnabled(), 'Scheduling is not included or currently available on this account.');
      await control.click();
      const firstDate = page.getByLabel('First digest date and time', { exact: false });
      await firstDate.fill(''); await page.getByRole('button', { name: 'Save schedule', exact: true }).click();
      await expect(page.getByRole('alert').filter({ hasText: 'Check the schedule dates' })).toBeVisible();
      await page.getByRole('button', { name: /^First date:/ }).click(); await expect(firstDate).toBeFocused();
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      expect(guard.writes).toHaveLength(0); await noOverflow(page);
    });
  });

  test('SC12 @writes create edit and delete only a new acceptance-owned digest', async ({ app: { page, guard } }) => {
    test.skip(!config.allowDigestWrites || process.env.RADAR_ACCEPTANCE_WRITE_APPROVAL !== 'yes', 'Real CRUD requires both allowDigestWrites and --allow-digest-writes.');
    await page.goto('/radar/digests/new');
    await expect.poll(() => guard.snapshots.has('/api/v1/subscription')).toBe(true);
    test.skip(!guard.snapshots.get('/api/v1/subscription').create_allowed, 'No free digest slot for isolated CRUD.');
    const topic = `Acceptance smoke ${randomUUID()}`;
    guard.permitNewDigest(topic);
    await page.getByRole('textbox', { name: /^Digest topic/ }).fill(topic);
    await page.getByLabel('Maximum papers', { exact: false }).fill('1');
    try {
      await page.getByRole('button', { name: 'Create digest', exact: true }).click();
      await expect.poll(() => guard.state.createdId).toBeTruthy();
      await expect(outputTab(page)).toHaveAttribute('aria-selected', 'true');
      await detailsTab(page).click();
      await detailsPanel(page).getByRole('textbox', { name: 'Digest description (optional)', exact: true }).fill('Acceptance edit verified through the real development API.');
      await detailsPanel(page).getByRole('button', { name: 'Save changes', exact: true }).click();
      await expect(detailsPanel(page).getByRole('status').filter({ hasText: 'Digest details updated.' })).toBeVisible();
      await page.reload();
      await expect(detailsPanel(page).getByRole('textbox', { name: 'Digest description (optional)', exact: true })).toHaveValue('Acceptance edit verified through the real development API.');
    } finally {
      if (guard.state.createdId) {
        // Never look up by name or delete any fixture/pre-existing record.
        await page.goto(`/radar/digests/${guard.state.createdId}`);
        await expect(page.getByRole('heading', { level: 1, name: topic, exact: true })).toBeVisible();
        await page.getByRole('button', { name: 'Delete digest', exact: true }).click();
        await page.getByRole('dialog').getByRole('button', { name: 'Delete permanently', exact: true }).click();
        await expect(page).toHaveURL(/\/radar(?:\?.*)?$/);
      }
    }
    expect(guard.writes.map(write => write.method)).toEqual(['POST', 'PATCH', 'DELETE']);
  });
});

test.describe('Support read-only navigation', () => {
  test.use({ accountRole: 'admin' });
  test.skip(!config.adminEmail, 'Configure and authenticate a dedicated ordinary admin to check support navigation.');
  test('SC11 administrator user search retains its return context', async ({ app: { page } }) => {
    const original = `/admin/users?query=${encodeURIComponent(config.userEmail)}`;
    await page.goto(original);
    await expect(page.getByRole('textbox', { name: 'Name or email', exact: true })).toHaveValue(config.userEmail);
    const view = page.getByRole('link', { name: /^View user / }).filter({ visible: true });
    await expect(view).toHaveCount(1); await view.click();
    await expect(page.getByText('Account overview', { exact: true })).toBeVisible();
    await page.goBack(); await expect(page).toHaveURL(new URL(original, config.baseURL).href);
    await noOverflow(page);
  });
});
