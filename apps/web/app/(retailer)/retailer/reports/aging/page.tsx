import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';

import { authOptions } from '@/auth';
import { AgingReportView } from '@/components/retailer/AgingReportView';

export default async function AgingReportPage(): Promise<React.ReactElement> {
  const session = await getServerSession(authOptions);
  if (session?.user.role === 'STAFF') {
    redirect('/retailer/dashboard');
  }
  return <AgingReportView />;
}
