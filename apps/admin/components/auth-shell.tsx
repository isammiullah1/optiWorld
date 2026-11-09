import type { ReactNode } from 'react';

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}): React.ReactElement {
  return (
    <main className="flex min-h-screen items-center justify-center px-3 py-8">
      <section className="w-full max-w-md overflow-hidden rounded-xl border border-line bg-white">
        <header className="bg-admin px-5 py-4 text-white">
          <p className="text-xs uppercase tracking-wide text-white/70">OptiWorld</p>
          <h1 className="mt-1 text-xl font-semibold">{title}</h1>
          <p className="mt-1 text-sm text-white/80">{subtitle}</p>
        </header>
        <div className="px-5 py-4">{children}</div>
      </section>
    </main>
  );
}
