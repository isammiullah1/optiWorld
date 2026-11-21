'use client';

import { centsToMoney, JOB_STATUS_LABEL, moneyToCents, type LabBill } from '@optiworld/shared';
import { Check } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { Fragment, useEffect, useState } from 'react';

import { formatRupee, formatShortDate } from './dashboard-format';
import { downloadRetailerLabBills, loadRetailerLabBills } from './lab-api';

const STATUS_CLASS: Record<LabBill['status'], string> = {
  OPEN: 'bg-amber-soft text-amber',
  ISSUED: 'bg-action-soft text-action',
  CLEARED: 'bg-teal-soft text-teal',
  VOID: 'bg-danger-soft text-danger',
};

const STATUS_LABEL: Record<LabBill['status'], string> = {
  OPEN: 'Open',
  ISSUED: 'Issued',
  CLEARED: 'Paid',
  VOID: 'Rejected',
};

const PAGE_CHOICES = [10, 20, 30, 40] as const;
const MAX_ROWS = 100;

export function LabBills({ labOrgId }: { labOrgId?: string }): React.ReactElement {
  const { data: session } = useSession();
  const token = session?.accessToken;
  const owner = session?.user.role === 'OWNER';
  const [rows, setRows] = useState<LabBill[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  useEffect(() => {
    if (!token) {
      return;
    }
    void loadRetailerLabBills(token, { labOrgId, from: from || undefined, to: to || undefined })
      .then((next) => {
        setRows(next);
        setError(null);
      })
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : 'Lab bills could not be loaded');
      });
  }, [from, labOrgId, to, token]);

  function exportSheet(format: 'xlsx' | 'pdf'): void {
    if (!token) {
      return;
    }
    if ((from && !to) || (!from && to)) {
      setError('Choose both a start date and an end date.');
      return;
    }
    setError(null);
    void downloadRetailerLabBills(token, format, {
      from: from || undefined,
      to: to || undefined,
      labOrgId,
    }).catch((caught: unknown) => {
      setError(caught instanceof Error ? caught.message : 'The sheet could not be downloaded');
    });
  }

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">Lab bills</h1>
          <p className="text-sm text-ink2">
            Charges from laboratories. An issued bill is an expense. Paid means the laboratory
            marked it clear.
          </p>
        </div>
        {owner ? (
          <div className="flex gap-2">
            <button
              type="button"
              className="min-h-[44px] rounded-lg bg-action px-4 text-sm font-medium text-white"
              onClick={() => exportSheet('xlsx')}
            >
              Export Excel
            </button>
            <button
              type="button"
              className="min-h-[44px] rounded-lg border border-line bg-white px-4 text-sm font-medium text-ink2"
              onClick={() => exportSheet('pdf')}
            >
              Export PDF
            </button>
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-3">
        <label className="grid gap-1 text-xs text-ink2">
          From
          <input
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            className="min-h-[44px] rounded-lg border border-line px-3 text-sm text-ink"
          />
        </label>
        <label className="grid gap-1 text-xs text-ink2">
          To
          <input
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            className="min-h-[44px] rounded-lg border border-line px-3 text-sm text-ink"
          />
        </label>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <BillTable rows={rows} party="lab" />
    </section>
  );
}

