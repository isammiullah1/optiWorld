'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ResetPasswordSchema, type ResetPasswordRequest } from '@optiworld/shared';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useForm } from 'react-hook-form';

import { AuthShell } from '@/components/auth-shell';

function ResetForm(): React.ReactElement {
  const params = useSearchParams();
  const [message, setMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<ResetPasswordRequest>({
    resolver: zodResolver(ResetPasswordSchema),
    defaultValues: { token: params.get('token') ?? '', password: '' },
  });

  async function onSubmit(values: ResetPasswordRequest): Promise<void> {
    setFormError(null);
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'}/api/v1/auth/reset-password`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(values),
      },
    );
    if (!response.ok) {
      setFormError('This reset link is invalid or expired.');
      return;
    }
    setMessage('Password updated. You can sign in with the new password.');
  }

  return (
    <AuthShell title="Reset password" subtitle="Choose a new super admin password">
      <form className="flex flex-col gap-3" onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <input type="hidden" {...form.register('token')} />
        <label className="flex flex-col gap-1 text-sm text-ink2" htmlFor="password">
          New password
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            className="rounded-lg border border-line px-3 py-2 text-base text-ink outline-none focus:border-action"
            {...form.register('password')}
          />
        </label>
        {formError ? (
          <p className="text-sm text-danger" role="alert">
            {formError}
          </p>
        ) : null}
        {message ? (
          <p className="text-sm text-teal" role="status">
            {message}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={form.formState.isSubmitting}
          className="rounded-lg bg-action px-4 py-2 text-md font-medium text-white disabled:opacity-60"
        >
          Update password
        </button>
        <Link href="/login" className="text-sm text-action">
          Back to sign in
        </Link>
      </form>
    </AuthShell>
  );
}

export default function ResetPasswordPage(): React.ReactElement {
  return (
    <Suspense fallback={null}>
      <ResetForm />
    </Suspense>
  );
}
