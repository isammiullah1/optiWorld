'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  CreateAdminOrgSchema,
  ORG_TYPES,
  PLAN_TYPES,
  type CreateAdminOrgRequest,
  type OrgType,
} from '@optiworld/shared';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';

import { AdminRequestError, createOrganisation } from './admin-api';
import { orgTypeLabel, planForType, planLabel, utcDay } from './format';
import { fieldClass, primaryButton } from './ui';
import { useAdminToken } from './use-admin-token';

export function NewOrganisation(): React.ReactElement {
  const { token } = useAdminToken();
  const [result, setResult] = useState<{ id: string; message: string } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<CreateAdminOrgRequest>({
    resolver: zodResolver(CreateAdminOrgSchema),
    defaultValues: {
      name: '',
      type: 'RETAILER',
      city: '',
      phone: '',
      planType: 'RETAILER_STANDARD',
      subscriptionEndDate: utcDay(30),
      inviteEmail: '',
    },
  });
  const orgType = form.watch('type');

  useEffect(() => {
    form.setValue('planType', planForType(orgType));
  }, [form, orgType]);

  async function onSubmit(values: CreateAdminOrgRequest): Promise<void> {
    if (!token) {
      return;
    }
    setFormError(null);
    try {
      const created = await createOrganisation(token, values);
      setResult({ id: created.id, message: created.message });
    } catch (caught) {
      setFormError(
        caught instanceof AdminRequestError ? caught.message : 'Something went wrong. Try again.',
      );
    }
  }

  if (result) {
    return (
      <section className="max-w-xl rounded-xl border border-line bg-white p-4">
        <h2 className="text-lg font-semibold text-ink">Organisation added</h2>
        <p className="mt-2 text-sm text-ink2">{result.message}</p>
        <Link
          href={`/organisations/${result.id}`}
          className={`${primaryButton} mt-4 inline-flex items-center`}
        >
          Open organisation
        </Link>
      </section>
    );
  }

  return (
    <form
      className="max-w-xl rounded-xl border border-line bg-white p-4"
      onSubmit={form.handleSubmit(onSubmit)}
      noValidate
    >
      <Field label="Name" error={form.formState.errors.name?.message}>
        <input id="name" className={fieldClass} {...form.register('name')} />
      </Field>
      <Field label="Type" error={form.formState.errors.type?.message}>
        <select id="type" className={fieldClass} {...form.register('type')}>
          {ORG_TYPES.map((type) => (
            <option key={type} value={type}>
              {orgTypeLabel(type as OrgType)}
            </option>
          ))}
        </select>
      </Field>
      <Field label="City" error={form.formState.errors.city?.message}>
        <input id="city" className={fieldClass} {...form.register('city')} />
      </Field>
      <Field label="Phone" error={form.formState.errors.phone?.message}>
        <input id="phone" className={fieldClass} {...form.register('phone')} />
      </Field>
      <Field label="Plan" error={form.formState.errors.planType?.message}>
        <select id="planType" className={fieldClass} {...form.register('planType')}>
          {PLAN_TYPES.map((plan) => (
            <option key={plan} value={plan}>
              {planLabel(plan)}
            </option>
          ))}
        </select>
      </Field>
      <Field
        label="Subscription end date"
        error={form.formState.errors.subscriptionEndDate?.message}
      >
        <input
          id="subscriptionEndDate"
          type="date"
          className={fieldClass}
          {...form.register('subscriptionEndDate')}
        />
      </Field>
      <Field label="Invite email" error={form.formState.errors.inviteEmail?.message}>
        <input
          id="inviteEmail"
          type="email"
          className={fieldClass}
          {...form.register('inviteEmail')}
        />
      </Field>
      {formError ? (
        <p className="mb-3 text-sm text-danger" role="alert">
          {formError}
        </p>
      ) : null}
      <button type="submit" className={primaryButton} disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? 'Creating…' : 'Create organisation'}
      </button>
    </form>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactElement;
}): React.ReactElement {
  const child = children as React.ReactElement<{ id?: string }>;
  return (
    <label className="mb-3 flex flex-col gap-1 text-sm text-ink2" htmlFor={child.props.id}>
      {label}
      {children}
      {error ? (
        <span className="text-xs text-danger" role="alert">
          {error}
        </span>
      ) : null}
    </label>
  );
}
