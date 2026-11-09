import { expect, test } from '@playwright/test';

import { login, openApp, pricesHiddenRetailer, seed } from './support';

test.describe('price protection', () => {
  let hiddenWholesalerId = '';
  let otherWholesalerId = '';

  test.beforeAll(async () => {
    const seeded = await seed('prices-up');
    hiddenWholesalerId = seeded.hiddenWholesalerId ?? '';
    otherWholesalerId = seeded.otherWholesalerId ?? '';
  });

  test.afterAll(async () => {
    await seed('prices-down');
  });

  test('hides every catalog price and blocks another wholesaler', async ({ page }) => {
    await login(page, pricesHiddenRetailer);
    await openApp(page, `/retailer/wholesalers/${hiddenWholesalerId}/catalog`);
    const cards = page
      .locator('tbody tr')
      .filter({ has: page.getByRole('button', { name: 'Add to order' }) });
    await expect(cards.first()).toBeVisible();
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);
    await expect(cards.getByText('Price on request')).toHaveCount(count);
    const cardHtml = await cards.evaluateAll((nodes) =>
      nodes.map((node) => node.innerHTML).join('\n'),
    );
    expect(cardHtml).not.toContain('₨');
    expect(cardHtml).not.toMatch(/\d+\.\d{2}/);

    const catalog = await page.evaluate(async (wholesalerId) => {
      const session = (await fetch('/api/auth/session').then((response) => response.json())) as {
        accessToken?: string;
      };
      const response = await fetch(`http://localhost:4000/api/v1/catalog/${wholesalerId}`, {
        headers: { authorization: `Bearer ${session.accessToken ?? ''}` },
      });
      return response.json() as Promise<{
        success: boolean;
        data?: { products?: Array<{ listedPrice: string | null }> };
      }>;
    }, hiddenWholesalerId);
    expect(catalog.success).toBe(true);
    const products = catalog.data?.products ?? [];
    expect(products.length).toBeGreaterThan(0);
    expect(products.every((product) => product.listedPrice === null)).toBe(true);

    await page.goto(`/retailer/wholesalers/${otherWholesalerId}/catalog`);
    await expect(page).toHaveURL(/\/retailer\/wholesalers\/?$/);
  });
});
