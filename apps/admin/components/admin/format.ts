import type { OrgType, PlanType } from '@optiworld/shared';

export function formatDay(value: string | null): string {
  if (!value) {
    return '—';
  }
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(value));
}

export function formatWhen(value: string | null): string {
  if (!value) {
    return '—';
  }
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(value));
}

export function orgTypeLabel(type: OrgType): string {
  if (type === 'RETAILER') {
    return 'Retailer';
  }
  if (type === 'WHOLESALER') {
    return 'Wholesaler';
  }
  return 'Laboratory';
}

export function planLabel(plan: PlanType): string {
  if (plan === 'RETAILER_STANDARD') {
    return 'Retailer standard';
  }
  if (plan === 'WHOLESALER_STANDARD') {
    return 'Wholesaler standard';
  }
  return 'Laboratory standard';
}

export function roleLabel(role: string): string {
  const labels: Record<string, string> = {
    OWNER: 'Owner',
    STAFF: 'Staff',
    ADMIN: 'Admin',
    ORDER_HANDLER: 'Order handler',
    TECHNICIAN: 'Technician',
  };
  return labels[role] ?? role;
}

export function statusLabel(status: string): string {
  const lower = status.toLowerCase().replaceAll('_', ' ');
  return `${lower.slice(0, 1).toUpperCase()}${lower.slice(1)}`;
}

export function planForType(type: OrgType): PlanType {
  if (type === 'RETAILER') {
    return 'RETAILER_STANDARD';
  }
  if (type === 'WHOLESALER') {
    return 'WHOLESALER_STANDARD';
  }
  return 'LABORATORY_STANDARD';
}

export function utcDay(offset: number): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset))
    .toISOString()
    .slice(0, 10);
}
