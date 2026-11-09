'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { AdminOrgDetail } from '@optiworld/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { AdminRequestError, updateOrganisation } from './admin-api';
import { formatDay, formatWhen, orgTypeLabel, planLabel, statusLabel } from './format';
import { fieldClass, primaryButton } from './ui';

const NotesSchema = z.object({
  adminNotes: z.string().trim().max(2000, 'Notes must be 2000 characters or fewer.'),
});

type NotesValues = z.infer<typeof NotesSchema>;

export function OrgOverview({
  token,
  org,
  onSaved,
}: {
  token: string;
  org: AdminOrgDetail;
  onSaved: (org: AdminOrgDetail) => void;
}): React.ReactElement {
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<NotesValues>({
    resolver: zodResolver(NotesSchema),
    defaultValues: { adminNotes: org.adminNotes ?? '' },
  });

  async function onSubmit(values: NotesValues): Promise<void> {
    setFormError(null);
    try {
      onSaved(await updateOrganisation(token, org.id, { adminNotes: values.adminNotes }));
    } catch (caught) {
      setFormError(
        caught instanceof AdminRequestError ? caught.message : 'Something went wrong. Try again.',
      );
    }
  }

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <section className="rounded-xl border border-line bg-white p-4">
        <h3 className="text-md font-semibold text-ink">Business details</h3>
        <dl className="mt-3 grid gap-2 text-sm">
          <Detail label="Name" value={org.name} />
          <Detail label="Type" value={orgTypeLabel(org.type)} />
          <Detail label="City" value={org.city ?? '—'} />
          <Detail label="Phone" value={org.phone ?? '—'} />
          <Detail label="Address" value={org.address ?? '—'} />
          <Detail label="Created" value={formatDay(org.createdAt)} />
        </dl>
      </section>
      <section className="rounded-xl border border-line bg-white p-4">
        <h3 className="text-md font-semibold text-ink">Subscription</h3>
        <dl className="mt-3 grid gap-2 text-sm">
          <Detail label="Plan" value={planLabel(org.planType)} />
          <Detail label="Status" value={statusLabel(org.subscriptionStatus)} />
          <Detail label="Renewal" value={formatDay(org.renewalDate)} />
          <Detail label="Users" value={String(org.userCount)} />
          <Detail label="Last login" value={formatWhen(org.lastLoginAt)} />
        </dl>
      </section>
      <form
        className="rounded-xl border border-line bg-white p-4 lg:col-span-2"
        onSubmit={form.handleSubmit(onSubmit)}
      >
        <label className="flex flex-col gap-1 text-sm text-ink2" htmlFor="adminNotes">
          Admin notes
          <textarea
            id="adminNotes"
            rows={4}
            className={fieldClass}
            {...form.register('adminNotes')}
          />
        </label>
        {form.formState.errors.adminNotes ? (
          <p className="mt-1 text-xs text-danger" role="alert">
            {form.formState.errors.adminNotes.message}
          </p>
        ) : null}
        {formError ? (
          <p className="mt-2 text-sm text-danger" role="alert">
            {formError}
          </p>
        ) : null}
        <button
          type="submit"
          className={`${primaryButton} mt-3`}
          disabled={form.formState.isSubmitting}
        >
          {form.formState.isSubmitting ? 'Saving…' : 'Save notes'}
        </button>
      </form>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink3">{label}</dt>
      <dd className="text-right text-ink">{value}</dd>
    </div>
  );
}
