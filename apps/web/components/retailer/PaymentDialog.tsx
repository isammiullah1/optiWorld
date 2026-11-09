'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { RecordPaymentSchema, type RecordPaymentRequest } from '@optiworld/shared';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';

export function PaymentDialog({
  open,
  outstanding,
  saving,
  error,
  onClose,
  onSave,
}: {
  open: boolean;
  outstanding: string;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (input: RecordPaymentRequest) => Promise<void>;
}): React.ReactElement | null {
  const form = useForm<RecordPaymentRequest>({
    resolver: zodResolver(RecordPaymentSchema),
    defaultValues: {
      amount: outstanding,
      recordedAt: new Date().toISOString(),
      method: 'CASH',
      notes: '',
    },
  });
  useEffect(() => {
    if (open) {
      form.reset({
        amount: outstanding,
        recordedAt: new Date().toISOString(),
        method: 'CASH',
        notes: '',
      });
    }
  }, [open, outstanding, form]);
  if (!open) {
    return null;
  }
  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 sm:items-center"
      role="presentation"
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="record-payment-title"
        className="grid w-full max-w-md gap-3 rounded-t-xl border border-line bg-white p-4 sm:rounded-xl"
        onSubmit={form.handleSubmit((values) => {
          void onSave(values);
        })}
      >
        <h2 id="record-payment-title" className="text-lg font-semibold text-ink">
          Record payment
        </h2>
        <label className="grid gap-1 text-sm text-ink2">
          Amount
          <input aria-label="Amount" className={inputClass} {...form.register('amount')} />
        </label>
        <label className="grid gap-1 text-sm text-ink2">
          Date
          <input
            aria-label="Date"
            type="date"
            className={inputClass}
            defaultValue={new Date().toISOString().slice(0, 10)}
            onChange={(event) => {
              const date = event.target.value;
              form.setValue('recordedAt', date ? new Date(`${date}T12:00:00`).toISOString() : '');
            }}
          />
        </label>
        <label className="grid gap-1 text-sm text-ink2">
          Method
          <select aria-label="Method" className={inputClass} {...form.register('method')}>
            <option value="CASH">Cash</option>
            <option value="BANK_TRANSFER">Bank transfer</option>
            <option value="OTHER">Other</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm text-ink2">
          Notes
          <textarea
            aria-label="Payment notes"
            className={inputClass}
            rows={2}
            {...form.register('notes')}
          />
        </label>
        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] flex-1 rounded-lg border border-line text-sm text-ink2"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="min-h-[44px] flex-1 rounded-lg bg-action text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save payment'}
          </button>
        </div>
      </form>
    </div>
  );
}

const inputClass =
  'rounded-lg border border-line px-3 py-2 text-base text-ink outline-none focus:border-action';
