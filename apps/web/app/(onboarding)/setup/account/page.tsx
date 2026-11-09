'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { CompleteOnboardingSchema, dashboardPathForSession } from '@optiworld/shared';
import { getSession, signIn, useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { clearSetup, readSetup } from '@/components/onboarding/setup-storage';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const AccountSchema = z
  .object({
    fullName: z.string().trim().min(1, 'Full name is required'),
    email: z
      .string()
      .trim()
      .min(1, 'Email address is required')
      .email('Enter a valid email address'),
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

type AccountValues = z.infer<typeof AccountSchema>;

export default function SetupAccountPage(): React.ReactElement {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const creating = useRef(false);
  const form = useForm<AccountValues>({
    resolver: zodResolver(AccountSchema),
    defaultValues: { fullName: '', email: '', password: '', confirmPassword: '' },
  });
  const password = form.watch('password');

  useEffect(() => {
    if (creating.current) {
      return;
    }
    if (status === 'authenticated' && session?.user.orgType) {
      router.replace(dashboardPathForSession(session.user));
      return;
    }
    if (!readSetup()?.businessName) {
      router.replace('/setup/details');
    }
  }, [router, session, status]);

  async function onSubmit(values: AccountValues): Promise<void> {
    const draft = readSetup();
    if (!draft?.businessName) {
      router.replace('/setup/details');
      return;
    }
    setFormError(null);
    creating.current = true;
    const body = CompleteOnboardingSchema.parse({
      ...draft,
      fullName: values.fullName,
      email: values.email,
      password: values.password,
    });
    const response = await fetch(`${API_BASE}/api/v1/onboarding/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const payload: unknown = await response.json().catch(() => null);
      setFormError(readError(payload));
      return;
    }
    const signedIn = await signIn('credentials', {
      email: values.email,
      password: values.password,
      redirect: false,
    });
    if (!signedIn || signedIn.error) {
      router.push('/login');
      return;
    }
    const nextSession = await getSession();
    clearSetup();
    if (draft.orgType === 'RETAILER') {
      router.push('/setup/import');
      router.refresh();
      return;
    }
    if (!nextSession?.user.userId || !nextSession.user.role) {
      router.push('/login');
      return;
    }
    router.push(dashboardPathForSession(nextSession.user));
    router.refresh();
  }

  return (
    <section className="rounded-xl border border-line bg-white p-6">
      <h1 className="text-xl font-semibold text-ink">Owner account</h1>
      <form className="mt-5 grid gap-4" onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <Labeled
          id="fullName"
          label="Full name"
          error={form.formState.errors.fullName?.message}
          required
        >
          <input
            id="fullName"
            className={inputClass}
            autoComplete="name"
            {...form.register('fullName')}
          />
        </Labeled>
        <Labeled id="email" label="Email" error={form.formState.errors.email?.message} required>
          <input
            id="email"
            type="email"
            className={inputClass}
            autoComplete="email"
            {...form.register('email')}
          />
        </Labeled>
        <Labeled
          id="password"
          label="Password"
          error={form.formState.errors.password?.message}
          required
        >
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              className={`${inputClass} pr-16`}
              autoComplete="new-password"
              {...form.register('password')}
            />
            <button
              type="button"
              className="absolute right-1 top-0 flex min-h-[44px] items-center px-2 text-sm text-action"
              aria-pressed={showPassword}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              onClick={() => setShowPassword((current) => !current)}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
        </Labeled>
        <StrengthMeter password={password} />
        <Labeled
          id="confirmPassword"
          label="Confirm password"
          error={form.formState.errors.confirmPassword?.message}
          required
        >
          <input
            id="confirmPassword"
            type={showPassword ? 'text' : 'password'}
            className={inputClass}
            autoComplete="new-password"
            {...form.register('confirmPassword')}
          />
        </Labeled>
        {formError ? (
          <p className="text-sm text-danger" role="alert">
            {formError}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={form.formState.isSubmitting}
          aria-busy={form.formState.isSubmitting}
          className="min-h-[44px] rounded-lg bg-navy text-md font-medium text-white disabled:opacity-60"
        >
          {form.formState.isSubmitting ? 'Creating account…' : 'Create account'}
        </button>
      </form>
    </section>
  );
}

const inputClass =
  'min-h-[44px] w-full rounded-lg border border-line px-3 text-base text-ink outline-none focus:border-navy';

function Labeled({
  id,
  label,
  error,
  required,
  children,
}: {
  id: string;
  label: string;
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
      {children}
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function StrengthMeter({ password }: { password: string }): React.ReactElement | null {
  if (password.length === 0) {
    return null;
  }
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((pattern) =>
    pattern.test(password),
  ).length;
  const strength =
    password.length >= 12 && classes >= 3
      ? 'strong'
      : password.length >= 8 && classes >= 2
        ? 'fair'
        : 'weak';
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

function readError(payload: unknown): string {
  if (
    typeof payload === 'object' &&
    payload !== null &&
    'error' in payload &&
    typeof payload.error === 'object' &&
    payload.error !== null &&
    'message' in payload.error &&
    typeof payload.error.message === 'string'
  ) {
    return payload.error.message;
  }
  return 'The account could not be created.';
}
