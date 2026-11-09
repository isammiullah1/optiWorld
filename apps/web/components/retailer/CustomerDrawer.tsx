'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  CreateCustomerSchema,
  type CreateCustomerRequest,
  type CustomerGender,
} from '@optiworld/shared';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { CustomerPhoneField } from './CustomerPhoneField';

export type CustomerFormValues = {
  name: string;
  phone: string;
  whatsappNumber: string;
  email: string;
  gender: '' | CustomerGender;
  dateOfBirth: string;
  address: string;
  creditLimit: string;
  notes: string;
};

export function CustomerDrawer({
  open,
  saving,
  error,
  title = 'Add customer',
  initial,
  onClose,
  onCreate,
}: {
  open: boolean;
  saving: boolean;
  error: string | null;
  title?: string;
  initial?: CustomerFormValues;
  onClose: () => void;
  onCreate: (input: CreateCustomerRequest) => Promise<void>;
}): React.ReactElement | null {
  const form = useForm<z.input<typeof CreateCustomerSchema>>({
    resolver: zodResolver(CreateCustomerSchema),
    defaultValues: {
      name: initial?.name ?? '',
      phone: initial?.phone ?? '',
      whatsappNumber: initial?.whatsappNumber ?? '',
      email: initial?.email ?? '',
      dateOfBirth: initial?.dateOfBirth ?? '',
      address: initial?.address ?? '',
      creditLimit: initial?.creditLimit ?? '0.00',
      currentCredit: '',
      notes: initial?.notes ?? '',
      ...(initial?.gender ? { gender: initial.gender } : {}),
    },
  });
  const [phoneKey, setPhoneKey] = useState(0);
  const [gender, setGender] = useState<'' | CustomerGender>(initial?.gender ?? '');
  if (!open) {
    return null;
  }
  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-end bg-ink/40 sm:items-stretch"
      role="presentation"
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-customer-title"
        className="grid max-h-[92vh] w-full gap-3 overflow-y-auto rounded-t-xl border border-line bg-white p-4 sm:h-full sm:max-h-none sm:max-w-md sm:rounded-none sm:border-y-0 sm:border-r-0"
        onSubmit={form.handleSubmit((values) => {
          const parsed: CreateCustomerRequest = CreateCustomerSchema.parse({
            ...values,
            ...(gender ? { gender } : {}),
          });
          void onCreate(parsed).then(() => {
            form.reset();
            setGender('');
            setPhoneKey((current) => current + 1);
          });
        })}
      >
        <div className="flex items-center justify-between">
          <h2 id="add-customer-title" className="text-lg font-semibold text-ink">
            {title}
          </h2>
          <button type="button" onClick={onClose} className="min-h-[44px] px-2 text-sm text-action">
            Close
          </button>
        </div>
        <Field label="Name" error={form.formState.errors.name?.message}>
          <input aria-label="Name" className={inputClass} {...form.register('name')} />
        </Field>
        <Controller
          key={`whatsapp-${phoneKey}`}
          name="whatsappNumber"
          control={form.control}
          render={({ field }) => (
            <CustomerPhoneField
              label="WhatsApp"
              inputLabel="WhatsApp number"
              icon="message"
              required
              value={field.value ?? ''}
              error={form.formState.errors.whatsappNumber?.message}
              onChange={field.onChange}
            />
          )}
        />
        <Controller
          key={`phone-${phoneKey}`}
          name="phone"
          control={form.control}
          render={({ field }) => (
            <CustomerPhoneField
              label="Phone"
              inputLabel="Phone number"
              value={field.value ?? ''}
              error={form.formState.errors.phone?.message}
              onChange={field.onChange}
            />
          )}
        />
        <Field label="Gender">
          <select
            aria-label="Gender"
            value={gender}
            onChange={(event) => setGender(event.target.value as '' | CustomerGender)}
            className={inputClass}
          >
            <option value="">Not set</option>
            <option value="MALE">Male</option>
            <option value="FEMALE">Female</option>
            <option value="OTHER">Other</option>
          </select>
        </Field>
        <Field label="Date of birth" error={form.formState.errors.dateOfBirth?.message}>
          <input
            aria-label="Date of birth"
            type="date"
            className={inputClass}
            {...form.register('dateOfBirth')}
          />
        </Field>
        <Field label="Email" error={form.formState.errors.email?.message}>
          <input aria-label="Email" className={inputClass} {...form.register('email')} />
        </Field>
        <Field label="Address" error={form.formState.errors.address?.message}>
          <textarea
            aria-label="Address"
            className={inputClass}
            rows={2}
            {...form.register('address')}
          />
        </Field>
        <Field label="Credit limit" error={form.formState.errors.creditLimit?.message}>
          <input
            aria-label="Credit limit"
            className={inputClass}
            {...form.register('creditLimit')}
          />
        </Field>
        {initial ? null : (
          <Field label="Current credit" error={form.formState.errors.currentCredit?.message}>
            <input
              aria-label="Current credit"
              inputMode="decimal"
              placeholder="0.00"
              className={inputClass}
              {...form.register('currentCredit')}
            />
            <span className="text-xs text-ink3">
              Amount this customer already owes. It is added to the ledger.
            </span>
          </Field>
        )}
        <Field label="Notes" error={form.formState.errors.notes?.message}>
          <textarea
            aria-label="Notes"
            className={inputClass}
            rows={3}
            {...form.register('notes')}
          />
        </Field>
        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={saving || form.formState.isSubmitting}
          className="min-h-[44px] rounded-lg bg-action text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save customer'}
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <label className="grid gap-1 text-sm text-ink2">
      {label}
      {children}
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </label>
  );
}

const inputClass =
  'rounded-lg border border-line px-3 py-2 text-base text-ink outline-none focus:border-action';
