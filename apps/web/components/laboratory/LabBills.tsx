'use client';

import {
  centsToMoney,
  moneyToCents,
  type LabBill,
  type LabClientRow,
  type LabServiceRow,
} from '@optiworld/shared';
import { Plus, Receipt } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';

import { formatRupee } from '@/components/retailer/dashboard-format';
import { BillTable } from '@/components/retailer/LabBills';

import {
  addLabBillLine,
  adjustLabBill,
  clearLabBill,
  collectWalkInBalance,
  downloadLaboratoryBills,
  issueLabBill,
  loadLabClients,
  loadLaboratoryBills,
  loadOwnLabServices,
  updateLabBill,
} from './lab-api';
import { RefusedJobs } from './RefusedJobs';
import { ShopStatement } from './ShopStatement';
import { WalkInInvoice } from './WalkInInvoice';

export function LabBills({ labClientId }: { labClientId?: string }): React.ReactElement {
  const { data: session } = useSession();
  const token = session?.accessToken;
  const admin = session?.user.role === 'ADMIN';
  const [rows, setRows] = useState<LabBill[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [clientId, setClientId] = useState(labClientId ?? '');
  const [clients, setClients] = useState<LabClientRow[]>([]);
  const [editing, setEditing] = useState<LabBill | null>(null);
  const [invoice, setInvoice] = useState<LabBill | null>(null);
  const [statement, setStatement] = useState(false);

  function reload(): void {
    if (!token) {
      return;
    }
    void loadLaboratoryBills(token, {
      labClientId: clientId || undefined,
      from: from || undefined,
      to: to || undefined,
    })
      .then((next) => {
        setRows(next);
        setError(null);
      })
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : 'Lab bills could not be loaded');
      });
  }

  useEffect(() => {
    reload();
  }, [clientId, from, to, token]);

  useEffect(() => {
    if (!token) {
      return;
    }
    void loadLabClients(token)
      .then(setClients)
      .catch(() => undefined);
  }, [token]);

  function exportSheet(format: 'xlsx' | 'pdf'): void {
    if (!token) {
      return;
    }
    if ((from && !to) || (!from && to)) {
      setError('Choose both a start date and an end date.');
      return;
    }
    setError(null);
    void downloadLaboratoryBills(token, format, {
      from: from || undefined,
      to: to || undefined,
      labClientId: clientId || undefined,
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
            Income from shops and walk-in jobs. Issue a bill to record it, then mark it paid when
            the shop has settled.
          </p>
        </div>
        {admin ? (
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
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-xs text-ink2">
          Retailer
          <select
            value={clientId}
            onChange={(event) => setClientId(event.target.value)}
            className="min-h-[44px] rounded-lg border border-line bg-white px-3 text-sm text-ink"
          >
            <option value="">All parties</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        </label>
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
        <div className="flex flex-wrap gap-2">
          {(
            [
              ['day', 'Today'],
              ['week', 'This week'],
              ['month', 'This month'],
            ] as const
          ).map(([kind, label]) => (
            <button
              key={kind}
              type="button"
              className="min-h-[44px] rounded-lg border border-navy bg-white px-3 text-sm font-medium text-navy"
              onClick={() => {
                const range = periodRange(kind);
                setFrom(range.from);
                setTo(range.to);
              }}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            className="min-h-[44px] rounded-lg bg-navy px-4 text-sm font-medium text-white"
            onClick={() => {
              if (!clientId || !from || !to) {
                setError('Choose one retailer and both dates for the joint bill.');
                return;
              }
              setError(null);
              setStatement(true);
            }}
          >
            Print statement
          </button>
        </div>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <BillTable
        rows={rows === null ? null : rows.filter((bill) => bill.status !== 'VOID')}
        party="shop"
        actions={
          admin
            ? (bill) =>
                token ? (
                  <div className="flex flex-wrap gap-2">
                    {isWalkInBill(bill) ? (
                      <button
                        type="button"
                        className="inline-flex min-h-8 items-center gap-1.5 rounded-lg bg-teal px-3 text-xs font-semibold text-white"
                        onClick={() => setInvoice(bill)}
                      >
                        <Receipt size={14} aria-hidden="true" />
                        Invoice
                      </button>
                    ) : null}
                    {isWalkInBill(bill) && bill.status !== 'VOID' && bill.status !== 'OPEN' ? (
                      <button
                        type="button"
                        className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-navy bg-white px-3 text-xs font-semibold text-navy"
                        onClick={() => setEditing(bill)}
                      >
                        <Plus size={14} aria-hidden="true" />
                        Add service
                      </button>
                    ) : null}
                    {bill.status === 'OPEN' ? (
                      <button
                        type="button"
                        className="min-h-8 rounded-lg border border-line bg-white px-3 text-xs font-semibold text-ink"
                        onClick={() => setEditing(bill)}
                      >
                        Edit
                      </button>
                    ) : null}
                    {bill.status === 'OPEN' ? (
                      <button
                        type="button"
                        className="min-h-8 rounded-lg bg-action px-3 text-xs font-semibold text-white"
                        onClick={() => {
                          void issueLabBill(token, bill.id)
                            .then(reload)
                            .catch((caught: unknown) => {
                              setError(
                                caught instanceof Error
                                  ? caught.message
                                  : 'The bill could not be issued',
                              );
                            });
                        }}
                      >
                        Issue
                      </button>
                    ) : null}
                    {bill.status === 'ISSUED' && !isWalkInBill(bill) ? (
                      <button
                        type="button"
                        className="min-h-8 rounded-lg border border-line bg-white px-3 text-xs font-semibold text-ink"
                        onClick={() => setEditing(bill)}
                      >
                        Adjust
                      </button>
                    ) : null}
                    {bill.status === 'ISSUED' && !isWalkInBill(bill) ? (
                      <button
                        type="button"
                        className="min-h-8 rounded-lg bg-teal px-3 text-xs font-semibold text-white"
                        onClick={() => {
                          void clearLabBill(token, bill.id)
                            .then(reload)
                            .catch((caught: unknown) => {
                              setError(
                                caught instanceof Error
                                  ? caught.message
                                  : 'The bill could not be marked paid',
                              );
                            });
                        }}
                      >
                        Mark paid
                      </button>
                    ) : null}
                  </div>
                ) : null
            : undefined
        }
      />
      <RefusedJobs />
      {editing && token ? (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-navy/40 p-3">
          <BillEditor
            bill={editing}
            token={token}
            onClose={() => setEditing(null)}
            onChanged={(next) => {
              setEditing(next);
              reload();
            }}
            onSave={async (input) => {
              const next = await updateLabBill(token, editing.id, input);
              setEditing(null);
              reload();
              return next;
            }}
            onCollect={async () => {
              const next = await collectWalkInBalance(token, editing.id);
              setEditing(next);
              reload();
            }}
          />
        </div>
      ) : null}
      {invoice && token ? (
        <WalkInInvoice token={token} bill={invoice} onClose={() => setInvoice(null)} />
      ) : null}
      {statement ? (
        <ShopStatement
          shopName={clients.find((client) => client.id === clientId)?.name ?? 'Retailer'}
          from={from}
          to={to}
          rows={rows ?? []}
          onClose={() => setStatement(false)}
        />
      ) : null}
    </section>
  );
}

function BillEditor({
  bill,
  token,
  onClose,
  onChanged,
  onSave,
  onCollect,
}: {
  bill: LabBill;
  token: string;
  onClose: () => void;
  onChanged: (bill: LabBill) => void;
  onSave: (input: {
    discount: string;
    discountReason: string;
    lines: Array<{ id: string; unitPrice: string; quantity: number }>;
  }) => Promise<LabBill>;
  onCollect: () => Promise<void>;
}): React.ReactElement {
  const open = bill.status === 'OPEN';
  const walkIn = isWalkInBill(bill);
  const canAddService = open || (walkIn && bill.status !== 'VOID');
  const balance = Math.max(0, moneyToCents(bill.total) - moneyToCents(bill.amountPaid));
  const [discount, setDiscount] = useState(bill.discount);
  const [reason, setReason] = useState(bill.discountReason ?? '');
  const [lines, setLines] = useState(bill.lines.map((line) => ({ ...line })));
  const [services, setServices] = useState<LabServiceRow[]>([]);
  const [serviceId, setServiceId] = useState('');
  const [note, setNote] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDiscount(bill.discount);
    setReason(bill.discountReason ?? '');
    setLines(bill.lines.map((line) => ({ ...line })));
  }, [bill]);

  useEffect(() => {
    if (!canAddService) {
      return;
    }
    void loadOwnLabServices(token)
      .then((rows) => {
        setServices(rows.filter((row) => row.isActive && Number(row.price) > 0));
      })
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : 'The rate card could not be loaded');
      });
  }, [canAddService, token]);

  return (
    <form
      className="grid max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl gap-3 overflow-y-auto rounded-xl border-2 border-navy bg-action-soft p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!open || lines.length === 0) {
          return;
        }
        void onSave({
          discount,
          discountReason: reason,
          lines: lines.map((line) => ({
            id: line.id,
            unitPrice: line.unitPrice,
            quantity: line.quantity,
          })),
        }).catch((caught: unknown) => {
          setError(caught instanceof Error ? caught.message : 'The bill could not be saved');
        });
      }}
    >
      <h2 className="rounded-lg bg-navy px-4 py-3 text-lg font-semibold text-white">
        {open ? 'Edit' : walkIn ? 'Add service' : 'Adjust'} {bill.referenceNumber}
      </h2>
      {lines.map((line) => (
        <div key={line.id} className="flex flex-wrap items-end gap-2">
          <span className="min-w-32 text-sm text-ink">{line.serviceName}</span>
          <label className="grid gap-1 text-xs text-ink2">
            Price
            <input
              value={line.unitPrice}
              disabled={!open}
              onChange={(event) =>
                setLines((current) =>
                  current.map((item) =>
                    item.id === line.id ? { ...item, unitPrice: event.target.value } : item,
                  ),
                )
              }
              className="h-10 w-28 rounded-lg border border-line px-2 text-sm disabled:bg-canvas"
            />
          </label>
          <label className="grid gap-1 text-xs text-ink2">
            Qty
            <input
              value={String(line.quantity)}
              disabled={!open}
              onChange={(event) =>
                setLines((current) =>
                  current.map((item) =>
                    item.id === line.id
                      ? { ...item, quantity: Number(event.target.value) || 1 }
                      : item,
                  ),
                )
              }
              className="h-10 w-20 rounded-lg border border-line px-2 text-sm disabled:bg-canvas"
            />
          </label>
        </div>
      ))}
      {canAddService ? (
        <div className="flex flex-wrap items-end gap-2 rounded-lg bg-white p-3">
          <label className="grid gap-1 text-xs text-ink2">
            Add a service
            <select
              value={serviceId}
              onChange={(event) => setServiceId(event.target.value)}
              className="h-10 min-w-48 rounded-lg border border-line px-2 text-sm"
            >
              <option value="">Choose a service</option>
              {services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="min-h-10 rounded-lg border border-line px-3 text-sm font-medium text-ink"
            onClick={() => {
              if (!serviceId) {
                return;
              }
              void addLabBillLine(token, bill.id, serviceId, 1)
                .then((next) => {
                  setServiceId('');
                  onChanged(next);
                })
                .catch((caught: unknown) => {
                  setError(
                    caught instanceof Error ? caught.message : 'The service could not be added',
                  );
                });
            }}
          >
            Add
          </button>
        </div>
      ) : null}
      {walkIn && balance > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-soft px-3 py-2">
          <p className="text-sm text-ink">Balance {formatRupee(centsToMoney(balance))}</p>
          <button
            type="button"
            className="min-h-11 rounded-lg bg-teal px-4 text-sm font-medium text-white"
            onClick={() => {
              void onCollect().catch((caught: unknown) => {
                setError(
                  caught instanceof Error ? caught.message : 'The balance could not be collected',
                );
              });
            }}
          >
            Collect balance
          </button>
        </div>
      ) : null}
      {open ? (
        <>
          <label className="grid gap-1 text-xs text-ink2">
            Discount
            <input
              value={discount}
              onChange={(event) => setDiscount(event.target.value)}
              className="h-10 w-32 rounded-lg border border-line px-2 text-sm"
            />
          </label>
          <label className="grid gap-1 text-xs text-ink2">
            Discount note
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="min-h-[44px] rounded-lg border border-line px-3 text-sm"
            />
          </label>
        </>
      ) : walkIn ? null : (
        <div className="grid gap-2">
          {bill.adjustments.map((row) => (
            <p key={row.id} className="text-sm text-ink2">
              {row.note} · {row.amount}
            </p>
          ))}
          <label className="grid gap-1 text-xs text-ink2">
            What changed
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className="min-h-[44px] rounded-lg border border-line px-3 text-sm"
            />
          </label>
          <label className="grid gap-1 text-xs text-ink2">
            Amount (use a minus to reduce the bill)
            <input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className="h-10 w-32 rounded-lg border border-line px-2 text-sm"
            />
          </label>
          <button
            type="button"
            className="min-h-[44px] w-fit rounded-lg bg-action px-4 text-sm text-white"
            onClick={() => {
              void adjustLabBill(token, bill.id, note, amount)
                .then((next) => {
                  setNote('');
                  setAmount('');
                  onChanged(next);
                })
                .catch((caught: unknown) => {
                  setError(
                    caught instanceof Error ? caught.message : 'The adjustment could not be saved',
                  );
                });
            }}
          >
            Add adjustment
          </button>
        </div>
      )}
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        {open && lines.length > 0 ? (
          <button
            type="submit"
            className="min-h-[44px] rounded-lg bg-action px-4 text-sm text-white"
          >
            Save
          </button>
        ) : null}
        <button type="button" onClick={onClose} className="min-h-[44px] px-3 text-sm text-ink2">
          Close
        </button>
      </div>
    </form>
  );
}

function isWalkInBill(bill: LabBill): boolean {
  return bill.retailerName === null && bill.clientName === null;
}

function periodRange(kind: 'day' | 'week' | 'month'): { from: string; to: string } {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date());
  if (kind === 'day') {
    return { from: today, to: today };
  }
  const [year = 0, month = 1, day = 1] = today.split('-').map((part) => Number(part));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (kind === 'week') {
    const weekday = date.getUTCDay();
    date.setUTCDate(date.getUTCDate() - (weekday === 0 ? 6 : weekday - 1));
  } else {
    date.setUTCDate(1);
  }
  return { from: date.toISOString().slice(0, 10), to: today };
}
