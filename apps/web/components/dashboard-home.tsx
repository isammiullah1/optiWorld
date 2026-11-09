'use client';

import { signOutAccount } from '@/components/auth/SignOutButton';

type DashboardUser = {
  name?: string | null;
  role: string;
  orgType: string | null;
  orgStatus: string | null;
  planType: string | null;
};

export function DashboardHome({
  title,
  user,
  embedded = false,
}: {
  title: string;
  user: DashboardUser;
  embedded?: boolean;
}): React.ReactElement {
  const card = (
    <section className="rounded-xl border border-line bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-ink3">OptiWorld</p>
      {embedded ? (
        <p className="mt-1 text-xl font-semibold text-ink">{title}</p>
      ) : (
        <h1 className="mt-1 text-xl font-semibold text-ink">{title}</h1>
      )}
      <dl className="mt-4 grid gap-2 text-sm text-ink2">
        <div>
          <dt className="text-ink3">Signed in</dt>
          <dd className="text-md text-ink">{user.name ?? 'Signed in'}</dd>
        </div>
        <div>
          <dt className="text-ink3">Role</dt>
          <dd>{user.role}</dd>
        </div>
        <div>
          <dt className="text-ink3">Organisation type</dt>
          <dd>{user.orgType ?? 'None'}</dd>
        </div>
        <div>
          <dt className="text-ink3">Organisation status</dt>
          <dd>{user.orgStatus ?? 'None'}</dd>
        </div>
        <div>
          <dt className="text-ink3">Plan</dt>
          <dd>{user.planType ?? 'None'}</dd>
        </div>
      </dl>
      <button
        type="button"
        className="mt-4 rounded-lg border border-line px-4 py-2 text-ink2"
        onClick={signOutAccount}
      >
        Sign out
      </button>
    </section>
  );
  if (embedded) {
    return card;
  }
  return <main className="min-h-screen bg-canvas px-5 py-4">{card}</main>;
}
