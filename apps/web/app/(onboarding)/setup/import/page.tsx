'use client';

import { dashboardPathForSession } from '@optiworld/shared';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { ImportCard } from '@/components/onboarding/import-card';

export default function SetupImportPage(): React.ReactElement {
  const router = useRouter();
  const { data: session, status } = useSession();
  const token = session?.accessToken;

  useEffect(() => {
    if (status === 'loading') {
      return;
    }
    if (!session?.user.orgType) {
      router.replace('/login');
      return;
    }
    if (session.user.orgType !== 'RETAILER') {
      router.replace(dashboardPathForSession(session.user));
    }
  }, [router, session, status]);

  return (
    <section className="grid gap-3">
      <div className="rounded-xl border border-line bg-white p-6">
        <h1 className="text-xl font-semibold text-ink">Bring in your shop data</h1>
        <p className="mt-2 text-sm text-ink2">
          Each import is separate. Download a template, check the first rows, then import.
        </p>
      </div>
      {token ? (
        <>
          <ImportCard
            kind="customers"
            title="Customers"
            columns="Name, Phone, Email, Address, Credit Limit, Outstanding Balance"
            accessToken={token}
          />
          <ImportCard
            kind="inventory"
            title="Inventory"
            columns="Product Code, Prefix, Product Name, Brand, Category, Sale Price, Stock Qty, Low Stock Threshold"
            accessToken={token}
          />
          <ImportCard
            kind="dues"
            title="Outstanding dues"
            columns="Customer Name, Customer Phone, Amount Due, Due Date, Notes"
            accessToken={token}
          />
        </>
      ) : null}
      <Link href="/retailer/dashboard" className="w-fit text-sm text-action">
        Skip for now
      </Link>
    </section>
  );
}
