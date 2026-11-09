'use client';

import { ChevronDown } from 'lucide-react';
import { useState } from 'react';

const PANEL_TONE = {
  blue: {
    section: 'border-action',
    header: 'bg-action-soft',
    badge: 'bg-action text-white',
  },
  teal: {
    section: 'border-teal',
    header: 'bg-teal-soft',
    badge: 'bg-teal text-white',
  },
  amber: {
    section: 'border-amber',
    header: 'bg-amber-soft',
    badge: 'bg-amber-soft text-amber border border-amber',
  },
} as const;

export function SettingsPanel({
  title,
  description,
  icon: Icon,
  tone,
  defaultOpen = false,
  children,
}: {
  title: string;
  description: string;
  icon: React.ComponentType<{
    size?: number;
    className?: string;
    'aria-hidden'?: boolean | 'true';
  }>;
  tone: keyof typeof PANEL_TONE;
  defaultOpen?: boolean;
  children: React.ReactNode;
}): React.ReactElement {
  const [open, setOpen] = useState(defaultOpen);
  const look = PANEL_TONE[tone];
  return (
    <section className={`overflow-hidden rounded-xl border bg-white ${look.section}`}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={`flex min-h-11 w-full items-center justify-between gap-3 px-4 py-3 text-left ${look.header}`}
      >
        <span className="flex min-w-0 items-center gap-3">
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${look.badge}`}
          >
            <Icon size={18} aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block text-md font-semibold text-ink">{title}</span>
            <span className="block text-sm text-ink2">{description}</span>
          </span>
        </span>
        <ChevronDown
          size={18}
          aria-hidden="true"
          className={`shrink-0 text-ink3 transition ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open ? <div className="border-t border-line p-4">{children}</div> : null}
    </section>
  );
}
