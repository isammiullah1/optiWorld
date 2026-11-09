'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ForgotPasswordSchema, type ForgotPasswordRequest } from '@optiworld/shared';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { AuthShell } from '@/components/auth-shell';

export default function ForgotPasswordPage(): React.ReactElement {
  const [message, setMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<ForgotPasswordRequest>({
    resolver: zodResolver(ForgotPasswordSchema),
    defaultValues: { email: '' },
  });

  async function onSubmit(values: ForgotPasswordRequest): Promise<void> {
    setFormError(null);
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'}/api/v1/auth/forgot-password`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(values),
      },
    );
    if (!response.ok) {
      setFormError('The reset email could not be requested. Try again.');
      return;
    }
    setMessage('If an account exists for that email, a reset link has been sent.');
  }

  return (
    <AuthShell title="Forgot password" subtitle="Super admin reset link expires in 1 hour">
      <form className="flex flex-col gap-3" onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <label className="flex flex-col gap-1 text-sm text-ink2" htmlFor="email">
          Email
          <input
            id="email"
            type="email"
            autoComplete="email"
            className="rounded-lg border border-line px-3 py-2 text-base text-ink outline-none focus:border-action"
            {...form.register('email')}
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
          Send reset link
        </button>
        <Link href="/login" className="text-sm text-action">
          Back to sign in
        </Link>
      </form>
    </AuthShell>
  );
}
