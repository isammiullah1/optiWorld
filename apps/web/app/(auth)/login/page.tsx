'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { dashboardPathForSession, LoginFormSchema, type LoginFormValues } from '@optiworld/shared';
import { getSession, signIn } from 'next-auth/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';

const REMEMBERED_EMAIL_KEY = 'optiworld.rememberedEmail';
const INACTIVE_MESSAGE = 'Your account is currently inactive';
const INVALID_MESSAGE = 'Incorrect email or password';

export default function LoginPage(): React.ReactElement {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [rememberEmail, setRememberEmail] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const form = useForm<LoginFormValues>({
    resolver: zodResolver(LoginFormSchema),
    defaultValues: { email: '', password: '' },
  });

  useEffect(() => {
    const saved = window.localStorage.getItem(REMEMBERED_EMAIL_KEY);
    if (saved) {
      form.setValue('email', saved);
      setRememberEmail(true);
    }
  }, [form]);

  useEffect(() => {
    if (formError) {
      errorRef.current?.focus();
    }
  }, [formError]);

  async function onSubmit(values: LoginFormValues): Promise<void> {
    setFormError(null);
    const result = await signIn('credentials', {
      email: values.email,
      password: values.password,
      redirect: false,
    });

    if (result?.error === 'SUPER_ADMIN') {
      const adminUrl = process.env.NEXT_PUBLIC_ADMIN_URL ?? 'http://localhost:3001';
      window.location.assign(`${adminUrl}/login`);
      return;
    }
    if (result?.error === 'INACTIVE_ORG') {
      setFormError(INACTIVE_MESSAGE);
      return;
    }
    if (!result || result.error) {
      setFormError(INVALID_MESSAGE);
      return;
    }

    if (rememberEmail) {
      window.localStorage.setItem(REMEMBERED_EMAIL_KEY, values.email);
    } else {
      window.localStorage.removeItem(REMEMBERED_EMAIL_KEY);
    }

    const session = await getSession();
    if (!session?.user.userId || !session.user.role) {
      setFormError(INVALID_MESSAGE);
      return;
    }

    router.push(dashboardPathForSession(session.user));
    router.refresh();
  }

  const emailError = form.formState.errors.email?.message;
  const passwordError = form.formState.errors.password?.message;

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4 py-8">
      <section className="w-full max-w-md rounded-xl border border-line bg-white p-6">
        <header>
          <div className="flex items-center gap-3">
            <LogoMark />
            <h1 className="text-xl font-semibold text-ink">OptiWorld</h1>
          </div>
          <p className="mt-3 text-sm text-ink2">The optical industry, connected</p>
        </header>
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
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-ink" htmlFor="password">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                aria-invalid={passwordError ? true : undefined}
                aria-describedby={passwordError ? 'password-error' : undefined}
                className="min-h-[44px] w-full rounded-lg border border-line px-3 pr-16 text-base text-ink outline-none focus:border-navy"
                {...form.register('password')}
              />
              <button
                type="button"
                className="absolute right-1 top-0 flex min-h-[44px] items-center rounded-md px-2 text-sm text-action"
                aria-pressed={showPassword}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowPassword((current) => !current)}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            {passwordError ? (
              <p id="password-error" className="text-sm text-danger" role="alert">
                {passwordError}
              </p>
            ) : null}
          </div>
          <Link href="/forgot-password" className="w-fit text-sm text-action">
            Forgot password?
          </Link>
          <label
            className="flex min-h-[44px] items-center gap-2 text-sm text-ink2"
            htmlFor="remember-email"
          >
            <input
              id="remember-email"
              type="checkbox"
              className="h-4 w-4"
              checked={rememberEmail}
              onChange={(event) => setRememberEmail(event.target.checked)}
            />
            Remember email
          </label>
          {formError ? (
            <p
              ref={errorRef}
              id="login-error"
              tabIndex={-1}
              role="alert"
              className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger outline-none"
            >
              {formError}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={form.formState.isSubmitting}
            aria-busy={form.formState.isSubmitting}
            aria-describedby={formError ? 'login-error' : undefined}
            className="min-h-[44px] w-full rounded-lg bg-navy px-4 text-md font-medium text-white disabled:opacity-60"
          >
            {form.formState.isSubmitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="mt-5 text-center text-xs text-ink3">
          New to OptiWorld? Contact your administrator
        </p>
      </section>
    </main>
  );
}

function LogoMark(): React.ReactElement {
  return (
    <span
      className="flex h-10 w-10 items-center justify-center rounded-lg bg-navy"
      aria-hidden="true"
    >
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <circle cx="11" cy="11" r="7" stroke="white" strokeWidth="2" />
        <circle cx="11" cy="11" r="2.5" fill="white" />
      </svg>
    </span>
  );
}
