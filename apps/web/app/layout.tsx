import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import type { ReactNode } from 'react';

import { Providers } from '@/components/providers';

import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'OptiWorld',
  description: 'OptiWorld sign in',
  manifest: '/manifest.webmanifest',
};

export default function RootLayout({ children }: { children: ReactNode }): React.ReactElement {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
