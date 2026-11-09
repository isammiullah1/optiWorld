import { redirect } from 'next/navigation';

export default function LegacyAdminLoginPage(): never {
  redirect('/login');
}
