import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';

import { authOptions } from '@/auth';
import { WholesalerShell } from '@/components/wholesaler/WholesalerShell';

export default async function WholesalerLayout({
  children,
}: {
  children: React.ReactNode;
}): Promise<React.ReactElement> {
  const session = await getServerSession(authOptions);
  if (!session?.user.userId || session.user.orgType !== 'WHOLESALER') {
    redirect('/login');
  }

  return (
    <WholesalerShell userName={session.user.name ?? 'Signed in'} role={session.user.role}>
      {children}
    </WholesalerShell>
  );
}
