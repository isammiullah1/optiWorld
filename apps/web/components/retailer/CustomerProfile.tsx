'use client';

import type { CustomerLedger, CustomerProfile as CustomerProfileData } from '@optiworld/shared';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { WhatsAppLabel } from '@/components/WhatsAppMark';
import { CustomerVision } from './CustomerVision';
import { loadCustomerLedger, loadCustomerProfile, recordCustomerPayment } from './customers-api';
import {
  formatDateTime,
  formatRupee,
  formatShortDate,
  invoiceStatusLabel,
} from './dashboard-format';
import { PaymentDialog } from './PaymentDialog';

const TABS = ['Overview', 'Invoices', 'Ledger', 'Activity'] as const;
type Tab = (typeof TABS)[number];

export function CustomerProfile({ customerId }: { customerId: string }): React.ReactElement {
  const { data: session } = useSession();
  const token = session?.accessToken;
  const isOwner = session?.user.role === 'OWNER';
  const [profile, setProfile] = useState<CustomerProfileData | null>(null);
  const [ledger, setLedger] = useState<CustomerLedger | null>(null);
  const [tab, setTab] = useState<Tab>('Overview');
  const [error, setError] = useState<string | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      return;
    }
    let active = true;
    void loadCustomerProfile(token, customerId)
      .then((next) => {
        if (active) {
          setProfile(next);
          setError(null);
        }
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(reason instanceof Error ? reason.message : 'Customer was not found');
        }
      });
    if (isOwner) {
      void loadCustomerLedger(token, customerId)
        .then((next) => {
          if (active) {
            setLedger(next);
          }
        })
        .catch(() => {
          if (active) {
            setLedger(null);
          }
        });
    }
    return () => {
      active = false;
    };
  }, [token, customerId, isOwner]);

  const visibleTabs = isOwner ? TABS : TABS.filter((item) => item !== 'Ledger');

  if (error) {
    return (
      <section className="rounded-xl border border-line bg-white p-4" role="alert">
        <h1 className="text-lg font-semibold text-ink">Customer unavailable</h1>
        <p className="mt-1 text-sm text-ink2">{error}</p>
      </section>
    );
  }
  if (!profile) {
    return <div className="h-40 animate-pulse rounded-xl border border-line bg-white" />;
  }

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">{profile.name}</h1>
          <p className="text-sm text-ink2">{profile.phone ?? 'No phone'}</p>
          <p className="flex flex-wrap items-center gap-x-2 text-sm text-ink2">
            {profile.whatsappNumber ? (
              <WhatsAppLabel>{profile.whatsappNumber}</WhatsAppLabel>
            ) : null}
            <span>
              {[
                profile.gender === 'MALE'
                  ? 'Male'
                  : profile.gender === 'FEMALE'
                    ? 'Female'
                    : profile.gender === 'OTHER'
                      ? 'Other'
                      : null,
                profile.dateOfBirth ? `Born ${profile.dateOfBirth}` : null,
                profile.referredBy ? `Referred by ${profile.referredBy}` : null,
              ]
                .filter((part) => part !== null)
                .join(' · ') || (profile.whatsappNumber ? '' : 'No extra details yet')}
            </span>
          </p>
        </div>
        <Link
          href={`/retailer/billing/new?customer=${profile.id}`}
          className="min-h-[44px] rounded-lg bg-action px-4 py-2 text-sm font-medium text-white"
        >
          New invoice
        </Link>
      </div>
      <div className="flex gap-2 overflow-x-auto" role="tablist">
        {visibleTabs.map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={tab === item}
            onClick={() => setTab(item)}
            className={`min-h-[44px] rounded-lg px-3 text-sm ${tab === item ? 'bg-action text-white' : 'border border-line bg-white text-ink2'}`}
          >
            {item}
          </button>
        ))}
      </div>
      {tab === 'Overview' ? <Overview profile={profile} /> : null}
      {tab === 'Invoices' ? <Invoices profile={profile} /> : null}
      {tab === 'Ledger' && isOwner ? (
        <Ledger
          ledger={ledger}
          onPay={() => {
            setPaymentError(null);
            setPaymentOpen(true);
          }}
        />
      ) : null}
      {tab === 'Activity' ? <Activity profile={profile} /> : null}
      <PaymentDialog
        open={paymentOpen}
        outstanding={profile.outstanding}
        saving={saving}
        error={paymentError}
        onClose={() => setPaymentOpen(false)}
        onSave={async (input) => {
          if (!token) {
            return;
          }
          setSaving(true);
          setPaymentError(null);
          try {
            await recordCustomerPayment(token, customerId, input);
            const [nextProfile, nextLedger] = await Promise.all([
              loadCustomerProfile(token, customerId),
              loadCustomerLedger(token, customerId),
            ]);
            setProfile(nextProfile);
            setLedger(nextLedger);
            setPaymentOpen(false);
          } catch (reason) {
            setPaymentError(
              reason instanceof Error ? reason.message : 'The payment could not be saved',
            );
          } finally {
            setSaving(false);
          }
        }}
      />
    </section>
  );
}

