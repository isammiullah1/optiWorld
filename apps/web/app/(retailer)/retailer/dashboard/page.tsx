import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';

import { authOptions } from '@/auth';
import { RetailerDashboard } from '@/components/retailer/RetailerDashboard';

export default async function RetailerDashboardPage(): Promise<React.ReactElement> {
  const session = await getServerSession(authOptions);
  if (!session?.user.userId || session.user.orgType !== 'RETAILER') {
    redirect('/login');
  }

  return <RetailerDashboard userName={session.user.name ?? 'there'} />;
}
