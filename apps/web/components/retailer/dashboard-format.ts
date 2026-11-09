import type { AlertType, InvoiceStatus } from '@optiworld/shared';

export function formatRupee(value: string): string {
  return `₨ ${formatMoney(value)}`;
}

export function formatMoney(value: string): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return value;
  }
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatSalesChange(value: number | null): string {
  if (value === null) {
    return 'No sales yesterday';
  }
  const rounded = Math.round(value * 10) / 10;
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded}% vs yesterday`;
}

export function invoiceStatusLabel(status: InvoiceStatus): string {
  return status === 'PAID' ? 'Paid' : 'Credit';
}

export function alertDotClass(type: AlertType): string {
  if (type === 'PAYMENT_OVERDUE') {
    return 'bg-danger';
  }
  if (type === 'LOW_STOCK' || type === 'PAYMENT_DUE' || type === 'INVOICE_REVIEW') {
    return 'bg-amber';
  }
  if (type === 'LAB_JOB_READY' || type === 'ORDER_DELIVERED' || type === 'ORDER_DISPATCHED') {
    return 'bg-teal';
  }
  return 'bg-action';
}

export function greeting(now: Date): string {
  const hour = now.getHours();
  if (hour < 12) {
    return 'Good morning';
  }
  if (hour < 17) {
    return 'Good afternoon';
  }
  return 'Good evening';
}

export function firstName(name: string): string {
  const [first] = name.trim().split(/\s+/);
  return first && first.length > 0 ? first : 'there';
}

export function formatShortDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

const RELATIVE_UNITS = [
  ['year', 60 * 60 * 24 * 365],
  ['month', 60 * 60 * 24 * 30],
  ['day', 60 * 60 * 24],
  ['hour', 60 * 60],
  ['minute', 60],
] as const;

export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) {
    return '';
  }
  const seconds = Math.round((now.getTime() - then.getTime()) / 1000);
  const past = seconds >= 0;
  const elapsed = Math.abs(seconds);
  if (elapsed < 45) {
    return past ? 'just now' : 'in a moment';
  }
  for (const [unit, size] of RELATIVE_UNITS) {
    if (elapsed >= size) {
      const count = Math.max(1, Math.round(elapsed / size));
      const label = count === 1 ? unit : `${unit}s`;
      return past ? `${count} ${label} ago` : `in ${count} ${label}`;
    }
  }
  return past ? 'just now' : 'in a moment';
}
