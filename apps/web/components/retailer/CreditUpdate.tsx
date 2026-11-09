'use client';

import { centsToMoney, moneyToCents, type CustomerCreditBills } from '@optiworld/shared';
import { useEffect, useState } from 'react';

import { formatRupee, formatShortDate } from './dashboard-format';
import { loadCustomerCreditBills, receiveCustomerCredit } from './ledger-api';

export function CreditUpdate({
  token,
  customerId,
  customerName,
  onSaved,
}: {
  token: string;
  customerId: string;
  customerName: string;
  onSaved: () => void;
}): React.ReactElement {
  const [bills, setBills] = useState<CustomerCreditBills | null>(null);
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void loadCustomerCreditBills(token, customerId)
      .then((next) => {
        if (active) {
          setBills(next);
          setError(null);
        }
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(caught instanceof Error ? caught.message : 'The open bills could not be loaded');
        }
      });
    return () => {
      active = false;
    };
  }, [customerId, token]);

  async function save(): Promise<void> {
    if (!bills) {
      return;
    }
    const entered = amount.trim();
    const received = /^\d{1,10}(\.\d{1,2})?$/.test(entered) ? moneyToCents(entered) : null;
    const due = moneyToCents(bills.outstanding);
    if (received === null || received <= 0 || received > due) {
      setError('Enter an amount up to the balance.');
      setNotice(null);
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await receiveCustomerCredit(token, customerId, centsToMoney(received));
      const next = await loadCustomerCreditBills(token, customerId);
      setBills(next);
      setAmount('');
      setNotice('Amount received was saved.');
      onSaved();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'The payment could not be saved');
    } finally {
      setBusy(false);
    }
  }

  if (!bills && !error) {
    return <div className="h-24 animate-pulse rounded-lg bg-white" aria-busy="true" />;
  }

  const pending = bills ? moneyToCents(bills.outstanding) > 0 : false;

  return (
    <div className="grid gap-3 rounded-lg border border-amber-soft bg-amber-soft p-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-ink">Update credit for {customerName}</p>
          <p className="text-xs text-ink2">
            Amount received is applied to the oldest open bill first and kept on that sale.
          </p>
        </div>
        {bills ? (
          <p className="text-sm font-semibold text-danger">
            Balance −{formatRupee(bills.outstanding)}
          </p>
        ) : null}
      </div>
      {bills && pending ? (
        <label className="grid max-w-xs gap-1 text-xs text-ink2">
          Amount received
          <input
            aria-label={`Amount received for ${customerName}`}
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className="h-11 rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none focus:border-action"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              void save();
            }}
            className="mt-1 h-11 rounded-lg bg-amber text-sm font-medium text-white disabled:opacity-60"
          >
            {busy ? 'Saving…' : 'Record payment'}
          </button>
        </label>
      ) : null}
      {bills && !pending ? (
        <p className="text-sm text-teal">This customer has no pending balance.</p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="text-sm text-teal">
          {notice}
        </p>
      ) : null}
      {bills && bills.bills.length > 0 ? (
        <ul className="grid gap-2">
          {bills.bills.map((bill) => (
            <li
              key={bill.id}
              className="grid gap-1 rounded-lg border border-line bg-white px-3 py-2 text-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-ink">
                  {bill.label} · {formatShortDate(bill.issuedAt)}
                </span>
                <span className="text-ink2">Total {formatRupee(bill.total)}</span>
              </div>
              <div className="flex flex-wrap justify-between gap-2">
                <span className="text-action">Amount paid {formatRupee(bill.amountPaid)}</span>
                <span className="font-medium text-danger">
                  Balance −{formatRupee(bill.outstanding)}
                </span>
              </div>
              {bill.payments.length > 0 ? (
                <ul className="grid gap-0.5 text-xs text-ink2">
                  {bill.payments.map((payment, index) => (
                    <li key={`${payment.recordedAt}-${index}`}>
                      {formatShortDate(payment.recordedAt)} · {formatRupee(payment.amount)}
                      {payment.notes ? ` · ${payment.notes}` : ''}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-ink3">No payment has been recorded on this bill yet.</p>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
