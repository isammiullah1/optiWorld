import { expect, test } from '@playwright/test';

import { login, openApp, retailerOwner, seed, tariqPhone } from './support';

test.describe('retailer billing', () => {
  let customerId = '';

  test.beforeAll(async () => {
    const seeded = await seed('billing-up');
    customerId = seeded.customerId ?? '';
  });

  test.afterAll(async () => {
    await seed('billing-down');
  });

  test('completes a cash sale, sends the receipt, and starts a new invoice', async ({ page }) => {
    const whatsappCalls: Array<{ invoiceId?: string }> = [];
    await page.route('**/api/v1/whatsapp/**', async (route) => {
      const body = route.request().postDataJSON() as { invoiceId?: string };
      whatsappCalls.push(body);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { sent: true, message: 'Receipt sent on WhatsApp.' },
        }),
      });
    });
    await page.route('**/graph.facebook.com/**', (route) => route.abort());

    await login(page, retailerOwner);
    await openApp(page, '/retailer/billing/new');
    await page.getByLabel('Customer name').fill('Tariq');
    await page.getByRole('button', { name: /Tariq Hussain/ }).click();
    await page.getByLabel('Search products').fill('SV500');
    await page.getByRole('button', { name: /SV500/ }).click();
    await page.getByRole('button', { name: 'No prescription for this item' }).click();

    await expect(
      page.getByRole('paragraph').filter({ hasText: 'Single Vision SV500' }),
    ).toBeVisible();
    await expect(page.getByLabel('Customer name')).toHaveValue('Tariq Hussain');
    await page.getByRole('button', { name: 'Cash' }).click();
    await page.getByRole('button', { name: /Complete Sale/ }).click();

    await expect(page).toHaveURL(/\/retailer\/billing\/[^/]+\/receipt/);
    await expect(page.getByText(/Invoice #/)).toBeVisible();
    const invoiceId = page.url().split('/').at(-2) ?? '';

    const invoice = await seed('invoice', [invoiceId]);
    expect(invoice.customerId).toBe(customerId);
    expect(invoice.status).toBe('PAID');
    expect(invoice.phone).toBe(tariqPhone);
    expect(invoice.priceCodes?.split(',')).toContain('SV500');

    await page.getByRole('button', { name: 'Send via WhatsApp' }).click();
    await expect.poll(() => whatsappCalls.length).toBe(1);
    expect(whatsappCalls[0]?.invoiceId).toBe(invoiceId);

    await page.getByRole('link', { name: 'New Invoice' }).click();
    await expect(page).toHaveURL(/\/retailer\/billing\/new/);
    await expect(page.getByLabel('Customer name')).toHaveValue('');
    await expect(page.getByText('Single Vision SV500')).toHaveCount(0);
  });
});
