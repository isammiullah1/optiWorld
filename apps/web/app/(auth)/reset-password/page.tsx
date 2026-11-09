'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { dashboardPathForSession } from '@optiworld/shared';
import { getSession, signIn } from 'next-auth/react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { useForm, type UseFormRegisterReturn } from 'react-hook-form';
import { z } from 'zod';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const SIGNING_IN_MESSAGE = 'Password updated. Signing you in…';

const SetPasswordSchema = z
  .object({
    password: z.string().superRefine((value, context) => {
      if (value.length === 0) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: 'Password is required' });
        return;
      }
      if (value.length < 8) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Password must be at least 8 characters',
        });
      }
    }),
    confirmPassword: z.string(),
  })
  .superRefine((value, context) => {
    if (value.confirmPassword.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Confirm your password',
        path: ['confirmPassword'],
      });
      return;
    }
    if (value.password !== value.confirmPassword) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Passwords do not match',
        path: ['confirmPassword'],
      });
    }
  });

type SetPasswordValues = z.infer<typeof SetPasswordSchema>;
type ScreenStatus = 'checking' | 'invalid' | 'ready' | 'signing-in';
type PasswordStrength = 'weak' | 'fair' | 'strong';

const ResetResultSchema = z.object({
  success: z.literal(true),
  data: z.object({
    reset: z.literal(true),
    email: z.string().email(),
  }),
});

function ResetPasswordScreen(): React.ReactElement {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const [status, setStatus] = useState<ScreenStatus>(token ? 'checking' : 'invalid');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const form = useForm<SetPasswordValues>({
    resolver: zodResolver(SetPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });
  const passwordValue = form.watch('password');

  useEffect(() => {
    if (!token) {
      setStatus('invalid');
      return;
    }
    let cancelled = false;
    setStatus('checking');
    void fetch(`${API_BASE}/api/v1/auth/reset-password/validate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then((response) => {
        if (!cancelled) {
          setStatus(response.ok ? 'ready' : 'invalid');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatus('invalid');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function onSubmit(values: SetPasswordValues): Promise<void> {
    const response = await fetch(`${API_BASE}/api/v1/auth/reset-password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, password: values.password }),
    });
    const payload: unknown = await response.json().catch(() => null);
    const parsed = ResetResultSchema.safeParse(payload);
    if (!response.ok || !parsed.success) {
      setStatus('invalid');
      return;
    }

    setStatus('signing-in');
    const result = await signIn('credentials', {
      email: parsed.data.data.email,
      password: values.password,
      redirect: false,
    });
    if (result?.error === 'SUPER_ADMIN') {
      const adminUrl = process.env.NEXT_PUBLIC_ADMIN_URL ?? 'http://localhost:3001';
      window.location.assign(`${adminUrl}/login`);
      return;
    }
    if (!result || result.error) {
      router.push('/login');
      return;
    }
    const session = await getSession();
    if (!session?.user.userId || !session.user.role) {
      router.push('/login');
      return;
    }
    router.push(dashboardPathForSession(session.user));
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4 py-8">
      <section className="w-full max-w-md rounded-xl border border-line bg-white p-6">
        <Link href="/login" className="text-sm text-action">
          Back to login
        </Link>
        <h1 className="mt-4 text-xl font-semibold text-ink">Set a new password</h1>
        {status === 'checking' ? (
          <p className="mt-4 text-sm text-ink2" role="status">
            Checking your reset link…
          </p>
        ) : null}
        {status === 'invalid' ? <ExpiredLink /> : null}
        {status === 'signing-in' ? (
          <p className="mt-6 text-sm text-ink" role="status">
            {SIGNING_IN_MESSAGE}
          </p>
        ) : null}
        {status === 'ready' ? (
          <form
            className="mt-6 flex flex-col gap-4"
            onSubmit={form.handleSubmit(onSubmit)}
            noValidate
          >
            <PasswordField
              id="password"
              label="New password"
              autoComplete="new-password"
              shown={showPassword}
              error={form.formState.errors.password?.message}
              registration={form.register('password')}
              onToggle={() => setShowPassword((current) => !current)}
            />
            <StrengthMeter password={passwordValue} />
            <PasswordField
              id="confirm-password"
              label="Confirm password"
              autoComplete="new-password"
              shown={showConfirm}
              error={form.formState.errors.confirmPassword?.message}
              registration={form.register('confirmPassword')}
              onToggle={() => setShowConfirm((current) => !current)}
            />
            <button
              type="submit"
              disabled={form.formState.isSubmitting}
              aria-busy={form.formState.isSubmitting}
              className="min-h-[44px] w-full rounded-lg bg-navy px-4 text-md font-medium text-white disabled:opacity-60"
            >
              {form.formState.isSubmitting ? 'Updating…' : 'Update password'}
            </button>
          </form>
        ) : null}
      </section>
    </main>
  );
}

function ExpiredLink(): React.ReactElement {
  return (
    <p className="mt-6 text-sm text-danger" role="alert">
      This link has expired.{' '}
      <Link href="/forgot-password" className="text-action">
        Request a new one.
      </Link>
    </p>
  );
}

function StrengthMeter({ password }: { password: string }): React.ReactElement | null {
  const strength = passwordStrength(password);
  if (!strength) {
    return null;
  }
  const filled = strength === 'weak' ? 1 : strength === 'fair' ? 2 : 3;
  const tone = strength === 'weak' ? 'bg-danger' : strength === 'fair' ? 'bg-amber' : 'bg-teal';
  return (
    <div className="flex items-center gap-3" aria-live="polite">
      <div className="flex flex-1 gap-1" aria-hidden="true">
        {[0, 1, 2].map((segment) => (
          <span
            key={segment}
            className={`h-1 flex-1 rounded-full ${segment < filled ? tone : 'bg-line'}`}
          />
        ))}
      </div>
      <span className="text-xs text-ink2">Password strength: {strength}</span>
    </div>
  );
}

function PasswordField({
  id,
  label,
  autoComplete,
  shown,
  error,
  registration,
  onToggle,
}: {
  id: string;
  label: string;
  autoComplete: string;
  shown: boolean;
  error: string | undefined;
  registration: UseFormRegisterReturn;
  onToggle: () => void;
}): React.ReactElement {
  const errorId = `${id}-error`;
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-ink" htmlFor={id}>
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={shown ? 'text' : 'password'}
          autoComplete={autoComplete}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className="min-h-[44px] w-full rounded-lg border border-line px-3 pr-16 text-base text-ink outline-none focus:border-navy"
          {...registration}
        />
        <button
          type="button"
          className="absolute right-1 top-0 flex min-h-[44px] items-center rounded-md px-2 text-sm text-action"
          aria-pressed={shown}
          aria-label={shown ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          onClick={onToggle}
        >
          {shown ? 'Hide' : 'Show'}
        </button>
      </div>
      {error ? (
        <p id={errorId} className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function passwordStrength(password: string): PasswordStrength | null {
  if (password.length === 0) {
    return null;
  }
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((pattern) =>
    pattern.test(password),
  ).length;
  if (password.length >= 12 && classes >= 3) {
    return 'strong';
  }
  if (password.length >= 8 && classes >= 2) {
    return 'fair';
  }
  return 'weak';
}

export default function ResetPasswordPage(): React.ReactElement {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-canvas px-4 py-8">
          <p className="text-sm text-ink2">Checking your reset link…</p>
        </main>
      }
    >
      <ResetPasswordScreen />
    </Suspense>
  );
}
