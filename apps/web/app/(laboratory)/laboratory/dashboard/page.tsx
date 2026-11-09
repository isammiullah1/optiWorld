import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';

import { authOptions } from '@/auth';
import { LabDashboard } from '@/components/laboratory/LabDashboard';

export default async function LaboratoryDashboardPage(): Promise<React.ReactElement> {
  const session = await getServerSession(authOptions);
  if (!session?.user.userId || session.user.orgType !== 'LABORATORY') {
    redirect('/login');
  }

  return <LabDashboard />;
}
