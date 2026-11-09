import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';

import { authOptions } from '@/auth';
import { LedgerOverview } from '@/components/retailer/LedgerOverview';

export default async function LedgerPage(): Promise<React.ReactElement> {
  const session = await getServerSession(authOptions);
  if (session?.user.role === 'STAFF') {
    redirect('/retailer/dashboard');
  }
  return <LedgerOverview />;
}
