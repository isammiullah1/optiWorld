'use client';

import {
  CreateCustomerSchema,
  type CreateCustomerRequest,
  type CustomerSearchHit,
} from '@optiworld/shared';
import { useState } from 'react';

import { formatRupee } from './dashboard-format';
import { CustomerPhoneField } from './CustomerPhoneField';

export { PrescriptionModal } from './PrescriptionModal';

export function CustomerPicker({
  open,
  query,
  customers,
  creating,
  createError,
  prompt,
  onQuery,
  onClose,
  onSelect,
  onCreate,
}: {
  open: boolean;
  query: string;
  customers: readonly CustomerSearchHit[];
  creating: boolean;
  createError: string | null;
  prompt: string | null;
  onQuery: (value: string) => void;
  onClose: () => void;
  onSelect: (customer: CustomerSearchHit) => void;
  onCreate: (input: CreateCustomerRequest) => Promise<void>;
}): React.ReactElement | null {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [email, setEmail] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
    phone?: string;
    whatsapp?: string;
    email?: string;
  }>({});
  if (!open) {
    return null;
  }
  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 sm:items-center"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="customer-search-title"
        className="grid max-h-[80vh] w-full max-w-md gap-3 overflow-y-auto rounded-t-xl border border-line bg-white p-4 sm:rounded-xl"
      >
        <div className="flex items-center justify-between">
          <h2 id="customer-search-title" className="text-md font-semibold text-ink">
            Customer
          </h2>
          <button type="button" onClick={onClose} className="min-h-[44px] px-2 text-sm text-action">
            Close
          </button>
        </div>
        {prompt ? (
          <p className="rounded-lg bg-amber-soft px-3 py-2 text-sm text-amber" role="status">
            {prompt}
          </p>
        ) : null}
        <input
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder="Name or phone"
          aria-label="Search customers"
          className="rounded-lg border border-line px-3 py-2 text-base text-ink outline-none focus:border-action"
        />
        <ul className="grid gap-2">
          {customers.map((customer) => (
            <li key={customer.id}>
              <button
                type="button"
                onClick={() => onSelect(customer)}
                className="flex min-h-[44px] w-full flex-col items-start rounded-lg border border-line px-3 py-2 text-left"
              >
                <span className="text-sm font-medium text-ink">{customer.name}</span>
                <span className="text-xs text-ink3">
                  Limit {formatRupee(customer.creditLimit)} · Outstanding{' '}
                  {formatRupee(customer.outstanding)}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {adding ? (
          <form
            className="grid gap-2 border-t border-line pt-3"
            onSubmit={(event) => {
              event.preventDefault();
              const parsed = CreateCustomerSchema.safeParse({
                name,
                phone,
                whatsappNumber,
                email: email.trim(),
                creditLimit: '0.00',
              });
              if (!parsed.success) {
                const next: { name?: string; phone?: string; whatsapp?: string; email?: string } =
                  {};
                for (const issue of parsed.error.issues) {
                  const key = issue.path[0];
                  if (key === 'name' && !next.name) {
                    next.name = issue.message;
                  }
                  if (key === 'phone' && !next.phone) {
                    next.phone = issue.message;
                  }
                  if (key === 'whatsappNumber' && !next.whatsapp) {
                    next.whatsapp = issue.message;
                  }
                  if (key === 'email' && !next.email) {
                    next.email = issue.message;
                  }
                }
                setFieldErrors(next);
                return;
              }
              setFieldErrors({});
              void onCreate(parsed.data)
                .then(() => {
                  setName('');
                  setPhone('');
                  setWhatsappNumber('');
                  setEmail('');
                  setAdding(false);
                })
                .catch(() => undefined);
            }}
          >
            <p className="text-sm font-medium text-ink">New customer</p>
            <Field
              label="Name"
              error={fieldErrors.name}
              value={name}
              placeholder="Name"
              onChange={(value) => {
                setName(value);
                setFieldErrors((current) => ({ ...current, name: undefined }));
              }}
            />
            <CustomerPhoneField
              label="WhatsApp"
              inputLabel="WhatsApp number"
              icon="message"
              required
              autoFocus
              value={whatsappNumber}
              error={fieldErrors.whatsapp}
              onChange={(value) => {
                setWhatsappNumber(value);
                setFieldErrors((current) => ({ ...current, whatsapp: undefined }));
              }}
            />
            <CustomerPhoneField
              label="Phone"
              inputLabel="Phone number"
              value={phone}
              error={fieldErrors.phone}
              onChange={(value) => {
                setPhone(value);
                setFieldErrors((current) => ({ ...current, phone: undefined }));
              }}
            />
            <Field
              label="Email"
              error={fieldErrors.email}
              value={email}
              placeholder="Email (optional)"
              onChange={(value) => {
                setEmail(value);
                setFieldErrors((current) => ({ ...current, email: undefined }));
              }}
            />
            {createError ? (
              <p className="text-sm text-danger" role="alert">
                {createError}
              </p>
            ) : null}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setAdding(false);
                  setFieldErrors({});
                }}
                className="min-h-[44px] flex-1 rounded-lg border border-line text-sm text-ink2"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creating}
                className="min-h-[44px] flex-1 rounded-lg bg-action text-sm font-medium text-white disabled:opacity-50"
              >
                {creating ? 'Saving…' : 'Save customer'}
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => {
              setName(nameFromSearch(query));
              setPhone('');
              setWhatsappNumber('');
              setEmail('');
              setFieldErrors({});
              setAdding(true);
            }}
            className="min-h-[44px] rounded-lg border border-dashed border-action text-sm font-medium text-action"
          >
            Add customer
          </button>
        )}
      </div>
    </div>
  );
}

function nameFromSearch(query: string): string {
  const typed = query.trim();
  if (!/[A-Za-z]/.test(typed)) {
    return '';
  }
  return typed;
}

function Field({
  label,
  error,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  error?: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}): React.ReactElement {
  return (
    <label className="grid gap-1 text-sm text-ink2">
      {label}
      <input
        aria-label={`Customer ${label.toLowerCase()}`}
        aria-invalid={error ? true : undefined}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-lg border border-line px-3 py-2 text-base text-ink outline-none focus:border-action"
      />
      {error ? (
        <span className="text-xs text-danger" role="alert">
          {error}
        </span>
      ) : null}
    </label>
  );
}
