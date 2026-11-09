import { redirect } from 'next/navigation';

export default function LegacyAdminDashboardPage(): never {
  redirect('/dashboard');
}
