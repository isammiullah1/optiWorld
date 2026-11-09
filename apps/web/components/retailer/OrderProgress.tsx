import type { OrderStatus } from '@optiworld/shared';

const STEPS = ['PENDING', 'CONFIRMED', 'DISPATCHED', 'DELIVERED'] as const;

const LABEL: Record<OrderStatus, string> = {
  PENDING: 'Pending',
  CONFIRMED: 'Confirmed',
  DISPATCHED: 'Dispatched',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

export function OrderProgress({ status }: { status: OrderStatus }): React.ReactElement {
  if (status === 'CANCELLED') {
    return <p className="text-sm font-medium text-danger">This order is cancelled.</p>;
  }
  const current = STEPS.indexOf(status);
  return (
    <ol className="grid grid-cols-4 gap-2">
      {STEPS.map((step, index) => {
        const done = index <= current;
        return (
          <li key={step} className="grid gap-1">
            <span className={`h-1 rounded-full ${done ? 'bg-teal' : 'bg-line'}`} />
            <span className={`text-xs uppercase ${done ? 'text-teal' : 'text-ink3'}`}>
              {LABEL[step]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function orderStatusClass(status: OrderStatus): string {
  if (status === 'PENDING') {
    return 'bg-amber-soft text-amber';
  }
  if (status === 'CONFIRMED') {
    return 'bg-action-soft text-action';
  }
  if (status === 'DISPATCHED') {
    return 'bg-teal-soft text-teal';
  }
  if (status === 'CANCELLED') {
    return 'bg-danger-soft text-danger';
  }
  return 'bg-canvas text-ink2';
}

export function orderStatusLabel(status: OrderStatus): string {
  return LABEL[status];
}
