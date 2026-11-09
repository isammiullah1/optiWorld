'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  UpdateWholesalerListingProfileSchema,
  type UpdateWholesalerListingProfileRequest,
} from '@optiworld/shared';
import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';

import { CustomerPhoneField } from '@/components/retailer/CustomerPhoneField';
import { WhatsAppLabel } from '@/components/WhatsAppMark';

import {
  WHOLESALER_ORDERS_CHANGED,
  loadListingProfile,
  saveListingProfile,
} from './wholesaler-api';

const inputClass =
  'min-h-11 rounded-lg border border-line px-3 text-sm text-ink outline-none focus:border-action';

export function ListingProfile(): React.ReactElement {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [share, setShare] = useState<{ id: string; username: string | null } | null>(null);
  const form = useForm<UpdateWholesalerListingProfileRequest>({
    resolver: zodResolver(UpdateWholesalerListingProfileSchema),
    defaultValues: {
      businessName: '',
      city: '',
      phone: '',
      whatsappNumber: '',
      listingProfileNotes: '',
    },
  });
  const preview = form.watch();

  useEffect(() => {
    const token = session?.accessToken;
    if (!token) {
      return;
    }
    void loadListingProfile(token)
      .then((profile) => {
        setShare({ id: profile.id, username: profile.username });
        form.reset({
          businessName: profile.businessName,
          city: profile.city ?? '',
          phone: profile.phone ?? '',
          whatsappNumber: profile.whatsappNumber ?? '',
          listingProfileNotes: profile.listingProfileNotes ?? '',
        });
        setError(null);
      })
      .catch((caught: unknown) => {
        setError(
          caught instanceof Error ? caught.message : 'The listing profile could not be loaded',
        );
      })
      .finally(() => setLoading(false));
  }, [form, session?.accessToken]);

  async function onSubmit(values: UpdateWholesalerListingProfileRequest): Promise<void> {
    const token = session?.accessToken;
    if (!token) {
      return;
    }
    setSaved(false);
    try {
      const profile = await saveListingProfile(token, values);
      form.reset({
        businessName: profile.businessName,
        city: profile.city ?? '',
        phone: profile.phone ?? '',
        whatsappNumber: profile.whatsappNumber ?? '',
        listingProfileNotes: profile.listingProfileNotes ?? '',
      });
      setSaved(true);
      setError(null);
      window.dispatchEvent(new Event(WHOLESALER_ORDERS_CHANGED));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The listing profile could not be saved');
    }
  }

  if (loading) {
    return (
      <div className="h-64 animate-pulse rounded-xl border border-line bg-white" aria-busy="true" />
    );
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      {share ? (
        <section className="rounded-xl border border-line bg-white p-4 lg:col-span-2">
          <h2 className="text-md font-semibold text-ink">Share with a retailer</h2>
          <p className="mt-1 text-sm text-ink2">
            A retailer can request a connection only with this exact username or ID.
          </p>
          <dl className="mt-3 grid gap-2 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-ink3">Username</dt>
              <dd className="text-sm font-medium text-ink">{share.username ?? 'Not set'}</dd>
            </div>
            <div>
              <dt className="text-sm text-ink3">ID</dt>
              <dd className="break-all text-sm font-medium text-ink">{share.id}</dd>
            </div>
          </dl>
        </section>
      ) : null}
      <form
        className="grid gap-3 rounded-xl border border-line bg-white p-4"
        onSubmit={form.handleSubmit(onSubmit)}
      >
        <div>
          <h2 className="text-md font-semibold text-ink">Listing profile</h2>
          <p className="mt-1 text-sm text-ink2">
            What retailers see when they visit this wholesaler&apos;s page.
          </p>
        </div>
        <Field label="Business name" error={form.formState.errors.businessName?.message}>
          <input className={inputClass} {...form.register('businessName')} />
        </Field>
        <Field label="City / location" error={form.formState.errors.city?.message}>
          <input className={inputClass} {...form.register('city')} />
        </Field>
        <Field label="Phone number" error={form.formState.errors.phone?.message}>
          <input className={inputClass} {...form.register('phone')} />
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
        <Field label="About us" error={form.formState.errors.listingProfileNotes?.message}>
          <textarea
            className={`${inputClass} min-h-24 py-2`}
            {...form.register('listingProfileNotes')}
          />
        </Field>
        <p className="text-sm text-ink3">
          About us is shown with your profile and on your catalog.
        </p>
        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        {saved ? (
          <p className="text-sm text-teal" role="status">
            Listing profile saved.
          </p>
        ) : null}
        <button
          type="submit"
          disabled={form.formState.isSubmitting}
          className="min-h-11 rounded-lg bg-action px-4 text-sm font-medium text-white disabled:opacity-60"
        >
          {form.formState.isSubmitting ? 'Saving…' : 'Save profile'}
        </button>
      </form>
      <section className="rounded-xl border border-line bg-white p-4">
        <h2 className="text-md font-semibold text-ink">
          See how your profile looks to connected retailers
        </h2>
        <article className="mt-3 rounded-xl border border-line p-4">
          <h3 className="text-xl font-semibold text-ink">
            {preview.businessName || 'Business name'}
          </h3>
          <p className="mt-1 text-sm text-ink2">{preview.city || 'City not set'}</p>
          {preview.phone ? (
            <a className="mt-1 block text-sm text-action" href={`tel:${preview.phone}`}>
              {preview.phone}
            </a>
          ) : (
            <p className="mt-1 text-sm text-ink3">No phone</p>
          )}
          <p className="mt-2 text-sm text-ink2">
            {preview.whatsappNumber?.trim() ? (
              <WhatsAppLabel>{preview.whatsappNumber}</WhatsAppLabel>
            ) : (
              'WhatsApp not listed'
            )}
          </p>
          <p className="mt-3 text-sm text-ink3">About us</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-ink">
            {preview.listingProfileNotes?.trim() || '—'}
          </p>
        </article>
      </section>
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
      {error ? (
        <span className="text-sm text-danger" role="alert">
          {error}
        </span>
      ) : null}
    </label>
  );
}
