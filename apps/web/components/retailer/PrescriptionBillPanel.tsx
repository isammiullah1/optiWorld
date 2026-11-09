'use client';

import {
  centsToMoney,
  JOB_STATUS_LABEL,
  labJobNeedsLabDecision,
  moneyToCents,
  prescriptionIssuePaths,
  type ConnectedLab,
  type InventorySearchHit,
  type JobStatus,
  type PosReceipt,
  type PrescriptionReading,
  type ReceiptPrescription,
} from '@optiworld/shared';
import { Check, Plus, Search } from 'lucide-react';
import { useEffect, useState } from 'react';

import { cancellationLine } from '@/components/RecordTrail';

import { formatRupee } from './dashboard-format';
import { emptyItemPrescription, needsPrescription } from './item-prescription';
import { PrescriptionFields } from './PrescriptionFields';
import {
  cancelInvoiceLab,
  cancelPosInvoice,
  finalizeInvoiceLab,
  loadConnectedLabs,
  searchPosInventory,
  sendInvoiceLab,
  unsendInvoiceLab,
  updateInvoicePrescription,
} from './pos-api';

export function PrescriptionBillPanel({
  receipt,
  token,
  canEdit,
  editLab = false,
  onChanged,
  onNotice,
  onError,
}: {
  receipt: PosReceipt;
  token: string;
  canEdit: boolean;
  editLab?: boolean;
  onChanged: () => Promise<void>;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
}): React.ReactElement | null {
  const prescriptionItems = receipt.items.filter((item) => item.prescription);
  const [labs, setLabs] = useState<ConnectedLab[]>([]);
  const [labId, setLabId] = useState('');
  const [drafts, setDrafts] = useState<Record<string, ReceiptPrescription>>({});
  const [busy, setBusy] = useState(false);
  const [cancelBill, setCancelBill] = useState(false);
  const [cancelLab, setCancelLab] = useState(false);
  const [reason, setReason] = useState('');
  const [productQuery, setProductQuery] = useState('');
  const [products, setProducts] = useState<InventorySearchHit[]>([]);
  const [additions, setAdditions] = useState<
    Array<{
      key: string;
      product: InventorySearchHit;
      quantity: number;
      unitPrice: string;
      prescription: PrescriptionReading;
    }>
  >([]);

  useEffect(() => {
    const next: Record<string, ReceiptPrescription> = {};
    for (const item of receipt.items) {
      if (item.prescription) {
        next[item.id] = item.prescription;
      } else if (editLab) {
        next[item.id] = emptyItemPrescription();
      }
    }
    setDrafts(next);
    setAdditions([]);
  }, [editLab, receipt]);

  useEffect(() => {
    if (!token) {
      return;
    }
    void loadConnectedLabs(token)
      .then(setLabs)
      .catch(() => setLabs([]));
  }, [token]);

  useEffect(() => {
    if (!editLab || productQuery.trim().length < 2) {
      setProducts([]);
      return;
    }
    let active = true;
    const handle = window.setTimeout(() => {
      void searchPosInventory(token, productQuery.trim())
        .then((rows) => {
          if (active) {
            setProducts(rows);
          }
        })
        .catch(() => {
          if (active) {
            setProducts([]);
          }
        });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(handle);
    };
  }, [editLab, productQuery, token]);

  if (!editLab && prescriptionItems.length === 0) {
    return null;
  }

  const visibleItems = editLab ? receipt.items : prescriptionItems;

  const activeJobs = receipt.labJobs.filter(
    (job) => job.status !== 'CANCELLED' && job.status !== 'OUTSOURCED',
  );
  const early = (status: JobStatus): boolean =>
    status === 'SUBMITTED' || status === 'CONFIRMED' || status === 'REJECTED';
  const canTakeBack = activeJobs.length > 0 && activeJobs.every((job) => early(job.status));
  const held = activeJobs.filter((job) => labJobNeedsLabDecision(job.status));
  const updateHold =
    held.some((job) => job.status === 'RECEIVED') &&
    held.every((job) => job.status === 'RECEIVED') &&
    activeJobs.every((job) => early(job.status) || job.status === 'RECEIVED');
  const cancelHold =
    held.length > 0 &&
    activeJobs.every((job) => early(job.status) || labJobNeedsLabDecision(job.status));
  const finished = activeJobs.some((job) => job.status === 'DISPATCHED');
  const canEditPrescription =
    canEdit && !receipt.cancelledAt && (activeJobs.length === 0 || canTakeBack || updateHold);
  const labLabel =
    activeJobs.length === 0
      ? 'Not sent to a laboratory'
      : activeJobs
          .map((job) => `${job.referenceNumber} · ${job.labName} · ${jobStatusLabel(job.status)}`)
          .join(', ');

  async function run(action: () => Promise<{ message: string }>): Promise<void> {
    setBusy(true);
    onError('');
    try {
      const result = await action();
      setCancelBill(false);
      setCancelLab(false);
      setReason('');
      onNotice(result.message);
      await onChanged();
    } catch (caught: unknown) {
      onError(caught instanceof Error ? caught.message : 'The bill could not be updated');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="grid min-w-0 items-start gap-3 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="grid min-w-0 gap-3">
        {visibleItems.map((item) => {
          const draft =
            drafts[item.id] ?? item.prescription ?? (editLab ? emptyItemPrescription() : null);
          if (!draft) {
            return null;
          }
          return (
            <div key={item.id} className="min-w-0 rounded-lg border border-line bg-white px-3 py-3">
              <p className="text-sm font-medium text-ink">{item.productName}</p>
              <div
                className={
                  canEditPrescription
                    ? 'mt-2 min-w-0'
                    : 'pointer-events-none mt-2 min-w-0 opacity-80'
                }
              >
                <PrescriptionFields
                  draft={draft}
                  issues={{}}
                  onChange={(next) => setDrafts((current) => ({ ...current, [item.id]: next }))}
                />
              </div>
            </div>
          );
        })}
        {canEditPrescription && !editLab ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              const items = prescriptionItems.flatMap((item) => {
                const prescription = drafts[item.id];
                if (!prescription || prescriptionIssuePaths(prescription).length > 0) {
                  return [];
                }
                return [{ itemId: item.id, prescription }];
              });
              if (items.length !== prescriptionItems.length) {
                onError('Complete the prescription before saving it.');
                return;
              }
              void run(() => updateInvoicePrescription(token, receipt.id, items));
            }}
            className="h-11 rounded-lg bg-action text-sm font-medium text-white disabled:opacity-60"
          >
            {updateHold ? 'Propose prescription' : 'Save prescription'}
          </button>
        ) : null}
        {editLab && canEdit && !receipt.cancelledAt ? (
          <div className="grid gap-3 rounded-xl border border-action bg-action-soft p-4">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-action text-white">
                <Plus size={20} aria-hidden="true" />
              </span>
              <div>
                <h3 className="text-md font-semibold text-ink">Add an item</h3>
                <p className="text-sm text-ink2">
                  Write a missing prescription on the lines above, or add a product here. The total
                  updates when you finalise.
                </p>
              </div>
            </div>
            <label className="grid gap-1 text-xs font-medium text-action">
              <span className="inline-flex items-center gap-1">
                <Search size={14} aria-hidden="true" />
                Find a product
              </span>
              <input
                value={productQuery}
                onChange={(event) => setProductQuery(event.target.value)}
                placeholder="Search by name or code"
                className="min-h-11 rounded-lg border border-action bg-white px-3 text-sm font-normal text-ink outline-none focus:border-action"
              />
            </label>
            <div className="grid gap-1">
              {products.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-action bg-white px-3 text-left text-sm text-ink"
                  onClick={() => {
                    setAdditions((current) => [
                      ...current,
                      {
                        key: `${product.id}-${current.length}`,
                        product,
                        quantity: 1,
                        unitPrice: product.salePrice,
                        prescription: emptyItemPrescription(),
                      },
                    ]);
                    setProductQuery('');
                    setProducts([]);
                  }}
                >
                  <Plus size={16} className="shrink-0 text-action" aria-hidden="true" />
                  <span className="min-w-0 flex-1">{product.productName}</span>
                  <span className="shrink-0 font-medium text-action">
                    {formatRupee(product.salePrice)}
                  </span>
                </button>
              ))}
            </div>
            {additions.map((line) => (
              <div key={line.key} className="grid gap-2 rounded-lg border border-line px-3 py-3">
                <p className="text-sm font-medium text-ink">{line.product.productName}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="grid gap-1 text-xs text-ink2">
                    Quantity
                    <input
                      inputMode="numeric"
                      value={String(line.quantity)}
                      onChange={(event) => {
                        const quantity = Number(event.target.value);
                        setAdditions((current) =>
                          current.map((entry) =>
                            entry.key === line.key
                              ? {
                                  ...entry,
                                  quantity:
                                    Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
                                }
                              : entry,
                          ),
                        );
                      }}
                      className="min-h-11 rounded-lg border border-line px-3 text-sm text-ink outline-none focus:border-action"
                    />
                  </label>
                  <label className="grid gap-1 text-xs text-ink2">
                    Rate
                    <input
                      inputMode="decimal"
                      value={line.unitPrice}
                      onChange={(event) => {
                        const unitPrice = event.target.value;
                        setAdditions((current) =>
                          current.map((entry) =>
                            entry.key === line.key ? { ...entry, unitPrice } : entry,
                          ),
                        );
                      }}
                      className="min-h-11 rounded-lg border border-line px-3 text-sm text-ink outline-none focus:border-action"
                    />
                  </label>
                </div>
                {needsPrescription(
                  line.product.category,
                  line.product.productName,
                  line.product.prescriptionRequired,
                ) ? (
                  <PrescriptionFields
                    draft={line.prescription}
                    issues={{}}
                    onChange={(next) =>
                      setAdditions((current) =>
                        current.map((entry) =>
                          entry.key === line.key ? { ...entry, prescription: next } : entry,
                        ),
                      )
                    }
                  />
                ) : null}
              </div>
            ))}
            <p className="inline-flex w-fit items-center gap-2 rounded-full bg-white px-3 py-1 text-sm font-semibold text-action">
              Total{' '}
              {formatRupee(
                centsToMoney(
                  moneyToCents(receipt.total) +
                    additions.reduce(
                      (sum, line) =>
                        sum +
                        (/^\d{1,10}(\.\d{1,2})?$/.test(line.unitPrice)
                          ? moneyToCents(line.unitPrice) * line.quantity
                          : 0),
                      0,
                    ),
                ),
              )}
            </p>
            <button
              type="button"
              disabled={busy || updateHold || cancelHold}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-action px-4 text-sm font-medium text-white disabled:opacity-60"
              onClick={() => {
                let invalid = false;
                const prescriptions = visibleItems.flatMap((item) => {
                  const prescription = drafts[item.id];
                  if (!prescription) {
                    return [];
                  }
                  const filled = [
                    prescription.right.sphere,
                    prescription.right.cylinder,
                    prescription.left.sphere,
                    prescription.left.cylinder,
                    prescription.add,
                    prescription.pd,
                  ].some((part) => part.trim().length > 0);
                  if (!filled) {
                    return [];
                  }
                  if (prescriptionIssuePaths(prescription).length > 0) {
                    invalid = true;
                    return [];
                  }
                  return [{ itemId: item.id, prescription }];
                });
                if (invalid) {
                  onError('Complete the prescription before finalising the sale.');
                  return;
                }
                const priced = additions.every((line) =>
                  /^\d{1,10}(\.\d{1,2})?$/.test(line.unitPrice),
                );
                if (!priced) {
                  onError('Enter a rate for each new item.');
                  return;
                }
                for (const line of additions) {
                  if (
                    !needsPrescription(
                      line.product.category,
                      line.product.productName,
                      line.product.prescriptionRequired,
                    )
                  ) {
                    continue;
                  }
                  if (prescriptionIssuePaths(line.prescription).length > 0) {
                    onError('Add the prescription on the new item before finalising the sale.');
                    return;
                  }
                }
                if (prescriptions.length === 0 && additions.length === 0) {
                  onError('Add a prescription or an item before finalising the sale.');
                  return;
                }
                void run(() =>
                  finalizeInvoiceLab(token, receipt.id, {
                    prescriptions,
                    additions: additions.map((line) => ({
                      inventoryBatchId: line.product.id,
                      quantity: line.quantity,
                      unitPrice: line.unitPrice,
                      ...(needsPrescription(
                        line.product.category,
                        line.product.productName,
                        line.product.prescriptionRequired,
                      )
                        ? { prescription: line.prescription }
                        : {}),
                    })),
                  }),
                );
              }}
            >
              <Check size={16} aria-hidden="true" />
              {busy ? 'Saving…' : 'Finalise sale'}
            </button>
          </div>
        ) : null}
      </div>
      <div className="grid min-w-0 content-start gap-3">
        <div className="rounded-lg border border-line bg-white px-3 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-ink3">Laboratory</p>
          <p className="mt-1 text-sm text-ink">
            {receipt.cancelledAt
              ? cancellationLine(receipt.activity, receipt.cancelledAt)
              : labLabel}
          </p>
          {canEdit && !receipt.cancelledAt && activeJobs.length === 0 ? (
            <label className="mt-2 grid gap-1 text-xs text-ink2">
              Send to laboratory
              <select
                aria-label="Laboratory"
                value={labId}
                onChange={(event) => setLabId(event.target.value)}
                className="h-11 rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none focus:border-action"
              >
                <option value="">Choose a laboratory</option>
                {labs.map((lab) => (
                  <option key={lab.id} value={lab.id}>
                    {lab.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={busy || !labId}
                onClick={() => {
                  void run(() => sendInvoiceLab(token, receipt.id, labId));
                }}
                className="mt-1 h-11 rounded-lg bg-action text-sm font-medium text-white disabled:opacity-60"
              >
                Send to lab
              </button>
            </label>
          ) : null}
          {canEdit && !receipt.cancelledAt && activeJobs.length > 0 ? (
            <div className="mt-2 grid gap-2">
              {cancelHold ? (
                <p className="text-sm text-ink">
                  {updateHold
                    ? 'This job is received. A change or a cancellation waits for the laboratory. They can accept it or reject it.'
                    : 'Only a cancellation can be requested, and the laboratory accepts or rejects it.'}
                </p>
              ) : null}
              {canTakeBack ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    void run(() => unsendInvoiceLab(token, receipt.id));
                  }}
                  className="h-11 rounded-lg border border-line bg-white text-sm font-medium text-ink2 disabled:opacity-60"
                >
                  Unsend
                </button>
              ) : finished ? (
                <p className="text-xs text-ink3">
                  The laboratory has finished this job, so it cannot be cancelled.
                </p>
              ) : (
                <>
                  {cancelHold ? null : (
                    <p className="text-xs text-ink3">
                      The laboratory has started this job, so it can be cancelled and cannot be
                      unsent.
                    </p>
                  )}
                  {cancelLab ? (
                    <ReasonBox
                      label="Why is this laboratory job being cancelled?"
                      reason={reason}
                      busy={busy}
                      confirmLabel={cancelHold ? 'Send request' : 'Cancel lab job'}
                      onChange={setReason}
                      onClose={() => setCancelLab(false)}
                      onConfirm={() => {
                        void run(() => cancelInvoiceLab(token, receipt.id, reason));
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setCancelLab(true)}
                      className="h-11 rounded-lg border border-danger bg-white text-sm font-medium text-danger disabled:opacity-60"
                    >
                      {cancelHold ? 'Request cancellation' : 'Cancel lab job'}
                    </button>
                  )}
                </>
              )}
            </div>
          ) : null}
        </div>
        {canEdit && !receipt.cancelledAt ? (
          cancelBill ? (
            <ReasonBox
              label="Why is this bill being cancelled?"
              reason={reason}
              busy={busy}
              confirmLabel="Cancel bill"
              onChange={setReason}
              onClose={() => setCancelBill(false)}
              onConfirm={() => {
                void run(() => cancelPosInvoice(token, receipt.id, reason));
              }}
            />
          ) : (
            <>
              {cancelHold ? (
                <p className="text-xs text-ink3">
                  The bill stays until the laboratory accepts or rejects the cancellation.
                </p>
              ) : null}
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setCancelLab(false);
                  setReason('');
                  setCancelBill(true);
                }}
                className="h-11 rounded-lg bg-danger text-sm font-medium text-white disabled:opacity-60"
              >
                Cancel bill
              </button>
            </>
          )
        ) : null}
      </div>
    </section>
  );
}

function jobStatusLabel(status: JobStatus): string {
  return JOB_STATUS_LABEL[status];
}

function ReasonBox({
  label,
  reason,
  busy,
  confirmLabel,
  onChange,
  onClose,
  onConfirm,
}: {
  label: string;
  reason: string;
  busy: boolean;
  confirmLabel: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}): React.ReactElement {
  return (
    <div className="grid gap-2 rounded-lg bg-danger-soft p-3">
      <label className="grid gap-1 text-xs text-ink2">
        {label}
        <textarea
          aria-label={label}
          value={reason}
          onChange={(event) => onChange(event.target.value)}
          rows={3}
          maxLength={500}
          className="rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-action"
        />
      </label>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onClose}
          className="h-11 flex-1 rounded-lg border border-line bg-white text-sm text-ink2"
        >
          Keep
        </button>
        <button
          type="button"
          disabled={busy || reason.trim().length === 0}
          onClick={onConfirm}
          className="h-11 flex-1 rounded-lg bg-danger text-sm font-medium text-white disabled:opacity-60"
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}
