import { moneyToCents, type PaymentMethod } from '@optiworld/shared';

import { formatRupee, formatShortDate } from './dashboard-format';

export function BillSettlement({
  paymentType,
  amountPaid,
  outstanding,
  payments,
}: {
  paymentType: PaymentMethod;
  amountPaid: string;
  outstanding: string;
  payments?: readonly { amount: string; recordedAt: string; notes: string | null }[];
}): React.ReactElement | null {
  const pending = moneyToCents(outstanding) > 0;
  if (paymentType !== 'CREDIT' && !pending) {
    return null;
  }
  return (
    <div className="grid gap-2 border-t border-action-soft pt-3">
      <div className="flex items-center justify-between gap-3 text-ink2">
        <span>Amount paid</span>
        <span className="font-medium text-action">{formatRupee(amountPaid)}</span>
      </div>
      <div className="flex items-center justify-between gap-3 font-medium text-ink">
        <span>Balance</span>
        <span className={pending ? 'text-danger' : 'text-teal'}>
          {pending ? `−${formatRupee(outstanding)}` : formatRupee('0.00')}
        </span>
      </div>
      {payments && payments.length > 0 ? (
        <ul className="grid gap-1 text-xs text-ink2">
          {payments.map((payment, index) => (
            <li key={`${payment.recordedAt}-${index}`}>
              {formatShortDate(payment.recordedAt)} · {formatRupee(payment.amount)}
              {payment.notes ? ` · ${payment.notes}` : ''}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
