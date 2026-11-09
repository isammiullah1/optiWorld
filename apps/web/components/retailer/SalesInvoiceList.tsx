'use client';

import {
  centsToMoney,
  moneyToCents,
  type CustomerGender,
  type SalesReport,
} from '@optiworld/shared';
import {
  Banknote,
  Calendar,
  ChevronDown,
  Eye,
  Mars,
  Pencil,
  Search,
  Trash2,
  UserRound,
  Users,
  Venus,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { RecordTrail } from '@/components/RecordTrail';

import { formatRupee, formatShortDate, invoiceStatusLabel } from './dashboard-format';
import { removeSale } from './reports-api';

type Sale = SalesReport['invoices'][number];

const PAGE_SIZES = [10, 20, 30, 40] as const;

type Filters = {
  query: string;
  gender: '' | CustomerGender;
  minAmount: string;
  maxAmount: string;
  from: string;
  to: string;
};

export function SalesInvoiceList({
  invoices,
  from,
  to,
  token,
  canEdit,
  onRange,
  onChanged,
}: {
  invoices: readonly Sale[];
  from: string;
  to: string;
  token: string | undefined;
  canEdit: boolean;
  onRange: (from: string, to: string) => void;
  onChanged: () => void;
}): React.ReactElement {
  const [draft, setDraft] = useState<Filters>({
    query: '',
    gender: '',
    minAmount: '',
    maxAmount: '',
    from,
    to,
  });
  const [applied, setApplied] = useState<Filters>(draft);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(10);

  useEffect(() => {
    setDraft((current) => ({ ...current, from, to }));
    setApplied((current) => ({ ...current, from, to }));
  }, [from, to]);

  const rows = useMemo(
    () =>
      invoices
        .filter((invoice) => matches(invoice, applied))
        .slice()
        .sort((left, right) => right.issuedAt.localeCompare(left.issuedAt)),
    [applied, invoices],
  );
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * pageSize;
  const visible = rows.slice(pageStart, pageStart + pageSize);

  useEffect(() => {
    setPage(1);
  }, [applied, pageSize]);

  async function remove(invoice: Sale): Promise<void> {
    if (!token) {
      return;
    }
    setBusyId(invoice.id);
    setError(null);
    try {
      await removeSale(token, invoice.id);
      setRemovingId(null);
      onChanged();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'The sale could not be removed');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="rounded-xl border border-action-soft bg-white">
      <form
        className="grid gap-2 border-b border-action-soft bg-canvas px-3 py-2"
        onSubmit={(event) => {
          event.preventDefault();
          setApplied(draft);
          if (draft.from && draft.to && draft.from <= draft.to) {
            onRange(draft.from, draft.to);
          }
        }}
      >
        <div className="flex items-end gap-2">
          <label className="grid min-w-0 flex-1 gap-1 text-xs text-ink2">
            Search sales
            <span className="flex h-9 items-center gap-2 rounded-lg border border-line bg-white px-3">
              <Search size={16} className="text-action" aria-hidden="true" />
              <input
                aria-label="Search sales"
                value={draft.query}
                onChange={(event) => {
                  const query = event.target.value;
                  setDraft((current) => ({ ...current, query }));
                  setApplied((current) => ({ ...current, query }));
                }}
                placeholder="Name, invoice number, or product"
                className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none"
              />
            </span>
          </label>
          <button
            type="submit"
            className="h-9 shrink-0 rounded-lg bg-action px-4 text-sm font-medium text-white"
          >
            Apply filters
          </button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <Field
            label="From"
            icon={<Calendar size={14} className="text-teal" aria-hidden="true" />}
          >
            <input
              aria-label="Sales from"
              type="date"
              value={draft.from}
              onChange={(event) =>
                setDraft((current) => ({ ...current, from: event.target.value }))
              }
              className={inputClass}
            />
          </Field>
          <Field label="To" icon={<Calendar size={14} className="text-teal" aria-hidden="true" />}>
            <input
              aria-label="Sales to"
              type="date"
              value={draft.to}
              onChange={(event) => setDraft((current) => ({ ...current, to: event.target.value }))}
              className={inputClass}
            />
          </Field>
          <GenderFilter
            value={draft.gender}
            onChange={(gender) => setDraft((current) => ({ ...current, gender }))}
          />
          <Field
            label="Amount from"
            icon={<Banknote size={14} className="text-amber" aria-hidden="true" />}
          >
            <input
              aria-label="Amount from"
              inputMode="decimal"
              value={draft.minAmount}
              onChange={(event) =>
                setDraft((current) => ({ ...current, minAmount: event.target.value }))
              }
              placeholder="0"
              className={inputClass}
            />
          </Field>
          <Field
            label="Amount up to"
            icon={<Banknote size={14} className="text-amber" aria-hidden="true" />}
          >
            <input
              aria-label="Amount up to"
              inputMode="decimal"
              value={draft.maxAmount}
              onChange={(event) =>
                setDraft((current) => ({ ...current, maxAmount: event.target.value }))
              }
              placeholder="Any"
              className={inputClass}
            />
          </Field>
        </div>
      </form>
      {error ? (
        <p role="alert" className="px-4 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1100px] border-collapse text-left">
          <thead>
            <tr className="bg-navy text-left">
              {[
                'Invoice',
                'Customer',
                'Status',
                'Payment',
                'Total',
                'Amount paid',
                'Balance',
                'Date',
                'Actions',
              ].map((heading) => (
                <th
                  key={heading}
                  className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-white"
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-sm text-ink2">
                  No sales match these filters.
                </td>
              </tr>
            ) : (
              visible.map((invoice) => (
                <SaleRow
                  key={invoice.id}
                  invoice={invoice}
                  canEdit={canEdit}
                  busy={busyId === invoice.id}
                  removing={removingId === invoice.id}
                  onAskRemove={() => setRemovingId(invoice.id)}
                  onKeep={() => setRemovingId(null)}
                  onRemove={() => {
                    void remove(invoice);
                  }}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm text-ink2">
        <p>
          {visible.length} of {rows.length}
        </p>
        <label className="inline-flex items-center gap-2">
          Show
          <select
            aria-label="Sales per page"
            value={pageSize}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (next === 10 || next === 20 || next === 30 || next === 40) {
                setPageSize(next);
              }
            }}
            className="h-9 rounded-lg border border-line bg-white px-2 text-sm text-ink outline-none focus:border-action"
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={currentPage <= 1}
            onClick={() => setPage(currentPage - 1)}
            className="h-9 rounded-lg border border-line bg-white px-3 text-sm text-ink disabled:text-ink3"
          >
            Previous
          </button>
          <button
            type="button"
            disabled={currentPage >= pageCount}
            onClick={() => setPage(currentPage + 1)}
            className="h-9 rounded-lg border border-line bg-white px-3 text-sm text-ink disabled:text-ink3"
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
}

function paidOf(total: string, outstanding: string): string {
  return centsToMoney(Math.max(0, moneyToCents(total) - moneyToCents(outstanding)));
}

function SaleRow({
  invoice,
  canEdit,
  busy,
  removing,
  onAskRemove,
  onKeep,
  onRemove,
}: {
  invoice: Sale;
  canEdit: boolean;
  busy: boolean;
  removing: boolean;
  onAskRemove: () => void;
  onKeep: () => void;
  onRemove: () => void;
}): React.ReactElement {
  const credit = Number(invoice.outstanding) > 0;
  return (
    <>
      <tr className="border-b border-line last:border-0">
        <td className="px-3 py-2 text-sm font-medium text-ink">#{invoice.invoiceNumber}</td>
        <td className="px-3 py-2">
          <Link
            href={`/retailer/customers/${invoice.customerId}`}
            className="inline-flex items-center gap-1 text-sm font-medium text-action"
          >
            <GenderMark gender={invoice.gender} />
            {invoice.customerName}
          </Link>
          {invoice.products.length > 0 ? (
            <p className="text-xs text-ink3">{invoice.products.join(', ')}</p>
          ) : null}
        </td>
        <td className="px-3 py-2">
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
              invoice.cancelled
                ? 'bg-danger-soft text-danger'
                : invoice.status === 'PAID'
                  ? 'bg-teal-soft text-teal'
                  : 'bg-amber-soft text-amber'
            }`}
          >
            {invoice.cancelled ? 'Cancelled' : invoiceStatusLabel(invoice.status)}
          </span>
        </td>
        <td className="px-3 py-2">
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${invoice.paymentType === 'CREDIT' ? 'bg-amber-soft text-amber' : 'bg-action-soft text-action'}`}
          >
            {invoice.paymentType === 'CREDIT' ? 'Credit' : 'Cash'}
          </span>
        </td>
        <td className="px-3 py-2 text-sm font-medium text-ink">{formatRupee(invoice.total)}</td>
        <td className="px-3 py-2 text-sm font-medium text-action">
          {formatRupee(paidOf(invoice.total, invoice.outstanding))}
        </td>
        <td className={`px-3 py-2 text-sm font-medium ${credit ? 'text-danger' : 'text-teal'}`}>
          {credit ? `−${formatRupee(invoice.outstanding)}` : formatRupee('0.00')}
        </td>
        <td className="px-3 py-2 text-sm text-ink2">
          {formatShortDate(invoice.issuedAt)}
          <RecordTrail activity={invoice.activity} />
        </td>
        <td className="px-3 py-2">
          <div className="flex flex-wrap items-center gap-1">
            <Link
              href={`/retailer/billing/${invoice.id}`}
              className="inline-flex min-h-8 items-center gap-1 rounded-lg px-1 text-xs font-medium text-action"
            >
              <Eye size={14} aria-hidden="true" />
              View
            </Link>
            {canEdit && !invoice.cancelled && (credit || invoice.hasPrescription) ? (
              <Link
                href={`/retailer/billing/${invoice.id}${credit ? '?edit=credit' : ''}`}
                className="inline-flex min-h-8 items-center gap-1 rounded-lg px-1 text-xs font-medium text-amber"
              >
                <Pencil size={14} aria-hidden="true" />
                Edit
              </Link>
            ) : (
              <span className="inline-flex min-h-8 items-center gap-1 px-1 text-xs font-medium text-ink3">
                <Pencil size={14} aria-hidden="true" />
                Edit
              </span>
            )}
            <button
              type="button"
              disabled={!canEdit || busy || invoice.cancelled}
              onClick={onAskRemove}
              className="inline-flex min-h-8 items-center gap-1 rounded-lg px-1 text-xs font-medium text-danger disabled:text-ink3"
            >
              <Trash2 size={14} aria-hidden="true" />
              Remove
            </button>
          </div>
        </td>
      </tr>
      {removing ? (
        <tr className="border-b border-danger-soft bg-danger-soft">
          <td colSpan={9} className="px-3 py-3">
            <p className="text-sm text-ink">
              Remove invoice #{invoice.invoiceNumber}? Stock from this sale goes back to the shelf.
            </p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={onKeep}
                className="min-h-11 rounded-lg border border-line bg-white px-4 text-sm text-ink2"
              >
                Keep
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={onRemove}
                className="min-h-11 rounded-lg bg-danger px-4 text-sm font-medium text-white disabled:opacity-60"
              >
                Remove sale
              </button>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function GenderMark({ gender }: { gender: Sale['gender'] }): React.ReactElement | null {
  if (gender === 'MALE') {
    return <Mars size={14} className="text-action" aria-label="Male" />;
  }
  if (gender === 'FEMALE') {
    return <Venus size={14} className="text-danger" aria-label="Female" />;
  }
  if (gender === 'OTHER') {
    return <UserRound size={14} className="text-teal" aria-label="Other" />;
  }
  return null;
}

function Field({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <label className="grid gap-1 text-xs text-ink2">
      <span className="inline-flex items-center gap-1">
        {icon}
        {label}
      </span>
      {children}
    </label>
  );
}

const inputClass =
  'h-9 w-full rounded-lg border border-line bg-white px-2 text-sm text-ink outline-none focus:border-action';

const GENDER_OPTIONS: ReadonlyArray<{
  id: '' | CustomerGender;
  label: string;
  icon: typeof Mars;
  iconClass: string;
}> = [
  { id: '', label: 'Any gender', icon: Users, iconClass: 'text-ink3' },
  { id: 'MALE', label: 'Male', icon: Mars, iconClass: 'text-action' },
  { id: 'FEMALE', label: 'Female', icon: Venus, iconClass: 'text-danger' },
  { id: 'OTHER', label: 'Other', icon: UserRound, iconClass: 'text-teal' },
];

function GenderFilter({
  value,
  onChange,
}: {
  value: '' | CustomerGender;
  onChange: (value: '' | CustomerGender) => void;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  const selected = GENDER_OPTIONS.find((option) => option.id === value) ?? GENDER_OPTIONS[0];
  const SelectedIcon = selected?.icon ?? Users;
  return (
    <div className="relative grid gap-1 text-xs text-ink2">
      <span>Gender</span>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex h-9 items-center justify-between gap-2 rounded-lg border border-line bg-white px-2 text-sm text-ink"
      >
        <span className="inline-flex items-center gap-1">
          <SelectedIcon size={14} className={selected?.iconClass} aria-hidden="true" />
          {selected?.label}
        </span>
        <ChevronDown size={14} className="text-ink3" aria-hidden="true" />
      </button>
      {open ? (
        <ul
          role="listbox"
          aria-label="Gender"
          className="absolute top-full z-20 mt-1 w-full rounded-lg border border-line bg-white"
        >
          {GENDER_OPTIONS.map((option) => {
            const Icon = option.icon;
            return (
              <li key={option.label}>
                <button
                  type="button"
                  role="option"
                  aria-selected={option.id === value}
                  onClick={() => {
                    onChange(option.id);
                    setOpen(false);
                  }}
                  className="flex h-9 w-full items-center gap-2 px-2 text-left text-sm text-ink hover:bg-canvas"
                >
                  <Icon size={14} className={option.iconClass} aria-hidden="true" />
                  {option.label}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function matches(invoice: Sale, filters: Filters): boolean {
  const day = invoice.issuedAt.slice(0, 10);
  if (filters.from && day < filters.from) {
    return false;
  }
  if (filters.to && day > filters.to) {
    return false;
  }
  if (filters.gender && invoice.gender !== filters.gender) {
    return false;
  }
  const total = Number(invoice.total);
  const min = numberOrNull(filters.minAmount);
  const max = numberOrNull(filters.maxAmount);
  if (min !== null && total < min) {
    return false;
  }
  if (max !== null && total > max) {
    return false;
  }
  const query = filters.query.trim().toLowerCase();
  if (!query) {
    return true;
  }
  const haystack = [invoice.customerName, String(invoice.invoiceNumber), ...invoice.products]
    .join(' ')
    .toLowerCase();
  return haystack.includes(query);
}

function numberOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}
