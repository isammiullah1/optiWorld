'use client';

import { LogOut } from 'lucide-react';
import { signOut } from 'next-auth/react';

export function signOutAccount(): void {
  void fetch('/api/logout', { method: 'POST' }).finally(() => {
    void signOut({ callbackUrl: '/login' });
  });
}

type SignOutButtonProps = {
  variant: 'sidebar' | 'menu' | 'header';
};

export function SignOutButton({ variant }: SignOutButtonProps): React.ReactElement {
  if (variant === 'header') {
    return (
      <button
        type="button"
        className="min-h-11 shrink-0 rounded-lg px-3 text-sm text-ink2"
        onClick={signOutAccount}
      >
        Sign out
      </button>
    );
  }

  if (variant === 'menu') {
    return (
      <button
        type="button"
        className="flex min-h-[44px] w-full items-center gap-2 text-left text-md text-ink"
        onClick={signOutAccount}
      >
        <LogOut size={16} aria-hidden="true" />
        Sign out
      </button>
    );
  }

  return (
    <button
      type="button"
      aria-label="Sign out"
      title="Sign out"
      className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg text-sm text-white/80 hover:bg-white/[0.08] lg:justify-start lg:px-2"
      onClick={signOutAccount}
    >
      <LogOut size={16} aria-hidden="true" />
      <span className="hidden lg:inline">Sign out</span>
    </button>
  );
}
