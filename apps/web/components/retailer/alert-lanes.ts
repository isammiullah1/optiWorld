import type { AlertType, RetailerAlert } from '@optiworld/shared';
import {
  BadgeCheck,
  Banknote,
  ClipboardList,
  FileWarning,
  FlaskConical,
  Handshake,
  PackageCheck,
  Truck,
  type LucideIcon,
} from 'lucide-react';

export type AlertLane = 'orders' | 'lab' | 'stock';

export function groupAlerts(alerts: readonly RetailerAlert[]): Record<AlertLane, RetailerAlert[]> {
  const grouped: Record<AlertLane, RetailerAlert[]> = { orders: [], lab: [], stock: [] };
  for (const alert of alerts) {
    grouped[laneOf(alert.type)].push(alert);
  }
  grouped.lab.sort(
    (left, right) =>
      Number(right.type === 'CONNECTION_REQUEST') - Number(left.type === 'CONNECTION_REQUEST'),
  );
  return grouped;
}

export function alertHref(alert: RetailerAlert): string {
  const id = alert.relatedEntityId;
  if (alert.type === 'LOW_STOCK') {
    return id ? `/retailer/inventory/${id}` : '/retailer/inventory';
  }
  if (alert.type === 'PAYMENT_DUE' || alert.type === 'PAYMENT_OVERDUE') {
    return alert.relatedEntityType === 'Customer' && id
      ? `/retailer/customers/${id}`
      : '/retailer/ledger';
  }
  if (alert.type === 'LAB_JOB_STATUS' || alert.type === 'LAB_JOB_READY') {
    return id ? `/retailer/lab-jobs/${id}` : '/retailer/lab-jobs';
  }
  if (alert.type === 'CONNECTION_REQUEST') {
    return '/retailer/laboratories';
  }
  if (alert.type === 'INVOICE_REVIEW') {
    return id ? `/retailer/billing/${id}` : '/retailer/reports/sales';
  }
  if (alert.type.startsWith('ORDER_')) {
    return id ? `/retailer/orders/${id}` : '/retailer/orders';
  }
  return '/retailer/alerts';
}

export function alertIcon(type: AlertType): LucideIcon {
  if (type === 'CONNECTION_REQUEST') {
    return Handshake;
  }
  if (type === 'LAB_JOB_READY') {
    return PackageCheck;
  }
  if (type === 'LAB_JOB_STATUS') {
    return FlaskConical;
  }
  if (type === 'ORDER_DISPATCHED') {
    return Truck;
  }
  if (type === 'ORDER_DELIVERED' || type === 'ORDER_CONFIRMED') {
    return BadgeCheck;
  }
  if (type === 'PAYMENT_DUE' || type === 'PAYMENT_OVERDUE') {
    return Banknote;
  }
  if (type === 'INVOICE_REVIEW') {
    return FileWarning;
  }
  return ClipboardList;
}

export function stockMark(body: string): { sign: '+' | '-'; count: string | null } {
  const match = /is at (\d+)/.exec(body);
  const added = /added|restock|increased/i.test(body);
  return { sign: added ? '+' : '-', count: match?.[1] ?? null };
}

function laneOf(type: AlertType): AlertLane {
  if (type === 'LOW_STOCK') {
    return 'stock';
  }
  if (type === 'LAB_JOB_STATUS' || type === 'LAB_JOB_READY' || type === 'CONNECTION_REQUEST') {
    return 'lab';
  }
  return 'orders';
}
