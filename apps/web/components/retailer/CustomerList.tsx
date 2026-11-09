'use client';

import type { CustomerGender, CustomerListItem, CustomerListQuery } from '@optiworld/shared';
import { Eye, Mars, Pencil, Plus, Search, Trash2, UserRound, Users, Venus } from 'lucide-react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { CustomerDrawer, type CustomerFormValues } from './CustomerDrawer';
import {
  createCustomerRecord,
  deleteCustomerRecord,
  loadCustomerProfile,
  loadCustomers,
  updateCustomerRecord,
} from './customers-api';
import { formatRupee, formatShortDate } from './dashboard-format';

const PAGE_SIZES = [10, 20, 30, 40] as const;
const FILTERS = [
  { id: 'ALL', label: 'All' },
  { id: 'HAS_DUES', label: 'Has dues' },
  { id: 'NO_DUES', label: 'No dues' },
] as const;
const SORTS = [
  { id: 'NAME', label: 'Name' },
  { id: 'RECENT', label: 'Recent' },
  { id: 'HIGHEST_DUES', label: 'Highest dues' },
] as const;

type Filters = {
  q: string;
  dues: CustomerListQuery['dues'];
  sort: CustomerListQuery['sort'];
  gender: '' | CustomerGender;
  minAge: string;
  maxAge: string;
  minOutstanding: string;
  maxOutstanding: string;
};

const EMPTY_FILTERS: Filters = {
  q: '',
  dues: 'ALL',
  sort: 'NAME',
  gender: '',
  minAge: '',
  maxAge: '',
  minOutstanding: '',
  maxOutstanding: '',
};

