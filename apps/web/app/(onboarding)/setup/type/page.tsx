'use client';

import { dashboardPathForSession, type OrgType } from '@optiworld/shared';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { readSetup, writeSetup } from '@/components/onboarding/setup-storage';

const OPTIONS: readonly {
  type: OrgType;
  title: string;
  description: string;
  icon: React.ReactElement;
}[] = [
  {
    type: 'RETAILER',
    title: 'Retailer / Optical Shop',
    description: 'Billing, inventory, customers, and connectivity with suppliers.',
    icon: <ShopIcon />,
  },
  {
    type: 'WHOLESALER',
    title: 'Wholesaler / Supplier',
    description: 'Catalog, orders, and chat with the retailers you approve.',
    icon: <SupplierIcon />,
  },
  {
    type: 'LABORATORY',
    title: 'Laboratory',
    description: 'Job tracking, prescriptions, and lens inventory.',
    icon: <LabIcon />,
  },
];

export default function SetupTypePage(): React.ReactElement {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [selected, setSelected] = useState<OrgType | null>(null);

  useEffect(() => {
    if (status === 'authenticated' && session?.user.orgType) {
      router.replace(dashboardPathForSession(session.user));
      return;
    }
    const draft = readSetup();
    if (draft) {
      setSelected(draft.orgType);
    }
  }, [router, session, status]);

  return (
    <section className="rounded-xl border border-line bg-white p-6">
      <h1 className="text-xl font-semibold text-ink">What kind of business is this?</h1>
      <p className="mt-2 text-sm text-ink2">
        Choose one. You can set the details on the next step.
      </p>
      <div className="mt-5 grid gap-3">
        {OPTIONS.map((option) => {
          const active = selected === option.type;
          return (
            <button
              key={option.type}
              type="button"
              aria-pressed={active}
              onClick={() => setSelected(option.type)}
              className={`flex gap-3 rounded-xl border p-4 text-left ${
                active ? 'border-action bg-action-soft' : 'border-line bg-white'
              }`}
            >
              <span className="mt-0.5 text-action" aria-hidden="true">
                {option.icon}
              </span>
              <span>
                <span className="text-md font-medium text-ink">{option.title}</span>
                <span className="mt-1 block text-sm text-ink2">{option.description}</span>
              </span>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        disabled={!selected}
        className="mt-5 min-h-[44px] w-full rounded-lg bg-navy text-md font-medium text-white disabled:opacity-60"
        onClick={() => {
          if (!selected) {
            return;
          }
          writeSetup({ orgType: selected });
          router.push('/setup/details');
        }}
      >
        Continue
      </button>
    </section>
  );
}

function ShopIcon(): React.ReactElement {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
    >
      <path d="M4 10h16v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9Z" />
      <path d="M3 10 6 4h12l3 6" />
      <path d="M9 21v-6h6v6" />
    </svg>
  );
}

function SupplierIcon(): React.ReactElement {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
    >
      <path d="M3 7h11v10H3z" />
      <path d="M14 10h4l3 3v4h-7" />
      <circle cx="7" cy="18" r="1.5" />
      <circle cx="17" cy="18" r="1.5" />
    </svg>
  );
}

function LabIcon(): React.ReactElement {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
    >
      <path d="M9 3h6" />
      <path d="M10 3v6L5 19a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 19l-5-10V3" />
      <path d="M8 14h8" />
    </svg>
  );
}
