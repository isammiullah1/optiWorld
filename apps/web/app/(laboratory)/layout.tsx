import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';

import { authOptions } from '@/auth';
import { LaboratoryShell } from '@/components/laboratory/LaboratoryShell';

export default async function LaboratoryLayout({
  children,
}: {
  children: React.ReactNode;
}): Promise<React.ReactElement> {
  const session = await getServerSession(authOptions);
  if (!session?.user.userId || session.user.orgType !== 'LABORATORY') {
    redirect('/login');
  }

  return (
    <LaboratoryShell userName={session.user.name ?? 'Signed in'} role={session.user.role}>
      {children}
    </LaboratoryShell>
  );
}
