'use client';

import { useEffect, useState } from 'react';

import { initials } from './retailer-nav';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export function resolveBillLogoUrl(path: string | null): string | null {
  if (!path) {
    return null;
  }
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) {
    return path;
  }
  return `${API_BASE}${path}`;
}

export function ShopMark({
  name,
  logoUrl,
  size = 'md',
}: {
  name: string;
  logoUrl: string | null;
  size?: 'sm' | 'md' | 'lg';
}): React.ReactElement {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [logoUrl]);
  const box =
    size === 'lg' ? 'h-14 w-14 text-md' : size === 'sm' ? 'h-9 w-9 text-xs' : 'h-12 w-12 text-sm';
  if (logoUrl && !failed) {
    return (
      <span
        className={`grid ${box} shrink-0 overflow-hidden rounded-full border border-navy bg-white`}
      >
        <img
          src={logoUrl}
          alt={name}
          className="h-full w-full object-contain p-1"
          onError={() => setFailed(true)}
        />
      </span>
    );
  }
  return (
    <span
      className={`grid ${box} shrink-0 place-items-center rounded-full bg-navy font-semibold tracking-wide text-white`}
    >
      {initials(name)}
    </span>
  );
}