export function BillTable({
  rows,
  party,
  actions,
  pickedIds,
  onPick,
  canPick,
}: {
  rows: LabBill[] | null;
  party: 'lab' | 'shop';
  actions?: (bill: LabBill) => React.ReactNode;
  pickedIds?: ReadonlySet<string>;
  onPick?: (bill: LabBill) => void;
  canPick?: (bill: LabBill) => boolean;
}): React.ReactElement {
  const [selected, setSelected] = useState<LabBill | null>(null);
  const [pageSize, setPageSize] = useState(10);
  const [draft, setDraft] = useState('10');
  const [page, setPage] = useState(1);
  const listKey = rows === null ? '' : rows.map((bill) => bill.id).join('|');

  useEffect(() => {
    setPage(1);
  }, [pageSize, listKey]);

  const selectable = Boolean(onPick);
  const listed = rows ?? [];
  const pageCount = Math.max(1, Math.ceil(listed.length / pageSize));
  const current = Math.min(page, pageCount);
  const start = listed.length === 0 ? 0 : (current - 1) * pageSize;
  const visible = rows === null ? null : listed.slice(start, start + pageSize);

  function applyDraft(raw: string): void {
    const next = Number(raw);
    if (!Number.isInteger(next) || next < 1 || next > MAX_ROWS) {
      setDraft(String(pageSize));
      return;
    }
    setPageSize(next);
    setDraft(String(next));
  }

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] border-collapse text-left">
          <thead>
            <tr className="bg-navy text-left">
              {[
                ...(selectable ? ['Select'] : []),
                'Job',
                'Patient',
                party === 'lab' ? 'Laboratory' : 'Party',
                'Services',
                'Status',
                'Total',
                'Opened',
                ...(actions ? ['Actions'] : []),
              ].map((heading) => (
                <th
                  key={heading}
                  className="border border-navy px-3 py-2 text-xs font-medium uppercase tracking-wide text-white"
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows === null ? (
              <tr>
                <td
                  colSpan={(selectable ? 1 : 0) + (actions ? 8 : 7)}
                  className="px-3 py-6 text-sm text-ink2"
                >
                  Loading lab bills…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td
                  colSpan={(selectable ? 1 : 0) + (actions ? 8 : 7)}
                  className="px-3 py-6 text-sm text-ink2"
                >
                  No lab bills in this view.
                </td>
              </tr>
            ) : (
              groupBillsByDay(visible ?? []).map((group, groupIndex) => {
                const span = (selectable ? 1 : 0) + (actions ? 8 : 7);
                return (
                  <Fragment key={group.day}>
                    {groupIndex > 0 ? (
                      <tr aria-hidden="true">
                        <td colSpan={span} className="h-2 border-0 bg-white p-0" />
                      </tr>
                    ) : null}
                    <tr>
                      <td
                        colSpan={span}
                        className={`border-x-2 border-t-2 border-b-2 px-3 py-2 text-sm font-semibold text-ink ${group.edge} ${group.fill}`}
                      >
                        {group.label}
                        <span className="ml-2 text-xs font-medium text-ink2">
                          {group.rows.length} {group.rows.length === 1 ? 'bill' : 'bills'}
                        </span>
                      </td>
                    </tr>
                    {group.rows.map((bill) => {
                      const box = `${group.fill} border-b-2 ${group.edge}`;
                      return (
                        <tr key={bill.id} className="hover:bg-white">
                          {selectable ? (
                            <td className={`border-l-2 px-2 py-2 ${group.edge} ${box}`}>
                              {canPick?.(bill) ? (
                                <label className="inline-flex min-h-11 min-w-11 items-center justify-center">
                                  <input
                                    type="checkbox"
                                    checked={pickedIds?.has(bill.id) === true}
                                    aria-label={`Select ${bill.referenceNumber}`}
                                    onChange={() => onPick?.(bill)}
                                    className="h-4 w-4 accent-navy"
                                  />
                                </label>
                              ) : null}
                            </td>
                          ) : null}
                          <td
                            className={`${selectable ? '' : 'border-l-2'} px-3 py-2 text-sm font-medium text-ink ${group.edge} ${box}`}
                          >
                            <button
                              type="button"
                              className="text-left font-medium text-action underline-offset-2 hover:underline"
                              onClick={() => setSelected(bill)}
                            >
                              {bill.referenceNumber}
                            </button>
                          </td>
                          <td className={`px-3 py-2 text-sm text-ink ${box}`}>
                            {bill.patientName}
                          </td>
                          <td className={`px-3 py-2 text-sm text-ink ${box}`}>
                            {party === 'lab'
                              ? bill.labName
                              : (bill.retailerName ?? bill.clientName ?? 'Walk-in')}
                          </td>
                          <td className={`px-3 py-2 text-sm text-ink2 ${box}`}>
                            <button
                              type="button"
                              className="text-left text-ink2 underline-offset-2 hover:text-action hover:underline"
                              onClick={() => setSelected(bill)}
                            >
                              {bill.lines
                                .map((line) => `${line.serviceName} × ${line.quantity}`)
                                .join(', ') || '—'}
                            </button>
                          </td>
                          <td className={`px-3 py-2 ${box}`}>
                            <span
                              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[bill.status]} ${bill.status === 'CLEARED' ? 'border-[#16A34A]' : 'border-current'}`}
                            >
                              {bill.status === 'CLEARED' ? (
                                <Check size={12} className="text-[#16A34A]" aria-hidden="true" />
                              ) : null}
                              {STATUS_LABEL[bill.status]}
                            </span>
                          </td>
                          <td className={`px-3 py-2 text-sm font-semibold text-ink ${box}`}>
                            <button
                              type="button"
                              className="text-left font-semibold text-ink underline-offset-2 hover:text-action hover:underline"
                              onClick={() => setSelected(bill)}
                            >
                              {formatRupee(bill.total)}
                            </button>
                          </td>
                          <td
                            className={`px-3 py-2 text-sm text-ink2 ${actions ? '' : `border-r-2 ${group.edge}`} ${box}`}
                          >
                            {formatShortDate(bill.createdAt)}
                          </td>
                          {actions ? (
                            <td className={`border-r-2 px-3 py-2 ${group.edge} ${box}`}>
                              {actions(bill)}
                            </td>
                          ) : null}
                        </tr>
                      );
                    })}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {rows !== null ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm text-ink2">
          <p>
            {listed.length === 0 ? '0' : start + 1}–{start + (visible?.length ?? 0)} of{' '}
            {listed.length}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {PAGE_CHOICES.map((size) => (
              <button
                key={size}
                type="button"
                aria-pressed={pageSize === size}
                onClick={() => {
                  setPageSize(size);
                  setDraft(String(size));
                }}
                className={`h-9 min-w-9 rounded-lg border px-2 text-sm ${
                  pageSize === size
                    ? 'border-navy bg-navy text-white'
                    : 'border-line bg-white text-ink'
                }`}
              >
                {size}
              </button>
            ))}
            <form
              className="flex items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                applyDraft(draft);
              }}
            >
              <label className="flex items-center gap-2">
                Rows
                <input
                  type="number"
                  min={1}
                  max={MAX_ROWS}
                  inputMode="numeric"
                  value={draft}
                  aria-label="Rows to show"
                  onChange={(event) => setDraft(event.target.value)}
                  onBlur={() => applyDraft(draft)}
                  className="h-9 w-16 rounded-lg border border-line bg-white px-2 text-sm text-ink outline-none focus:border-action"
                />
              </label>
            </form>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={current <= 1}
              onClick={() => setPage(current - 1)}
              className="h-9 rounded-lg border border-line bg-white px-3 text-sm text-ink disabled:text-ink3"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={current >= pageCount}
              onClick={() => setPage(current + 1)}
              className="h-9 rounded-lg border border-line bg-white px-3 text-sm text-ink disabled:text-ink3"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
      {selected ? (
        <BillDetail bill={selected} party={party} onClose={() => setSelected(null)} />
      ) : null}
    </div>
  );
}

function BillDetail({
  bill,
  party,
  onClose,
}: {
  bill: LabBill;
  party: 'lab' | 'shop';
  onClose: () => void;
}): React.ReactElement {
  const partyName =
    party === 'lab' ? bill.labName : (bill.retailerName ?? bill.clientName ?? 'Walk-in');
  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 sm:items-center"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="lab-bill-detail-title"
        className="grid max-h-[92vh] w-full max-w-3xl gap-3 overflow-hidden rounded-t-xl border-2 border-teal bg-teal-soft p-4 sm:rounded-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 rounded-lg bg-teal px-4 py-3 text-white">
          <div>
            <h2 id="lab-bill-detail-title" className="text-lg font-semibold">
              {bill.referenceNumber}
            </h2>
            <p className="text-sm text-white/80">
              {bill.patientName} · {partyName} · {JOB_STATUS_LABEL[bill.jobStatus]}
            </p>
          </div>
          <button type="button" className="min-h-[44px] px-2 text-sm text-white" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="rounded-lg bg-white px-3 py-2 text-sm text-ink">{bill.jobSummary}</p>
        <div className="max-h-[50vh] overflow-auto rounded-lg border border-line bg-white">
          <table className="w-full border-collapse text-left">
            <thead className="sticky top-0">
              <tr className="bg-amber-soft text-left">
                {['Service', 'List price', 'Charged', 'Qty', 'Line'].map((heading) => (
                  <th
                    key={heading}
                    className="border border-amber px-3 py-2 text-xs font-medium uppercase tracking-wide text-ink"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bill.lines.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-sm text-ink2">
                    No services on this bill yet.
                  </td>
                </tr>
              ) : (
                bill.lines.map((line) => (
                  <tr key={line.id}>
                    <td className="border border-line px-3 py-2 text-sm text-ink">
                      {line.serviceName}
                    </td>
                    <td className="border border-line px-3 py-2 text-sm text-ink2">
                      {formatRupee(line.listPrice)}
                    </td>
                    <td className="border border-line px-3 py-2 text-sm text-ink">
                      {formatRupee(line.unitPrice)}
                    </td>
                    <td className="border border-line px-3 py-2 text-sm text-ink">
                      {line.quantity}
                    </td>
                    <td className="border border-line px-3 py-2 text-sm font-semibold text-ink">
                      {formatRupee(line.lineTotal)}
                    </td>
                  </tr>
                ))
              )}
              <tr>
                <td colSpan={4} className="border border-line px-3 py-2 text-sm text-ink2">
                  Discount{bill.discountReason ? ` · ${bill.discountReason}` : ''}
                </td>
                <td className="border border-line px-3 py-2 text-sm text-ink">
                  {formatRupee(bill.discount)}
                </td>
              </tr>
              {bill.adjustments.map((row) => (
                <tr key={row.id}>
                  <td colSpan={4} className="border border-line px-3 py-2 text-sm text-ink2">
                    {row.note}
                  </td>
                  <td className="border border-line px-3 py-2 text-sm text-ink">
                    {formatRupee(row.amount)}
                  </td>
                </tr>
              ))}
              {!bill.retailerName && !bill.clientName ? (
                <>
                  <tr>
                    <td colSpan={4} className="border border-line px-3 py-2 text-sm text-ink2">
                      Received
                    </td>
                    <td className="border border-line px-3 py-2 text-sm text-ink">
                      {formatRupee(bill.amountPaid)}
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={4} className="border border-line px-3 py-2 text-sm text-ink2">
                      Balance
                    </td>
                    <td className="border border-line px-3 py-2 text-sm font-semibold text-ink">
                      {formatRupee(
                        centsToMoney(
                          Math.max(0, moneyToCents(bill.total) - moneyToCents(bill.amountPaid)),
                        ),
                      )}
                    </td>
                  </tr>
                </>
              ) : null}
              <tr className="bg-canvas">
                <td
                  colSpan={4}
                  className="border border-line px-3 py-2 text-sm font-semibold text-ink"
                >
                  Total · {STATUS_LABEL[bill.status]}
                </td>
                <td className="border border-line px-3 py-2 text-sm font-semibold text-ink">
                  {formatRupee(bill.total)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const DAY_LOOK = [
  { fill: 'bg-action-soft', edge: 'border-action' },
  { fill: 'bg-teal-soft', edge: 'border-teal' },
  { fill: 'bg-amber-soft', edge: 'border-amber' },
  { fill: 'bg-[var(--ow-navy-soft)]', edge: 'border-navy' },
  { fill: 'bg-[var(--ow-work-soft)]', edge: 'border-[var(--ow-work)]' },
  { fill: 'bg-[var(--ow-sent-soft)]', edge: 'border-[var(--ow-sent)]' },
] as const;

function groupBillsByDay(rows: readonly LabBill[]): Array<{
  day: string;
  label: string;
  fill: string;
  edge: string;
  rows: LabBill[];
}> {
  const groups: Array<{ day: string; label: string; fill: string; edge: string; rows: LabBill[] }> =
    [];
  const index = new Map<string, number>();
  for (const bill of rows) {
    const day = new Date(bill.createdAt).toLocaleDateString('en-CA');
    const existing = index.get(day);
    if (existing !== undefined) {
      groups[existing]?.rows.push(bill);
      continue;
    }
    const look = DAY_LOOK[groups.length % DAY_LOOK.length] ?? DAY_LOOK[0];
    index.set(day, groups.length);
    groups.push({
      day,
      label: formatShortDate(bill.createdAt),
      fill: look.fill,
      edge: look.edge,
      rows: [bill],
    });
  }
  return groups;
}
