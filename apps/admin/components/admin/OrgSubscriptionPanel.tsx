'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { SUBSCRIPTION_STATUSES, type AdminOrgDetail } from '@optiworld/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { AdminRequestError, updateSubscription } from './admin-api';
import { formatDay, planLabel, statusLabel } from './format';
import { fieldClass, primaryButton, StatusBadge } from './ui';

const ExtendSchema = z.object({
  renewalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a renewal date.'),
});
const StatusSchema = z.object({ status: z.enum(SUBSCRIPTION_STATUSES) });

export function OrgSubscriptionPanel({
  token,
  org,
  onSaved,
}: {
  token: string;
  org: AdminOrgDetail;
  onSaved: (org: AdminOrgDetail) => void;
}): React.ReactElement {
  const [formError, setFormError] = useState<string | null>(null);
  const extend = useForm<z.infer<typeof ExtendSchema>>({
    resolver: zodResolver(ExtendSchema),
    defaultValues: { renewalDate: org.renewalDate?.slice(0, 10) ?? '' },
  });
  const status = useForm<z.infer<typeof StatusSchema>>({
    resolver: zodResolver(StatusSchema),
    defaultValues: { status: org.subscriptionStatus },
  });

  async function saveExtend(values: z.infer<typeof ExtendSchema>): Promise<void> {
    setFormError(null);
    try {
      onSaved(
        await updateSubscription(token, org.id, {
          action: 'EXTEND',
          renewalDate: values.renewalDate,
        }),
      );
    } catch (caught) {
      setFormError(
        caught instanceof AdminRequestError ? caught.message : 'Something went wrong. Try again.',
      );
    }
  }

  async function saveStatus(values: z.infer<typeof StatusSchema>): Promise<void> {
    setFormError(null);
    try {
      onSaved(await updateSubscription(token, org.id, { action: 'STATUS', status: values.status }));
    } catch (caught) {
      setFormError(
        caught instanceof AdminRequestError ? caught.message : 'Something went wrong. Try again.',
      );
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <section className="rounded-xl border border-line bg-white p-4">
        <p className="text-sm text-ink2">
          {planLabel(org.planType)} · <StatusBadge status={org.subscriptionStatus} /> · renews{' '}
          {formatDay(org.renewalDate)}
        </p>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <form onSubmit={extend.handleSubmit(saveExtend)}>
            <label className="flex flex-col gap-1 text-sm text-ink2" htmlFor="renewalDate">
              Extend subscription
              <input
                id="renewalDate"
                type="date"
                className={fieldClass}
                {...extend.register('renewalDate')}
              />
            </label>
            {extend.formState.errors.renewalDate ? (
              <p className="mt-1 text-xs text-danger" role="alert">
                {extend.formState.errors.renewalDate.message}
              </p>
            ) : null}
            <button
              type="submit"
              className={`${primaryButton} mt-3`}
              disabled={extend.formState.isSubmitting}
            >
              Extend subscription
            </button>
          </form>
          <form onSubmit={status.handleSubmit(saveStatus)}>
            <label className="flex flex-col gap-1 text-sm text-ink2" htmlFor="subscriptionStatus">
              Change status
              <select id="subscriptionStatus" className={fieldClass} {...status.register('status')}>
                {SUBSCRIPTION_STATUSES.map((item) => (
                  <option key={item} value={item}>
                    {statusLabel(item)}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className={`${primaryButton} mt-3`}
              disabled={status.formState.isSubmitting}
            >
              Change status
            </button>
          </form>
        </div>
        {formError ? (
          <p className="mt-3 text-sm text-danger" role="alert">
            {formError}
          </p>
        ) : null}
      </section>
      <div className="overflow-x-auto rounded-xl border border-line bg-white">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr>
              {['Plan', 'Status', 'Start', 'End', 'Renewal', 'Recorded'].map((heading) => (
                <th
                  key={heading}
                  className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-ink3"
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {org.subscriptionHistory.map((row) => (
              <tr key={row.id}>
                <td className="border-t border-line px-3 py-2 text-sm text-ink">
                  {planLabel(row.planType)}
                </td>
                <td className="border-t border-line px-3 py-2">
                  <StatusBadge status={row.status} />
                </td>
                <td className="border-t border-line px-3 py-2 text-sm text-ink2">
                  {formatDay(row.startDate)}
                </td>
                <td className="border-t border-line px-3 py-2 text-sm text-ink2">
                  {formatDay(row.endDate)}
                </td>
                <td className="border-t border-line px-3 py-2 text-sm text-ink2">
                  {formatDay(row.renewalDate)}
                </td>
                <td className="border-t border-line px-3 py-2 text-sm text-ink2">
                  {formatDay(row.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
