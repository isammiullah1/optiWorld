'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  AcceptInviteSchema,
  InvitePreviewSchema,
  dashboardPathForSession,
} from '@optiworld/shared';
import { getSession, signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const FormSchema = AcceptInviteSchema.pick({ fullName: true, password: true });
type FormValues = z.infer<typeof FormSchema>;

function InviteForm(): React.ReactElement {
  const token = useSearchParams().get('token') ?? '';
  const router = useRouter();
  const [preview, setPreview] = useState<{ organisationName: string; email: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: { fullName: '', password: '' },
  });

  useEffect(() => {
    if (token.length < 20) {
      setError('This invite link is invalid or has expired.');
      return;
    }
    void fetch(`${API_BASE}/api/v1/onboarding/invite?token=${encodeURIComponent(token)}`)
      .then(async (response) => {
        const payload: unknown = await response.json();
        const parsed = z
          .object({ success: z.literal(true), data: InvitePreviewSchema })
          .safeParse(payload);
        if (!response.ok || !parsed.success) {
          setError('This invite link is invalid or has expired.');
          return;
        }
        setPreview({
          organisationName: parsed.data.data.organisationName,
          email: parsed.data.data.email,
        });
      })
      .catch(() => setError('This invite link is invalid or has expired.'));
  }, [token]);

  async function onSubmit(values: FormValues): Promise<void> {
    setError(null);
    const response = await fetch(`${API_BASE}/api/v1/onboarding/accept-invite`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, fullName: values.fullName, password: values.password }),
    });
    if (!response.ok) {
      setError('This invite link is invalid or has expired.');
      return;
    }
    const signedIn = await signIn('credentials', {
      email: preview?.email ?? '',
      password: values.password,
      redirect: false,
    });
    if (!signedIn || signedIn.error) {
      router.push('/login');
      return;
    }
    const session = await getSession();
    router.push(session ? dashboardPathForSession(session.user) : '/login');
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-3 py-8">
      <section className="w-full max-w-md rounded-xl border border-line bg-white p-4">
        <p className="text-xs uppercase tracking-wide text-ink3">OptiWorld</p>
        <h1 className="mt-1 text-xl font-semibold text-ink">Accept invite</h1>
        {preview ? (
          <p className="mt-2 text-sm text-ink2">
            Join {preview.organisationName} as {preview.email}
          </p>
        ) : null}
        {error ? (
          <p className="mt-3 text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        {preview ? (
          <form
            className="mt-4 flex flex-col gap-3"
            onSubmit={form.handleSubmit(onSubmit)}
            noValidate
          >
            <label className="flex flex-col gap-1 text-sm text-ink2" htmlFor="fullName">
              Your name
              <input
                id="fullName"
                className="rounded-lg border border-line px-3 py-2 text-base text-ink outline-none focus:border-action"
                {...form.register('fullName')}
              />
            </label>
            {form.formState.errors.fullName ? (
              <p className="text-xs text-danger" role="alert">
                {form.formState.errors.fullName.message}
              </p>
            ) : null}
            <label className="flex flex-col gap-1 text-sm text-ink2" htmlFor="password">
              Password
              <input
                id="password"
                type="password"
                className="rounded-lg border border-line px-3 py-2 text-base text-ink outline-none focus:border-action"
                {...form.register('password')}
              />
            </label>
            {form.formState.errors.password ? (
              <p className="text-xs text-danger" role="alert">
                {form.formState.errors.password.message}
              </p>
            ) : null}
            <button
              type="submit"
              className="rounded-lg bg-navy px-4 py-2 text-md font-medium text-white disabled:opacity-60"
              disabled={form.formState.isSubmitting}
            >
              {form.formState.isSubmitting ? 'Creating account…' : 'Create account'}
            </button>
          </form>
        ) : null}
      </section>
    </main>
  );
}

export default function InvitePage(): React.ReactElement {
  return (
    <Suspense fallback={<main className="min-h-screen bg-canvas" />}>
      <InviteForm />
    </Suspense>
  );
}
