'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { LoginSchema, type LoginRequest } from '@optiworld/shared';
import { signIn } from 'next-auth/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { AuthShell } from '@/components/auth-shell';

export function LoginForm(): React.ReactElement {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<LoginRequest>({
    resolver: zodResolver(LoginSchema),
    defaultValues: { email: '', password: '' },
  });

  async function onSubmit(values: LoginRequest): Promise<void> {
    setFormError(null);
    const result = await signIn('credentials', {
      email: values.email,
      password: values.password,
      redirect: false,
    });

    if (!result || result.error) {
      setFormError('This portal is only for OptiWorld super admin accounts.');
      return;
    }

    router.push('/dashboard');
    router.refresh();
  }

  return (
    <AuthShell title="Super admin" subtitle="Platform access only">
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
        <label className="flex flex-col gap-1 text-sm text-ink2" htmlFor="password">
          Password
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            className="rounded-lg border border-line px-3 py-2 text-base text-ink outline-none focus:border-action"
            {...form.register('password')}
          />
        </label>
        {formError ? (
          <p className="text-sm text-danger" role="alert">
            {formError}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={form.formState.isSubmitting}
          className="rounded-lg bg-purp px-4 py-2 text-md font-medium text-white disabled:opacity-60"
        >
          {form.formState.isSubmitting ? 'Signing in…' : 'Sign in'}
        </button>
        <Link href="/admin/forgot-password" className="text-sm text-action">
          Forgot password
        </Link>
      </form>
    </AuthShell>
  );
}
