import { prisma } from '@optiworld/db';
import type { AuthSessionUser } from '@optiworld/shared';

import { logger } from '../lib/logger.js';

export async function notifyRetailerOrderStatus(
  auth: AuthSessionUser,
  orderId: string,
  status: 'DISPATCHED' | 'DELIVERED',
): Promise<{ sent: boolean; message: string }> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, wholesalerOrgId: auth.orgId ?? '' },
    select: {
      id: true,
      retailer: { select: { phone: true, whatsappNumber: true, name: true } },
      wholesaler: { select: { name: true } },
    },
  });
  if (!order) {
    return { sent: false, message: 'The status was updated.' };
  }
  const reference = order.id.replace(/-/g, '').slice(0, 8).toUpperCase();
  const phone = digitsOnly(order.retailer.whatsappNumber ?? order.retailer.phone ?? '');
  const label = status === 'DISPATCHED' ? 'dispatched' : 'delivered';
  const text = `${order.wholesaler.name}: order #${reference} is ${label}.`;
  if (!phone) {
    await logAttempt(auth, orderId, false, 'Retailer has no phone number');
    return {
      sent: false,
      message: 'Status updated. This retailer has no phone number for WhatsApp.',
    };
  }
  const token = process.env.WHATSAPP_API_TOKEN ?? '';
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID ?? '';
  if (!token || !phoneNumberId) {
    await logAttempt(auth, orderId, false, 'WhatsApp is not configured');
    return { sent: false, message: 'Status updated. WhatsApp is not configured yet.' };
  }
  try {
    const response = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phone,
        type: 'template',
        template: {
          name: 'optiworld_order_status',
          language: { code: 'en' },
          components: [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: order.wholesaler.name },
                { type: 'text', text: reference },
                { type: 'text', text: label },
              ],
            },
          ],
        },
      }),
    });
    if (!response.ok) {
      await logAttempt(auth, orderId, false, `WhatsApp returned ${response.status}`);
      return { sent: false, message: 'Status updated. WhatsApp could not send the notification.' };
    }
    await logAttempt(auth, orderId, true, text);
    return { sent: true, message: 'Status updated. The retailer was notified on WhatsApp.' };
  } catch (error) {
    logger.error('WhatsApp order status failed', {
      message: error instanceof Error ? error.message : 'Unknown error',
    });
    await logAttempt(auth, orderId, false, 'WhatsApp request failed');
    return { sent: false, message: 'Status updated. WhatsApp could not send the notification.' };
  }
}

export async function notifyWholesalerCancellationCall(
  auth: AuthSessionUser,
  orderId: string,
): Promise<{ sent: boolean; message: string }> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, retailerOrgId: auth.orgId ?? '' },
    select: {
      id: true,
      retailer: { select: { name: true, phone: true } },
      wholesaler: { select: { phone: true, whatsappNumber: true, name: true } },
    },
  });
  const saved = 'The cancellation request was sent to the wholesaler.';
  if (!order) {
    return { sent: false, message: saved };
  }
  const reference = order.id.replace(/-/g, '').slice(0, 8).toUpperCase();
  const phone = digitsOnly(order.wholesaler.whatsappNumber ?? order.wholesaler.phone ?? '');
  const text =
    `${order.retailer.name} asked to cancel order #${reference}. Please call the retailer to discuss it. The order stays confirmed until you accept.`.slice(
      0,
      1024,
    );
  if (!phone) {
    await logAttempt(auth, orderId, false, 'Wholesaler has no phone number');
    return { sent: false, message: `${saved} This wholesaler has no phone number for WhatsApp.` };
  }
  const token = process.env.WHATSAPP_API_TOKEN ?? '';
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID ?? '';
  if (!token || !phoneNumberId) {
    await logAttempt(auth, orderId, false, 'WhatsApp is not configured');
    return { sent: false, message: `${saved} WhatsApp is not configured yet.` };
  }
  try {
    const response = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phone,
        type: 'template',
        template: {
          name: 'optiworld_order_status',
          language: { code: 'en' },
          components: [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: order.retailer.name },
                { type: 'text', text: reference },
                { type: 'text', text: 'please call the retailer about a cancellation' },
              ],
            },
          ],
        },
      }),
    });
    if (!response.ok) {
      await logAttempt(auth, orderId, false, `WhatsApp returned ${response.status}`);
      return { sent: false, message: `${saved} WhatsApp could not send the notification.` };
    }
    await logAttempt(auth, orderId, true, text);
    return { sent: true, message: `${saved} They were asked on WhatsApp to call you.` };
  } catch (error) {
    logger.error('WhatsApp cancellation request failed', {
      message: error instanceof Error ? error.message : 'Unknown error',
    });
    await logAttempt(auth, orderId, false, 'WhatsApp request failed');
    return { sent: false, message: `${saved} WhatsApp could not send the notification.` };
  }
}

async function logAttempt(
  auth: AuthSessionUser,
  orderId: string,
  sent: boolean,
  detail: string,
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      orgId: auth.orgId,
      userId: auth.userId,
      action: sent ? 'WHATSAPP_ORDER_STATUS_SENT' : 'WHATSAPP_ORDER_STATUS_FAILED',
      entityType: 'Order',
      entityId: orderId,
      metadata: { detail: detail.slice(0, 500) },
    },
  });
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}
