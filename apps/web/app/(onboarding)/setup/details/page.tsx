'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { dashboardPathForSession, OnboardingDetailsSchema } from '@optiworld/shared';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import type { z } from 'zod';

import { CustomerPhoneField } from '@/components/retailer/CustomerPhoneField';

import { readSetup, writeSetup } from '@/components/onboarding/setup-storage';

type DetailsValues = z.infer<typeof OnboardingDetailsSchema>;

export default function SetupDetailsPage(): React.ReactElement {
  const router = useRouter();
  const { data: session, status } = useSession();
  const form = useForm<DetailsValues>({
    resolver: zodResolver(OnboardingDetailsSchema),
    defaultValues: {
      businessName: '',
      city: '',
      phone: '',
      whatsappNumber: '',
      address: '',
      listingProfileNotes: '',
    },
  });

  useEffect(() => {
    if (status === 'authenticated' && session?.user.orgType) {
      router.replace(dashboardPathForSession(session.user));
      return;
    }
    const draft = readSetup();
    if (!draft) {
      router.replace('/setup/type');
      return;
    }
    form.reset({
      businessName: draft.businessName,
      city: draft.city,
      phone: draft.phone,
      whatsappNumber: draft.whatsappNumber,
      address: draft.address,
      listingProfileNotes: draft.listingProfileNotes,
    });
  }, [form, router, session, status]);

  function onSubmit(values: DetailsValues): void {
    writeSetup(values);
    router.push('/setup/account');
  }

  return (
    <section className="rounded-xl border border-line bg-white p-6">
      <h1 className="text-xl font-semibold text-ink">Business details</h1>
      <form className="mt-5 grid gap-4" onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <Field
          label="Business name"
          id="businessName"
          error={form.formState.errors.businessName?.message}
          required
        >
          <input id="businessName" className={inputClass} {...form.register('businessName')} />
        </Field>
        <Field label="City" id="city" error={form.formState.errors.city?.message} required>
          <input id="city" className={inputClass} {...form.register('city')} />
        </Field>
        <Field label="Phone" id="phone" error={form.formState.errors.phone?.message} required>
          <input id="phone" className={inputClass} autoComplete="tel" {...form.register('phone')} />
        </Field>
        <Controller
          name="whatsappNumber"
          control={form.control}
          render={({ field }) => (
            <CustomerPhoneField
              label="WhatsApp number"
              inputLabel="WhatsApp number"
              icon="message"
              value={field.value ?? ''}
              error={form.formState.errors.whatsappNumber?.message}
              onChange={field.onChange}
            />
          )}
        />
        <Field label="Address" id="address" error={form.formState.errors.address?.message}>
          <textarea id="address" className={inputClass} rows={3} {...form.register('address')} />
        </Field>
        <Field
          label="About us"
          id="listingProfileNotes"
          hint="Shown with your profile"
          error={form.formState.errors.listingProfileNotes?.message}
        >
          <textarea
            id="listingProfileNotes"
            className={inputClass}
            rows={3}
            {...form.register('listingProfileNotes')}
          />
        </Field>
        <button
          type="submit"
          className="min-h-[44px] rounded-lg bg-navy text-md font-medium text-white"
        >
          Continue
        </button>
      </form>
    </section>
  );
}

const inputClass =
  'min-h-[44px] w-full rounded-lg border border-line px-3 text-base text-ink outline-none focus:border-navy';

function Field({
  id,
  label,
  hint,
  error,
  required,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-ink" htmlFor={id}>
        {label}
        {required ? <span className="text-danger"> *</span> : null}
      </label>
      {hint ? <span className="text-xs text-ink3">{hint}</span> : null}
      {children}
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
