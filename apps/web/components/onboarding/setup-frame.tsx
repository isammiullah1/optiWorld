'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { readSetup } from './setup-storage';

const STEPS = [
  { id: 'type', label: 'Type', href: '/setup/type' },
  { id: 'details', label: 'Details', href: '/setup/details' },
  { id: 'account', label: 'Account', href: '/setup/account' },
  { id: 'import', label: 'Import', href: '/setup/import' },
  { id: 'done', label: 'Done', href: '' },
] as const;

export function SetupFrame({ children }: { children: React.ReactNode }): React.ReactElement {
  const pathname = usePathname();
  const [showImport, setShowImport] = useState(true);

  useEffect(() => {
    const draft = readSetup();
    setShowImport(!draft || draft.orgType === 'RETAILER');
  }, [pathname]);

  const visible = STEPS.filter((step) => showImport || step.id !== 'import');
  const current = visible.findIndex(
    (step) => step.href.length > 0 && pathname.startsWith(step.href),
  );

  return (
    <main className="min-h-screen bg-canvas px-4 py-8">
      <div className="mx-auto w-full max-w-3xl">
        <p className="text-xs uppercase tracking-wide text-ink3">OptiWorld</p>
        <ol className="mt-3 flex flex-wrap gap-2" aria-label="Setup progress">
          {visible.map((step, index) => {
            const active = index === current;
            const complete = current > index;
            return (
              <li
                key={step.id}
                aria-current={active ? 'step' : undefined}
                className={`rounded-full px-3 py-1 text-xs ${
                  active
                    ? 'bg-navy text-white'
                    : complete
                      ? 'bg-teal-soft text-teal'
                      : 'bg-white text-ink3'
                }`}
              >
                {step.label}
              </li>
            );
          })}
        </ol>
        <div className="mt-4">{children}</div>
      </div>
    </main>
  );
}
