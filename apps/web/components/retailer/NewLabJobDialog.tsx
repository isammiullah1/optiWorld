'use client';

import {
  isShopPhone,
  prescriptionIssues,
  shopPhoneMessage,
  type LabConnection,
  type LabSaleOption,
  type PrescriptionIssueKey,
  type PrescriptionReading,
} from '@optiworld/shared';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { CustomerPhoneField } from './CustomerPhoneField';
import { formatShortDate } from './dashboard-format';
import { emptyItemPrescription } from './item-prescription';
import { createDirectLabJob, searchLabSales } from './lab-api';
import { PrescriptionFields } from './PrescriptionFields';

const fieldClass =
  'min-h-11 rounded-lg border px-3 text-sm text-ink outline-none focus:border-action';

type MissingField = 'patient' | 'lab' | 'lensName' | 'lensType';

export function NewLabJobDialog({
  token,
  labs,
  onClose,
  onCreated,
}: {
  token: string;
  labs: readonly LabConnection[];
  onClose: () => void;
  onCreated: (message: string) => void;
}): React.ReactElement {
  const router = useRouter();
  const [patientName, setPatientName] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [labOrgId, setLabOrgId] = useState(labs[0]?.id ?? '');
  const [lensName, setLensName] = useState('');
  const [lensType, setLensType] = useState('');
  const [frameName, setFrameName] = useState('');
  const [frameType, setFrameType] = useState('');
  const [instructions, setInstructions] = useState('');
  const [prescription, setPrescription] = useState<PrescriptionReading>(() =>
    emptyItemPrescription(),
  );
  const [issues, setIssues] = useState<Partial<Record<PrescriptionIssueKey, string>>>({});
  const [billMode, setBillMode] = useState<'NONE' | 'EXISTING'>('NONE');
  const [saleQuery, setSaleQuery] = useState('');
  const [sales, setSales] = useState<LabSaleOption[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [missing, setMissing] = useState<Partial<Record<MissingField, string>>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (billMode !== 'EXISTING') {
      return;
    }
    let active = true;
    const handle = window.setTimeout(() => {
      void searchLabSales(token, saleQuery)
        .then((rows) => {
          if (active) {
            setSales(rows);
          }
        })
        .catch(() => {
          if (active) {
            setSales([]);
          }
        });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(handle);
    };
  }, [billMode, saleQuery, token]);

  function submit(): void {
    const nextIssues = prescriptionIssues(prescription);
    setIssues(nextIssues);
    if (billMode !== 'NONE') {
      return;
    }
    const trimmedPhone = phone.trim();
    if (trimmedPhone.length > 0 && !isShopPhone(trimmedPhone)) {
      setPhoneError(shopPhoneMessage(trimmedPhone));
      return;
    }
    setPhoneError(null);
    const nextMissing: Partial<Record<MissingField, string>> = {};
    if (!patientName.trim()) {
      nextMissing.patient = 'Enter the patient name.';
    }
    if (!labOrgId) {
      nextMissing.lab = 'Choose a laboratory.';
    }
    if (!lensName.trim()) {
      nextMissing.lensName = 'Enter the lens name.';
    }
    if (!lensType.trim()) {
      nextMissing.lensType = 'Enter the lens type.';
    }
    setMissing(nextMissing);
    if (Object.keys(nextMissing).length > 0 || Object.keys(nextIssues).length > 0) {
      setFormError(null);
      return;
    }
    setBusy(true);
    setFormError(null);
    void createDirectLabJob(token, {
      patientName: patientName.trim(),
      patientPhone: trimmedPhone,
      labOrgId,
      right: prescription.right,
      left: prescription.left,
      add: prescription.add,
      pd: prescription.pd,
      notes: prescription.notes,
      lensName: lensName.trim(),
      lensType: lensType.trim(),
      frameName: frameName.trim(),
      frameType: frameType.trim(),
      specialInstructions: instructions.trim(),
      bill: { mode: 'NONE' },
    })
      .then((result) => onCreated(result.message))
      .catch((caught: unknown) => {
        setFormError(caught instanceof Error ? caught.message : 'The lab job could not be created');
        setBusy(false);
      });
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-3"
      role="dialog"
      aria-labelledby="new-lab-job-title"
    >
      <form
        noValidate
        className="grid max-h-full w-full max-w-3xl gap-3 overflow-y-auto rounded-xl border border-line bg-white p-4"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="new-lab-job-title" className="text-lg font-semibold text-ink">
              New lab job
            </h2>
            <p className="text-sm text-ink2">
              Start a new bill, or open a sale that is already on the books.
            </p>
          </div>
          <button
            type="button"
            className="min-h-11 rounded-lg border border-line px-3 text-sm text-ink2"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <fieldset className="grid gap-2">
          <legend className="text-sm font-medium text-ink">Sale</legend>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ['NONE', 'New bill'],
                ['EXISTING', 'Use an existing sale'],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                aria-pressed={billMode === mode}
                onClick={() => setBillMode(mode)}
                className={`min-h-11 rounded-full border px-3 text-xs ${billMode === mode ? 'border-action bg-action-soft text-action' : 'border-line bg-white text-ink2'}`}
              >
                {label}
              </button>
            ))}
          </div>
          {billMode === 'EXISTING' ? (
            <div className="grid gap-2">
              <p className="text-sm text-ink2">
                Choose a sale to open it. You can assign a laboratory, fill a missing prescription,
                add an item, and finalise the amount there.
              </p>
              <label className="grid gap-1 text-xs text-ink2">
                Find a sale
                <input
                  value={saleQuery}
                  onChange={(event) => setSaleQuery(event.target.value)}
                  placeholder="Customer name or sale number"
                  className={fieldClass}
                />
              </label>
              <div className="grid gap-1">
                {sales.length === 0 ? (
                  <p className="text-sm text-ink3">No matching sales.</p>
                ) : null}
                {sales.map((sale) => (
                  <button
                    key={sale.id}
                    type="button"
                    onClick={() => {
                      router.push(`/retailer/billing/${sale.id}?edit=lab`);
                      onClose();
                    }}
                    className="min-h-11 rounded-lg border border-line px-3 text-left text-sm text-ink"
                  >
                    Sale #{sale.invoiceNumber} · {sale.customerName} ·{' '}
                    {formatShortDate(sale.issuedAt)}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </fieldset>
        {billMode === 'NONE' && labs.length === 0 ? (
          <p className="text-sm text-ink2">Connect a laboratory before sending a job.</p>
        ) : null}
        {billMode === 'NONE' ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-xs text-ink2">
                <span>
                  Patient <span className="text-danger">*</span>
                </span>
                <input
                  value={patientName}
                  aria-invalid={missing.patient ? true : undefined}
                  onChange={(event) => {
                    const value = event.target.value;
                    setPatientName(value);
                    if (value.trim()) {
                      setMissing((current) => ({ ...current, patient: undefined }));
                    }
                  }}
                  className={`${fieldClass} ${missing.patient ? 'border-danger' : 'border-line'}`}
                />
                {missing.patient ? (
                  <span className="text-xs text-danger" role="alert">
                    {missing.patient}
                  </span>
                ) : null}
              </label>
              <label className="grid gap-1 text-xs text-ink2">
                <span>
                  Laboratory <span className="text-danger">*</span>
                </span>
                <select
                  value={labOrgId}
                  aria-invalid={missing.lab ? true : undefined}
                  onChange={(event) => {
                    const value = event.target.value;
                    setLabOrgId(value);
                    if (value) {
                      setMissing((current) => ({ ...current, lab: undefined }));
                    }
                  }}
                  className={`${fieldClass} bg-white ${missing.lab ? 'border-danger' : 'border-line'}`}
                >
                  {labs.length === 0 ? <option value="">No laboratory connected</option> : null}
                  {labs.map((lab) => (
                    <option key={lab.id} value={lab.id}>
                      {lab.name}
                    </option>
                  ))}
                </select>
                {missing.lab ? (
                  <span className="text-xs text-danger" role="alert">
                    {missing.lab}
                  </span>
                ) : null}
              </label>
            </div>
            <CustomerPhoneField
              value={phone}
              error={phoneError ?? undefined}
              onChange={setPhone}
              label="Phone"
              inputLabel="Patient phone"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-xs text-ink2">
                <span>
                  Lens name <span className="text-danger">*</span>
                </span>
                <input
                  value={lensName}
                  aria-invalid={missing.lensName ? true : undefined}
                  onChange={(event) => {
                    const value = event.target.value;
                    setLensName(value);
                    if (value.trim()) {
                      setMissing((current) => ({ ...current, lensName: undefined }));
                    }
                  }}
                  className={`${fieldClass} ${missing.lensName ? 'border-danger' : 'border-line'}`}
                />
                {missing.lensName ? (
                  <span className="text-xs text-danger" role="alert">
                    {missing.lensName}
                  </span>
                ) : null}
              </label>
              <label className="grid gap-1 text-xs text-ink2">
                <span>
                  Lens type <span className="text-danger">*</span>
                </span>
                <input
                  value={lensType}
                  aria-invalid={missing.lensType ? true : undefined}
                  placeholder="Single vision, bifocal, progressive"
                  onChange={(event) => {
                    const value = event.target.value;
                    setLensType(value);
                    if (value.trim()) {
                      setMissing((current) => ({ ...current, lensType: undefined }));
                    }
                  }}
                  className={`${fieldClass} ${missing.lensType ? 'border-danger' : 'border-line'}`}
                />
                {missing.lensType ? (
                  <span className="text-xs text-danger" role="alert">
                    {missing.lensType}
                  </span>
                ) : null}
              </label>
              <label className="grid gap-1 text-xs text-ink2">
                Frame name
                <input
                  value={frameName}
                  onChange={(event) => setFrameName(event.target.value)}
                  className={`${fieldClass} border-line`}
                />
              </label>
              <label className="grid gap-1 text-xs text-ink2">
                Frame type
                <input
                  value={frameType}
                  onChange={(event) => setFrameType(event.target.value)}
                  className={`${fieldClass} border-line`}
                />
              </label>
            </div>
            <PrescriptionFields draft={prescription} issues={issues} onChange={setPrescription} />
            <label className="grid gap-1 text-xs text-ink2">
              Instructions
              <textarea
                value={instructions}
                onChange={(event) => setInstructions(event.target.value)}
                rows={2}
                maxLength={500}
                className="rounded-lg border border-line px-3 py-2 text-sm text-ink outline-none focus:border-action"
              />
            </label>
          </>
        ) : null}
        {formError ? (
          <p role="alert" className="text-sm text-danger">
            {formError}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="min-h-11 rounded-lg border border-line px-4 text-sm text-ink2"
            onClick={onClose}
          >
            Cancel
          </button>
          {billMode === 'NONE' ? (
            <button
              type="submit"
              disabled={busy || labs.length === 0}
              className="min-h-11 rounded-lg bg-action px-4 text-sm font-medium text-white disabled:opacity-60"
            >
              {busy ? 'Sending…' : 'Send lab job'}
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
