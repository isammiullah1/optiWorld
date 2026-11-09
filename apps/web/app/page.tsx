import { dashboardPathForSession } from '@optiworld/shared';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';

import { authOptions } from '@/auth';

export default async function HomePage(): Promise<never> {
  const session = await getServerSession(authOptions);
  if (!session?.user.userId) {
    redirect('/login');
  }
  redirect(dashboardPathForSession(session.user));
}
