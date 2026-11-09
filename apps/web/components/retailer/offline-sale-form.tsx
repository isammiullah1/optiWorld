import type { FormEvent } from 'react';

import type { CustomerCache, InventoryCache, InvoiceStatus } from '@optiworld/shared';

type OfflineSaleFormProps = {
  customers: readonly CustomerCache[];
  batches: readonly InventoryCache[];
  disabled: boolean;
  onSubmit: (input: {
    customerId: string;
    inventoryBatchId: string;
    quantity: number;
    status: InvoiceStatus;
  }) => void;
};

export function OfflineSaleForm({
  customers,
  batches,
  disabled,
  onSubmit,
}: OfflineSaleFormProps): React.ReactElement {
  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const quantity = Number(form.get('quantity'));
    const status = form.get('status') === 'CREDIT' ? 'CREDIT' : 'PAID';
    onSubmit({
      customerId: String(form.get('customerId') ?? ''),
      inventoryBatchId: String(form.get('inventoryBatchId') ?? ''),
      quantity,
      status,
    });
    event.currentTarget.reset();
  }

  return (
    <form className="rounded-xl border border-line bg-white p-4" onSubmit={submit}>
      <h2 className="text-lg font-semibold text-ink">Record sale</h2>
      <p className="mt-1 text-sm text-ink2">This sale is saved on this device before it is sent.</p>
      {customers.length === 0 || batches.length === 0 ? (
        <p className="mt-3 text-sm text-ink2">
          Download the catalogue while online, then you can bill offline.
        </p>
      ) : null}
      <div className="mt-3 grid gap-3">
        <label className="grid gap-1 text-sm text-ink2">
          Customer
          <select
            name="customerId"
            required
            className="rounded-lg border border-line px-3 py-2 text-ink"
            defaultValue=""
          >
            <option value="" disabled>
              Choose a customer
            </option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm text-ink2">
          Product
          <select
            name="inventoryBatchId"
            required
            className="rounded-lg border border-line px-3 py-2 text-ink"
            defaultValue=""
          >
            <option value="" disabled>
              Choose a product
            </option>
            {batches.map((batch) => (
              <option key={batch.id} value={batch.id}>
                {batch.productName} · {batch.stockQty} in stock
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm text-ink2">
          Quantity
          <input
            name="quantity"
            type="number"
            min={1}
            defaultValue={1}
            required
            className="rounded-lg border border-line px-3 py-2 text-ink"
          />
        </label>
        <label className="grid gap-1 text-sm text-ink2">
          Payment
          <select
            name="status"
            className="rounded-lg border border-line px-3 py-2 text-ink"
            defaultValue="PAID"
          >
            <option value="PAID">Paid</option>
            <option value="CREDIT">Credit</option>
          </select>
        </label>
      </div>
      <button
        type="submit"
        disabled={disabled || customers.length === 0 || batches.length === 0}
        className="mt-4 rounded-lg bg-action px-4 py-2 text-white disabled:opacity-60"
      >
        Save sale
      </button>
    </form>
  );
}