function Overview({ profile }: { profile: CustomerProfileData }): React.ReactElement {
  const stats = [
    ['Total spent', formatRupee(profile.totalSpent)],
    ['Outstanding', formatRupee(profile.outstanding)],
    ['Credit limit', formatRupee(profile.creditLimit)],
    ['Invoices', String(profile.invoiceCount)],
  ];
  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(([label, value]) => (
          <article key={label} className="rounded-xl border border-line bg-white p-4">
            <p className="text-sm uppercase tracking-wide text-ink3">{label}</p>
            <p className="mt-1 text-lg font-semibold text-ink">{value}</p>
          </article>
        ))}
      </div>
      <article className="rounded-xl border border-line bg-white p-4">
        <h2 className="text-md font-semibold text-ink">Prescriptions</h2>
        <div className="mt-3">
          <CustomerVision customerId={profile.id} />
        </div>
      </article>
      <article className="rounded-xl border border-line bg-white p-4">
        <h2 className="text-md font-semibold text-ink">Notes</h2>
        <p className="mt-2 text-sm text-ink2">{profile.notes ?? 'No notes yet.'}</p>
      </article>
    </div>
  );
}

function Invoices({ profile }: { profile: CustomerProfileData }): React.ReactElement {
  if (profile.invoices.length === 0) {
    return (
      <p className="rounded-xl border border-line bg-white p-4 text-sm text-ink2">
        No invoices yet.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-white">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-line">
            {['Invoice', 'Date', 'Status', 'Total'].map((heading) => (
              <th
                key={heading}
                className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-ink3"
              >
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {profile.invoices.map((invoice) => (
            <tr key={invoice.id} className="border-b border-line last:border-0 hover:bg-canvas">
              <td className="px-3 py-3 text-sm">
                <Link href={`/retailer/billing/${invoice.id}`} className="text-action">
                  #{invoice.invoiceNumber}
                </Link>
              </td>
              <td className="px-3 py-3 text-sm text-ink2">{formatShortDate(invoice.issuedAt)}</td>
              <td className="px-3 py-3 text-sm">
                <span
                  className={`rounded-full px-2 py-1 text-sm ${invoice.status === 'PAID' ? 'bg-teal-soft text-teal' : 'bg-amber-soft text-amber'}`}
                >
                  {invoiceStatusLabel(invoice.status)}
                </span>
              </td>
              <td className="px-3 py-3 text-sm text-ink">{formatRupee(invoice.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Ledger({
  ledger,
  onPay,
}: {
  ledger: CustomerLedger | null;
  onPay: () => void;
}): React.ReactElement {
  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink2">
          Outstanding {ledger ? formatRupee(ledger.outstanding) : '—'}
        </p>
        <button
          type="button"
          onClick={onPay}
          className="min-h-[44px] rounded-lg bg-action px-4 text-sm font-medium text-white"
        >
          Record payment
        </button>
      </div>
      {!ledger || ledger.entries.length === 0 ? (
        <p className="rounded-xl border border-line bg-white p-4 text-sm text-ink2">
          No ledger entries yet.
        </p>
      ) : (
        <div className="grid gap-3">
          {ledgerDays(ledger.entries).map((day) => (
            <section
              key={day.label}
              className="overflow-hidden rounded-xl border border-line bg-white"
            >
              <h3 className="border-b border-line bg-canvas px-3 py-2 text-sm font-medium text-ink">
                {day.label}
              </h3>
              <ul>
                {day.rows.map((entry) => (
                  <li
                    key={entry.id}
                    className="grid gap-1 border-b border-line px-3 py-3 text-sm last:border-b-0"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <span className="font-medium text-ink">{entry.label}</span>
                      <span className={entry.kind === 'DEBIT' ? 'text-amber' : 'text-teal'}>
                        {entry.kind === 'DEBIT' ? 'Debit' : 'Credit'} {formatRupee(entry.amount)}
                      </span>
                    </div>
                    <p className="text-ink2">
                      {formatDateTime(entry.at)} · Handled by {entry.handledBy ?? '—'}
                    </p>
                    <p className="text-ink2">Balance {formatRupee(entry.balance)}</p>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function ledgerDays(
  entries: CustomerLedger['entries'],
): { label: string; rows: CustomerLedger['entries'] }[] {
  const days: { label: string; rows: CustomerLedger['entries'] }[] = [];
  for (const entry of entries) {
    const label = formatShortDate(entry.at);
    const last = days.at(-1);
    if (last && last.label === label) {
      last.rows.push(entry);
    } else {
      days.push({ label, rows: [entry] });
    }
  }
  return days;
}

function Activity({ profile }: { profile: CustomerProfileData }): React.ReactElement {
  if (profile.activity.length === 0) {
    return (
      <p className="rounded-xl border border-line bg-white p-4 text-sm text-ink2">
        No activity yet.
      </p>
    );
  }
  return (
    <ol className="grid gap-2">
      {profile.activity.map((event) => (
        <li key={event.id} className="rounded-xl border border-line bg-white px-3 py-3">
          <p className="text-sm font-medium text-ink">{event.title}</p>
          <p className="text-xs text-ink2">
            {formatShortDate(event.at)} · {event.detail}
          </p>
        </li>
      ))}
    </ol>
  );
}
