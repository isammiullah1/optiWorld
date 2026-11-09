import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';

import { authOptions } from '@/auth';

export default async function HomePage(): Promise<never> {
  const session = await getServerSession(authOptions);
  if (session?.user.role === 'SUPER_ADMIN') {
    redirect('/dashboard');
  }
  redirect('/login');
}
