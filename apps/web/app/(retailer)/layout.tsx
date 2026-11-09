import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';

import { authOptions } from '@/auth';
import { RetailerShell } from '@/components/retailer/RetailerShell';

export default async function RetailerLayout({
  children,
}: {
  children: React.ReactNode;
}): Promise<React.ReactElement> {
  const session = await getServerSession(authOptions);
  if (!session?.user.userId || session.user.orgType !== 'RETAILER') {
    redirect('/login');
  }

  return (
    <RetailerShell userName={session.user.name ?? 'Signed in'} role={session.user.role}>
      {children}
    </RetailerShell>
  );
}
