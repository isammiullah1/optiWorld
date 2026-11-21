'use client';

import { productTagLabel } from '@optiworld/shared';
import type { LabBoardJob } from '@optiworld/shared';
import { useEffect } from 'react';

import { useCloseOnEscape } from './use-close-on-escape';

export interface ProcessingSlipData {
  referenceNumber: string;
  patientName: string | null;
  services: string[];
  prescription: LabBoardJob['prescription'];
  notes: string | null;
}

export function ProcessingSlip({
  slip,
  onClose,
}: {
  slip: ProcessingSlipData;
  onClose: () => void;
}): React.ReactElement {
  useCloseOnEscape(onClose);
  useEffect(() => {
    const timer = window.setTimeout(() => window.print(), 250);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-3 sm:items-center">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="processing-slip-title"
        className="ow-print-root ow-print-slip grid w-full max-w-[80mm] overflow-hidden rounded-xl border-2 border-navy bg-white text-ink"
      >
        <header className="bg-navy px-3 py-3 text-white">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/80">
            Processing slip
          </p>
          <h2 id="processing-slip-title" className="mt-1 font-mono text-xl font-semibold">
            {productTagLabel(slip.referenceNumber)}
          </h2>
          <p className="mt-1 text-base text-white">{slip.patientName ?? 'No patient name'}</p>
        </header>
        <div className="grid gap-2 bg-[var(--ow-navy-soft)] p-2">
          <section className="rounded-lg border-2 border-navy bg-white px-3 py-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-navy">Services</h3>
            {slip.services.length === 0 ? (
              <p className="mt-1 text-base text-ink2">No services listed.</p>
            ) : (
              <ul className="mt-1 grid gap-1">
                {slip.services.map((service) => (
                  <li
                    key={service}
                    className="rounded-md border border-line bg-canvas px-2 py-1 text-base text-ink"
                  >
                    {service}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="rounded-lg border-2 border-action bg-white px-3 py-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-action">
              Prescription
            </h3>
            <dl className="mt-1 grid gap-1 text-base">
              <Eye label="Right" eye={slip.prescription.right} />
              <Eye label="Left" eye={slip.prescription.left} />
              <div className="flex justify-between gap-3 border-t border-line pt-1">
                <dt className="text-ink2">Add</dt>
                <dd className="font-medium">{slip.prescription.add?.trim() || '—'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink2">PD</dt>
                <dd className="font-medium">{slip.prescription.pd?.trim() || '—'}</dd>
              </div>
            </dl>
          </section>
          <section className="rounded-lg border-2 border-amber bg-amber-soft px-3 py-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-amber">Notes</h3>
            <p className="mt-1 whitespace-pre-wrap text-base text-ink">
              {slip.notes?.trim() ? slip.notes : 'No notes.'}
            </p>
          </section>
        </div>
        <div className="flex gap-2 border-t-2 border-navy bg-white p-2 print:hidden">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 flex-1 items-center justify-center rounded-lg border-2 border-navy bg-white text-base font-semibold text-navy"
          >
            Close
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex h-11 flex-1 items-center justify-center rounded-lg border-2 border-navy bg-navy text-base font-semibold text-white"
          >
            Print
          </button>
        </div>
      </section>
    </div>
  );
}

function Eye({
  label,
  eye,
}: {
  label: string;
  eye: LabBoardJob['prescription']['right'];
}): React.ReactElement {
  const text = [eye.sphere, eye.cylinder, eye.axis]
    .filter((part) => part && part.trim())
    .join(' / ');
  return (
    <div className="flex justify-between gap-3 rounded-md bg-action-soft px-2 py-1">
      <dt className="font-medium text-action">{label}</dt>
      <dd className="text-ink">{text || '—'}</dd>
    </div>
  );
}