export function CustomerList(): React.ReactElement {
  const { data: session } = useSession();
  const token = session?.accessToken;
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(10);
  const [rows, setRows] = useState<CustomerListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<(CustomerFormValues & { id: string }) | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      return;
    }
    let active = true;
    setLoading(true);
    const handle = window.setTimeout(() => {
      void loadCustomers(token, toQuery(applied, page, pageSize))
        .then((result) => {
          if (active) {
            setRows(result.rows);
            setTotal(result.meta.total);
            setError(null);
          }
        })
        .catch((reason: unknown) => {
          if (active) {
            setError(reason instanceof Error ? reason.message : 'Customers could not be loaded');
          }
        })
        .finally(() => {
          if (active) {
            setLoading(false);
          }
        });
    }, 200);
    return () => {
      active = false;
      window.clearTimeout(handle);
    };
  }, [token, applied, page, pageSize, saving, removingId]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, pageCount);

  async function openEdit(id: string): Promise<void> {
    if (!token) {
      return;
    }
    setSaveError(null);
    const profile = await loadCustomerProfile(token, id);
    setEditing({
      id: profile.id,
      name: profile.name,
      phone: profile.phone ?? '',
      whatsappNumber: profile.whatsappNumber ?? '',
      email: profile.email ?? '',
      gender: profile.gender ?? '',
      dateOfBirth: profile.dateOfBirth ?? '',
      address: profile.address ?? '',
      creditLimit: profile.creditLimit,
      notes: profile.notes ?? '',
    });
    setDrawerOpen(true);
  }

  async function remove(id: string): Promise<void> {
    if (!token) {
      return;
    }
    setBusyId(id);
    setError(null);
    try {
      await deleteCustomerRecord(token, id);
      setRemovingId(null);
      setApplied((current) => ({ ...current }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The customer could not be deleted');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-ink">Customers</h1>
        <button
          type="button"
          onClick={() => {
            setEditing(null);
            setSaveError(null);
            setDrawerOpen(true);
          }}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-action px-4 text-sm font-medium text-white"
        >
          <Plus size={16} aria-hidden="true" />
          Add customer
        </button>
      </div>
      <form
        className="grid gap-2 rounded-xl border border-action-soft bg-white px-3 py-3"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setApplied(draft);
        }}
      >
        <div className="flex items-end gap-2">
          <label className="grid min-w-0 flex-1 gap-1 text-xs text-ink2">
            Search customers
            <span className="flex h-9 items-center gap-2 rounded-lg border border-line bg-white px-3">
              <Search size={16} className="text-action" aria-hidden="true" />
              <input
                aria-label="Search customers"
                value={draft.q}
                onChange={(event) => {
                  const q = event.target.value;
                  setDraft((current) => ({ ...current, q }));
                  setPage(1);
                  setApplied((current) => ({ ...current, q }));
                }}
                placeholder="Name, phone, or email"
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
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
          <GenderFilter
            value={draft.gender}
            onChange={(gender) => setDraft((current) => ({ ...current, gender }))}
          />
          <Filter label="Age from">
            <input
              aria-label="Age from"
              inputMode="numeric"
              value={draft.minAge}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  minAge: event.target.value.replace(/\D/g, '').slice(0, 3),
                }))
              }
              className={inputClass}
            />
          </Filter>
          <Filter label="Age up to">
            <input
              aria-label="Age up to"
              inputMode="numeric"
              value={draft.maxAge}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  maxAge: event.target.value.replace(/\D/g, '').slice(0, 3),
                }))
              }
              className={inputClass}
            />
          </Filter>
          <Filter label="Outstanding from">
            <input
              aria-label="Outstanding from"
              inputMode="decimal"
              value={draft.minOutstanding}
              onChange={(event) =>
                setDraft((current) => ({ ...current, minOutstanding: event.target.value }))
              }
              className={inputClass}
            />
          </Filter>
          <Filter label="Outstanding up to">
            <input
              aria-label="Outstanding up to"
              inputMode="decimal"
              value={draft.maxOutstanding}
              onChange={(event) =>
                setDraft((current) => ({ ...current, maxOutstanding: event.target.value }))
              }
              className={inputClass}
            />
          </Filter>
          <label className="grid gap-1 text-xs text-ink2">
            Sort
            <select
              aria-label="Sort customers"
              value={draft.sort}
              onChange={(event) =>
                setDraft((current) => ({ ...current, sort: event.target.value as Filters['sort'] }))
              }
              className={inputClass}
            >
              {SORTS.map((sort) => (
                <option key={sort.id} value={sort.id}>
                  {sort.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Dues">
          {FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              onClick={() => {
                setPage(1);
                setDraft((current) => ({ ...current, dues: filter.id }));
                setApplied((current) => ({ ...current, dues: filter.id }));
              }}
              className={`h-9 rounded-full px-3 text-sm ${applied.dues === filter.id ? 'bg-action text-white' : 'border border-line bg-white text-ink2'}`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </form>
      {error ? (
        <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {loading ? (
        <div
          className="h-40 animate-pulse rounded-xl border border-line bg-white"
          aria-busy="true"
        />
      ) : (
        <CustomerTable
          rows={rows}
          total={total}
          pageSize={pageSize}
          currentPage={currentPage}
          pageCount={pageCount}
          removingId={removingId}
          busyId={busyId}
          onPageSize={(size) => {
            setPageSize(size);
            setPage(1);
          }}
          onPage={setPage}
          onEdit={(id) => {
            void openEdit(id);
          }}
          onAskRemove={setRemovingId}
          onRemove={(id) => {
            void remove(id);
          }}
        />
      )}
      <CustomerDrawer
        key={editing?.id ?? 'new'}
        open={drawerOpen}
        saving={saving}
        error={saveError}
        title={editing ? 'Edit customer' : 'Add customer'}
        initial={editing ?? undefined}
        onClose={() => setDrawerOpen(false)}
        onCreate={async (input) => {
          if (!token) {
            return;
          }
          setSaving(true);
          setSaveError(null);
          try {
            if (editing) {
              await updateCustomerRecord(token, editing.id, input);
            } else {
              await createCustomerRecord(token, input);
            }
            setDrawerOpen(false);
            setEditing(null);
            setApplied((current) => ({ ...current }));
          } catch (reason) {
            setSaveError(
              reason instanceof Error ? reason.message : 'The customer could not be saved',
            );
          } finally {
            setSaving(false);
          }
        }}
      />
    </section>
  );
}

function CustomerTable({
  rows,
  total,
  pageSize,
  currentPage,
  pageCount,
  removingId,
  busyId,
  onPageSize,
  onPage,
  onEdit,
  onAskRemove,
  onRemove,
}: {
  rows: readonly CustomerListItem[];
  total: number;
  pageSize: (typeof PAGE_SIZES)[number];
  currentPage: number;
  pageCount: number;
  removingId: string | null;
  busyId: string | null;
  onPageSize: (size: (typeof PAGE_SIZES)[number]) => void;
  onPage: (page: number) => void;
  onEdit: (id: string) => void;
  onAskRemove: (id: string | null) => void;
  onRemove: (id: string) => void;
}): React.ReactElement {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-white">
      {rows.length === 0 ? (
        <div className="p-6">
          <h2 className="text-md font-semibold text-ink">No customers</h2>
          <p className="mt-1 text-sm text-ink2">Add a customer or change the search.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-left">
            <thead>
              <tr className="bg-navy text-left">
                {[
                  'Name',
                  'Age',
                  'Phone',
                  'Total purchases',
                  'Outstanding',
                  'Last invoice',
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
              {rows.map((row) => (
                <CustomerRow
                  key={row.id}
                  row={row}
                  removing={removingId === row.id}
                  busy={busyId === row.id}
                  onEdit={() => onEdit(row.id)}
                  onAskRemove={() => onAskRemove(row.id)}
                  onKeep={() => onAskRemove(null)}
                  onRemove={() => onRemove(row.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm text-ink2">
        <p>
          {rows.length} of {total}
        </p>
        <label className="inline-flex items-center gap-2">
          Show
          <select
            aria-label="Customers per page"
            value={pageSize}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (next === 10 || next === 20 || next === 30 || next === 40) {
                onPageSize(next);
              }
            }}
            className="h-9 rounded-lg border border-line bg-white px-2 text-sm text-ink"
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
            onClick={() => onPage(currentPage - 1)}
            className="h-9 rounded-lg border border-line bg-white px-3 text-sm text-ink disabled:text-ink3"
          >
            Previous
          </button>
          <button
            type="button"
            disabled={currentPage >= pageCount}
            onClick={() => onPage(currentPage + 1)}
            className="h-9 rounded-lg border border-line bg-white px-3 text-sm text-ink disabled:text-ink3"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

function CustomerRow({
  row,
  removing,
  busy,
  onEdit,
  onAskRemove,
  onKeep,
  onRemove,
}: {
  row: CustomerListItem;
  removing: boolean;
  busy: boolean;
  onEdit: () => void;
  onAskRemove: () => void;
  onKeep: () => void;
  onRemove: () => void;
}): React.ReactElement {
  return (
    <>
      <tr className="border-b border-line last:border-0 hover:bg-canvas">
        <td className="px-3 py-3 text-sm font-medium">
          <Link
            href={`/retailer/customers/${row.id}`}
            className="inline-flex items-center gap-1 text-action"
          >
            <GenderMark gender={row.gender} />
            {row.name}
          </Link>
        </td>
        <td className="px-3 py-3 text-sm text-ink">{ageLabel(row.dateOfBirth)}</td>
        <td className={`px-3 py-3 text-sm ${row.phone ? 'text-ink' : 'text-ink3'}`}>
          {row.phone ?? '—'}
        </td>
        <td className="px-3 py-3 text-sm font-medium text-action">
          {formatRupee(row.totalPurchases)}
        </td>
        <td
          className={`px-3 py-3 text-sm font-medium ${row.outstanding === '0.00' ? 'text-teal' : 'text-amber'}`}
        >
          {formatRupee(row.outstanding)}
        </td>
        <td className={`px-3 py-3 text-sm ${row.lastInvoice ? 'text-navy' : 'text-ink3'}`}>
          {row.lastInvoice
            ? `#${row.lastInvoice.invoiceNumber} · ${formatShortDate(row.lastInvoice.issuedAt)}`
            : '—'}
        </td>
        <td className="px-3 py-3">
          <div className="flex flex-wrap items-center gap-1">
            <Link
              href={`/retailer/customers/${row.id}`}
              className="inline-flex min-h-11 items-center gap-1 rounded-lg px-1 text-xs font-medium text-action"
            >
              <Eye size={14} aria-hidden="true" />
              View
            </Link>
            <Link
              href={`/retailer/billing/new?customer=${row.id}`}
              className="inline-flex min-h-11 items-center gap-1 rounded-lg px-1 text-xs font-medium text-teal"
            >
              <Plus size={14} aria-hidden="true" />
              New invoice
            </Link>
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex min-h-11 items-center gap-1 rounded-lg px-1 text-xs font-medium text-amber"
            >
              <Pencil size={14} aria-hidden="true" />
              Edit
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onAskRemove}
              className="inline-flex min-h-11 items-center gap-1 rounded-lg px-1 text-xs font-medium text-danger disabled:text-ink3"
            >
              <Trash2 size={14} aria-hidden="true" />
              Delete
            </button>
          </div>
        </td>
      </tr>
      {removing ? (
        <tr className="border-b border-danger-soft bg-danger-soft">
          <td colSpan={7} className="px-3 py-3">
            <p className="text-sm text-ink">
              Delete {row.name}? Past invoices stay on file. This customer leaves the list.
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
                Delete customer
              </button>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function toQuery(filters: Filters, page: number, limit: number): CustomerListQuery {
  const minAge = numberOrUndefined(filters.minAge);
  const maxAge = numberOrUndefined(filters.maxAge);
  return {
    q: filters.q,
    dues: filters.dues,
    sort: filters.sort,
    page,
    limit,
    ...(filters.gender ? { gender: filters.gender } : {}),
    ...(minAge !== undefined ? { minAge } : {}),
    ...(maxAge !== undefined ? { maxAge } : {}),
    ...(moneyOrUndefined(filters.minOutstanding)
      ? { minOutstanding: moneyOrUndefined(filters.minOutstanding) }
      : {}),
    ...(moneyOrUndefined(filters.maxOutstanding)
      ? { maxOutstanding: moneyOrUndefined(filters.maxOutstanding) }
      : {}),
  };
}

function numberOrUndefined(value: string): number | undefined {
  if (value.trim().length === 0) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function moneyOrUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return /^\d{1,10}(\.\d{1,2})?$/.test(trimmed) ? trimmed : undefined;
}

function ageLabel(value: string | null): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return '—';
  }
  const born = new Date(`${value}T00:00:00`);
  const now = new Date();
  let years = now.getFullYear() - born.getFullYear();
  const month = now.getMonth() - born.getMonth();
  if (month < 0 || (month === 0 && now.getDate() < born.getDate())) {
    years -= 1;
  }
  return years >= 0 ? String(years) : '—';
}

function GenderMark({ gender }: { gender: CustomerListItem['gender'] }): React.ReactElement | null {
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
      </button>
      {open ? (
        <ul
          role="listbox"
          className="absolute z-20 mt-16 w-full rounded-lg border border-line bg-white py-1"
        >
          {GENDER_OPTIONS.map((option) => {
            const Icon = option.icon;
            return (
              <li key={option.label}>
                <button
                  type="button"
                  className="flex min-h-11 w-full items-center gap-2 px-2 text-left text-sm text-ink"
                  onClick={() => {
                    onChange(option.id);
                    setOpen(false);
                  }}
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

function Filter({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <label className="grid gap-1 text-xs text-ink2">
      {label}
      {children}
    </label>
  );
}

const inputClass =
  'h-9 w-full rounded-lg border border-line bg-white px-2 text-sm text-ink outline-none focus:border-action';
