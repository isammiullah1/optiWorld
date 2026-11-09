'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const SUCCESS_MESSAGE =
  "Check your email — if an account exists, you'll receive a link within a few minutes.";

const ForgotPasswordFormSchema = z.object({
  email: z.string().trim().min(1, 'Email address is required').email('Enter a valid email address'),
});
type ForgotPasswordFormValues = z.infer<typeof ForgotPasswordFormSchema>;

export default function ForgotPasswordPage(): React.ReactElement {
  const [sent, setSent] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const form = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(ForgotPasswordFormSchema),
    defaultValues: { email: '' },
  });

  async function onSubmit(values: ForgotPasswordFormValues): Promise<void> {
    setRequestError(null);
    const response = await fetch(`${API_BASE}/api/v1/auth/forgot-password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(values),
    });
    if (!response.ok) {
      setRequestError('The reset email could not be sent. Try again.');
      return;
    }
    setSent(true);
  }

  const emailError = form.formState.errors.email?.message;

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4 py-8">
      <section className="w-full max-w-md rounded-xl border border-line bg-white p-6">
        <Link href="/login" className="text-sm text-action">
          Back to login
        </Link>
        <h1 className="mt-4 text-xl font-semibold text-ink">Reset your password</h1>
        <p className="mt-2 text-sm text-ink2">
          Enter your email address and we&apos;ll send you a reset link.
        </p>
        {sent ? (
          <p className="mt-6 text-sm text-ink" role="status">
            {SUCCESS_MESSAGE}
          </p>
        ) : (
          <form
            className="mt-6 flex flex-col gap-4"
            onSubmit={form.handleSubmit(onSubmit)}
            noValidate
          >
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-ink" htmlFor="email">
                Email address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                aria-invalid={emailError ? true : undefined}
                aria-describedby={emailError ? 'email-error' : undefined}
                className="min-h-[44px] rounded-lg border border-line px-3 text-base text-ink outline-none focus:border-navy"
                {...form.register('email')}
              />
              {emailError ? (
                <p id="email-error" className="text-sm text-danger" role="alert">
                  {emailError}
                </p>
              ) : null}
            </div>
            {requestError ? (
              <p className="text-sm text-danger" role="alert">
                {requestError}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={form.formState.isSubmitting}
              aria-busy={form.formState.isSubmitting}
              className="min-h-[44px] w-full rounded-lg bg-navy px-4 text-md font-medium text-white disabled:opacity-60"
            >
              {form.formState.isSubmitting ? 'Sending…' : 'Send reset link'}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
