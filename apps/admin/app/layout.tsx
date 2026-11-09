import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import type { ReactNode } from 'react';

import { Providers } from '@/components/providers';
import { AppFrame } from '@/components/admin/AdminShell';

import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'OptiWorld Admin',
  description: 'OptiWorld super admin sign in',
};

export default function RootLayout({ children }: { children: ReactNode }): React.ReactElement {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>
          <AppFrame>{children}</AppFrame>
        </Providers>
      </body>
    </html>
  );
}
