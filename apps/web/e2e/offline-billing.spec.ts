import { expect, test } from '@playwright/test';

import { login, openApp, readLocalInvoices, retailerOwner, seed } from './support';

test.describe('offline billing', () => {
  test.beforeAll(async () => {
    await seed('billing-up');
  });

  test.afterAll(async () => {
    await seed('billing-down');
  });

  test('saves a sale locally and syncs it when the network returns', async ({ page }) => {
    await login(page, retailerOwner);
    const pull = page.waitForResponse(
      (response) => response.url().includes('/api/v1/sync/pull') && response.ok(),
    );
    await openApp(page, '/retailer/billing/new');
    await pull;

    await page.route('**/*', (route) => route.abort());
    await page.context().setOffline(true);
    await expect(page.getByText('Offline — invoices saving locally')).toBeVisible();

    await page.getByLabel('Search products').fill('SV500');
    await page.getByRole('button', { name: /SV500/ }).click();
    await page.getByRole('button', { name: /Tariq Hussain/ }).click();
    await page.getByRole('button', { name: 'No prescription for this item' }).click();
    await page.getByRole('button', { name: 'Cash' }).click();
    await page.getByRole('button', { name: /Complete Sale/ }).click();

    await expect
      .poll(async () => {
        const invoices = await readLocalInvoices(page);
        return invoices.some(
          (invoice) => invoice.customerName === 'Tariq Hussain' && invoice.syncStatus === 'PENDING',
        );
      })
      .toBe(true);

    await page.unroute('**/*');
    await page.context().setOffline(false);
    await expect(
      page.getByRole('status').filter({ hasText: /Back online — syncing/ }),
    ).toBeVisible();
    await expect(
      page.getByRole('status').filter({ hasText: /Back online — syncing/ }),
    ).toBeHidden();

    await openApp(page, '/retailer/dashboard');
    await expect(page.getByRole('heading', { name: 'New bill' })).toBeVisible();

    const invoice = await seed('latest-invoice');
    expect(Number(invoice.invoiceNumber)).toBeGreaterThan(0);
  });
});
