'use client';

import { ArrowLeft } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { shopScope } from '@/lib/shop-scope';

function storageKey(): string {
  return shopScope() === 'wholesaler' ? 'ow-wholesaler-nav' : 'ow-retailer-nav';
}

function rootPrefix(): '/retailer' | '/wholesaler' {
  return shopScope() === 'wholesaler' ? '/wholesaler' : '/retailer';
}

function readStack(): string[] {
  const prefix = rootPrefix();
  try {
    const raw = sessionStorage.getItem(storageKey());
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(
      (entry): entry is string => typeof entry === 'string' && entry.startsWith(prefix),
    );
  } catch {
    return [];
  }
}

function writeStack(stack: readonly string[]): void {
  sessionStorage.setItem(storageKey(), JSON.stringify(stack.slice(-40)));
}

function fallbackPath(pathname: string): string | null {
  const root = pathname.startsWith('/wholesaler') ? '/wholesaler' : '/retailer';
  if (new RegExp(`^${root}/customers/[^/]+$`).test(pathname)) {
    return `${root}/customers`;
  }
  if (new RegExp(`^${root}/inventory/[^/]+$`).test(pathname)) {
    return `${root}/inventory`;
  }
  if (root === '/retailer' && /^\/retailer\/orders\/[^/]+$/.test(pathname)) {
    return '/retailer/orders';
  }
  if (root === '/wholesaler' && /^\/wholesaler\/orders\/[^/]+$/.test(pathname)) {
    return '/wholesaler/orders';
  }
  if (root === '/retailer' && /^\/retailer\/lab-jobs\/[^/]+$/.test(pathname)) {
    return '/retailer/lab-jobs';
  }
  if (root === '/retailer' && /^\/retailer\/wholesalers\/[^/]+\/catalog$/.test(pathname)) {
    return '/retailer/wholesalers';
  }
  const receipt = new RegExp(`^${root}/billing/([^/]+)/receipt$`).exec(pathname);
  if (receipt && receipt[1] !== 'local') {
    return `${root}/billing/${receipt[1]}`;
  }
  if (new RegExp(`^${root}/billing/local/[^/]+/receipt$`).test(pathname)) {
    return `${root}/billing/new`;
  }
  if (root === '/retailer' && /^\/retailer\/billing\/(?!new$)[^/]+$/.test(pathname)) {
    return '/retailer/reports/sales';
  }
  if (root === '/wholesaler' && /^\/wholesaler\/billing\/(?!new$)[^/]+$/.test(pathname)) {
    return '/wholesaler/sales';
  }
  return null;
}

function remember(location: string): string | null {
  const pathname = location.split('?')[0] ?? location;
  const stack = readStack();
  if (stack[stack.length - 1] !== location) {
    if (stack.length >= 2 && stack[stack.length - 2] === location) {
      stack.pop();
    } else {
      stack.push(location);
    }
    writeStack(stack);
  }
  const earlier = stack.length > 1 ? stack[stack.length - 2] : undefined;
  return earlier ?? fallbackPath(pathname);
}

export function BackNav(): React.ReactElement | null {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const router = useRouter();
  const [previous, setPrevious] = useState<string | null>(null);
  const location = search ? `${pathname}?${search}` : pathname;

  useEffect(() => {
    setPrevious(remember(location));
  }, [location]);

  if (!previous) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={() => {
        const stack = readStack();
        if (stack.length > 1 && stack[stack.length - 2] === previous) {
          stack.pop();
          writeStack(stack);
          router.push(previous);
          return;
        }
        writeStack([previous]);
        router.push(previous);
      }}
      className="mb-3 inline-flex h-11 items-center gap-2 rounded-lg border border-line bg-white px-3 text-sm font-medium text-ink print:hidden hover:border-action"
    >
      <ArrowLeft size={16} className="text-action" aria-hidden="true" />
      Back
    </button>
  );
}
