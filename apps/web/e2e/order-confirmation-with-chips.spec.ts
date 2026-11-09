import { expect, test } from '@playwright/test';
import { io } from 'socket.io-client';

import { login, openApp, retailerOwner, seed, wholesalerAdmin, PASSWORD } from './support';

test.describe('order confirmation with assisted reply chips', () => {
  let orderId = '';
  let catalogProductId = '';

  test.beforeAll(async () => {
    const seeded = await seed('order-up');
    orderId = seeded.orderId ?? '';
    catalogProductId = seeded.catalogProductId ?? '';
  });

  test.afterAll(async () => {
    await seed('order-down');
  });

  test('inserts a chip, sends it, then locks the order', async ({ page, request }) => {
    await login(page, wholesalerAdmin);
    await openApp(page, `/wholesaler/orders/${orderId}`);

    const chipRow = page.getByText('Quick reply', { exact: true }).locator('xpath=..');
    await expect(chipRow).toBeVisible();
    await expect(chipRow.getByRole('button')).toHaveCount(4);
    const aiChip = chipRow.locator('span[title="Planned for Version 2"]');
    await expect(aiChip).toBeVisible();
    await expect(chipRow.locator('button, span[title]').last()).toHaveAttribute(
      'title',
      'Planned for Version 2',
    );

    const draft = page.locator('#order-chat-draft');
    await aiChip.click({ force: true });
    await expect(draft).toHaveValue('');

    await chipRow.getByRole('button', { name: 'Yes, all available' }).click();
    await expect(draft).toHaveValue('Yes, all available');
    await expect(draft).toBeFocused();
    await expect(chipRow.getByRole('button', { name: 'Confirm order' })).toHaveCount(0);

    await draft.fill('Yes, all available — packed today');
    const refreshed = page.waitForResponse(
      (response) => response.url().includes('/chat/suggested-replies') && response.ok(),
    );
    await page.getByRole('button', { name: 'Send' }).click();
    await refreshed;
    await expect(page.getByText('Yes, all available — packed today')).toBeVisible();

    await page.getByRole('button', { name: 'Confirm order' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(/Confirm order #/)).toBeVisible();
    await dialog.getByRole('button', { name: 'Confirm order' }).click();

    await expect(page.getByText('Order confirmed · locked')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Order locked' })).toBeDisabled();
    await expect(page.getByText('Order confirmed — no further changes possible')).toBeVisible();
    await expect(page.getByText('Quick reply')).toHaveCount(0);

    const loginResponse = await request.post('http://localhost:4000/api/v1/auth/login', {
      data: { email: retailerOwner, password: PASSWORD },
    });
    expect(loginResponse.ok()).toBeTruthy();
    const token = (await loginResponse.json()).data.accessToken as string;
    const ack = await proposeChange(token, orderId, catalogProductId);
    expect(ack.success).toBe(false);
    expect(ack.error?.code).toBe('ORDER_LOCKED');
  });
});

function proposeChange(
  token: string,
  orderId: string,
  catalogProductId: string,
): Promise<{ success: boolean; error?: { code: string } }> {
  return new Promise((resolve, reject) => {
    const socket = io('http://localhost:4000', {
      auth: { token },
      transports: ['websocket'],
      reconnection: false,
      timeout: 8_000,
    });
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error('Socket propose_change timed out'));
    }, 8_000);
    socket.on('connect_error', (error) => {
      clearTimeout(timer);
      socket.close();
      reject(error);
    });
    socket.on('connect', () => {
      socket.timeout(5_000).emit(
        'propose_change',
        {
          orderId,
          changes: [{ catalogProductId, quantity: 2, agreedPrice: '900.00' }],
        },
        (error: Error | null, body: { success: boolean; error?: { code: string } }) => {
          clearTimeout(timer);
          socket.close();
          if (error) {
            reject(error);
            return;
          }
          resolve(body);
        },
      );
    });
  });
}
