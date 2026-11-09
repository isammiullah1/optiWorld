'use client';

import { useSession } from 'next-auth/react';

export function useAdminToken(): { token: string | null; ready: boolean } {
  const session = useSession();
  const token = session.data?.accessToken;
  const allowed = session.data?.user.role === 'SUPER_ADMIN' && session.data.user.orgType === null;
  return {
    token: allowed && token ? token : null,
    ready: session.status !== 'loading',
  };
}
