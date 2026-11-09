'use client';

import {
  prescriptionIssues,
  type ConnectedLab,
  type ItemPrescription,
  type PrescriptionIssueKey,
  type SavedPrescription,
} from '@optiworld/shared';
import { useEffect, useRef, useState } from 'react';

import { formatShortDate } from './dashboard-format';
import { emptyItemPrescription, prescriptionLabel } from './item-prescription';
import { PrescriptionFields } from './PrescriptionFields';

export type BillLinePrescription = {
  lineId: string;
  productName: string;
  savedId?: string;
  labOrgId: string;
  prescription: ItemPrescription;
};

export function LinePrescriptionDialog({
  productName,
  customerName,
  saved,
  billLines = [],
  labs,
  initialLabId,
  initialPrescription = null,
  onClose,
  onSkip,
  onUse,
  onSaveNew,
  onUpdate,
}: {
  productName: string;
  customerName: string | null;
  saved: readonly SavedPrescription[];
  billLines?: readonly BillLinePrescription[];
  labs: readonly ConnectedLab[];
  initialLabId: string;
  initialPrescription?: ItemPrescription | null;
  onClose: () => void;
  onSkip: () => void;
  onUse: (prescription: SavedPrescription, labOrgId: string) => void;
  onSaveNew: (prescription: ItemPrescription, labOrgId: string) => void;
  onUpdate: (
    record: SavedPrescription,
    prescription: ItemPrescription,
    labOrgId: string,
  ) => Promise<void>;
}): React.ReactElement {
  const [draft, setDraft] = useState<ItemPrescription>(() =>
    initialPrescription
      ? {
          right: { ...initialPrescription.right },
          left: { ...initialPrescription.left },
          add: initialPrescription.add,
          pd: initialPrescription.pd,
          notes: initialPrescription.notes,
        }
      : emptyItemPrescription(),
  );
  const [loaded, setLoaded] = useState<SavedPrescription | null>(null);
  const [editing, setEditing] = useState<SavedPrescription | null>(null);
  const [labId, setLabId] = useState(initialLabId);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [issues, setIssues] = useState<Partial<Record<PrescriptionIssueKey, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const hasVision =
    draft.right.sphere !== '' ||
    draft.right.cylinder !== '' ||
    draft.left.sphere !== '' ||
    draft.left.cylinder !== '' ||
    draft.add !== '' ||
    draft.pd !== '';
  const visionSummary = hasVision ? prescriptionLabel(draft) : null;

  useEffect(() => {
    formRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selectedKey]);

  function fillFrom(record: SavedPrescription, labOrgId?: string): void {
    setLoaded(record);
    setEditing(record.source === 'SAVED' ? record : null);
    setFormError(null);
    setIssues({});
    setSelectedKey(`${record.source}-${record.id}`);
    if (labOrgId) {
      setLabId(labOrgId);
    }
    setDraft({
      right: { ...record.right },
      left: { ...record.left },
      add: record.add,
      pd: record.pd,
      notes: record.notes,
    });
  }

  function fillFromBill(entry: BillLinePrescription): void {
    const savedMatch = entry.savedId
      ? saved.find((record) => record.source === 'SAVED' && record.id === entry.savedId)
      : undefined;
    if (savedMatch) {
      fillFrom(savedMatch, entry.labOrgId);
      setSelectedKey(`BILL-${entry.lineId}`);
      return;
    }
    setLoaded(null);
    setEditing(null);
    setFormError(null);
    setIssues({});
    setSelectedKey(`BILL-${entry.lineId}`);
    if (entry.labOrgId) {
      setLabId(entry.labOrgId);
    }
    setDraft({
      right: { ...entry.prescription.right },
      left: { ...entry.prescription.left },
      add: entry.prescription.add,
      pd: entry.prescription.pd,
      notes: entry.prescription.notes,
    });
  }

  function savePrescription(): void {
    const nextIssues = prescriptionIssues(draft);
    setIssues(nextIssues);
    if (Object.keys(nextIssues).length > 0) {
      return;
    }
    if (editing && !sameReading(editing, draft)) {
      setFormError(null);
      void onUpdate(editing, draft, labId).catch((reason: unknown) => {
        setFormError(
          reason instanceof Error ? reason.message : 'The prescription could not be updated.',
        );
      });
      return;
    }
    if (loaded && sameReading(loaded, draft)) {
      onUse(loaded, labId);
      return;
    }
    onSaveNew(draft, labId);
  }

  return (
    <div
      ref={formRef}
      className="grid max-h-[70vh] grid-rows-[auto_minmax(0,1fr)_auto] gap-3 overflow-hidden rounded-xl border border-line bg-canvas p-3"
    >
      <div className="flex items-center gap-2">
        <label className="grid min-w-0 flex-1 gap-1 text-xs text-ink2">
          Earlier Prescriptions
          <select
            aria-label={
              customerName
                ? `Earlier Prescriptions for ${customerName}`
                : `Earlier Prescriptions for ${productName}`
            }
            value={selectedKey ?? ''}
            onChange={(event) => {
              const onBill = billLines.find(
                (entry) => `BILL-${entry.lineId}` === event.target.value,
              );
              if (onBill) {
                fillFromBill(onBill);
                return;
              }
              const record = saved.find(
                (entry) => `${entry.source}-${entry.id}` === event.target.value,
              );
              if (record) {
                fillFrom(record);
                return;
              }
              setSelectedKey(null);
              setLoaded(null);
              setEditing(null);
              setDraft(emptyItemPrescription());
              setIssues({});
            }}
            className="min-h-11 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none focus:border-action"
          >
            <option value="">{visionSummary ?? 'Earlier Prescriptions'}</option>
            {billLines.map((entry) => (
              <option key={`BILL-${entry.lineId}`} value={`BILL-${entry.lineId}`}>
                {entry.productName} · {prescriptionLabel(entry.prescription) ?? 'Prescription'} ·
                This bill
              </option>
            ))}
            {saved.map((record) => (
              <option key={`${record.source}-${record.id}`} value={`${record.source}-${record.id}`}>
                {record.summary} · {record.source === 'LAB_JOB' ? 'Lab job' : 'Saved'} ·{' '}
                {formatShortDate(record.createdAt)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 min-h-11 shrink-0 px-2 text-xs font-medium text-action"
        >
          Close
        </button>
      </div>
      <div className="grid min-h-0 content-start gap-3 overflow-y-auto">
        <PrescriptionFields
          draft={draft}
          issues={issues}
          onChange={(next) => {
            setDraft(next);
            setIssues({});
          }}
        />
        <LabChoice labs={labs} labId={labId} onLab={setLabId} />
        {formError ? (
          <p role="alert" className="text-sm text-danger">
            {formError}
          </p>
        ) : null}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={savePrescription}
          className="min-h-11 flex-1 rounded-lg bg-action text-sm font-medium text-white"
        >
          Save prescription
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="min-h-11 flex-1 rounded-lg border border-line bg-white text-sm text-ink2"
        >
          No prescription for this item
        </button>
      </div>
    </div>
  );
}

function sameReading(record: SavedPrescription, value: ItemPrescription): boolean {
  return (
    record.right.sphere === value.right.sphere &&
    record.right.cylinder === value.right.cylinder &&
    record.right.axis === value.right.axis &&
    record.left.sphere === value.left.sphere &&
    record.left.cylinder === value.left.cylinder &&
    record.left.axis === value.left.axis &&
    record.add === value.add &&
    record.pd === value.pd &&
    record.notes === value.notes
  );
}

function LabChoice({
  labs,
  labId,
  onLab,
}: {
  labs: readonly ConnectedLab[];
  labId: string;
  onLab: (labOrgId: string) => void;
}): React.ReactElement {
  return (
    <label className="grid gap-1 text-xs text-ink3">
      Send this prescription to a lab
      <select
        aria-label="Send this prescription to a lab"
        value={labId}
        onChange={(event) => onLab(event.target.value)}
        className="rounded-lg border border-line bg-white px-2 py-2 text-sm text-ink outline-none focus:border-action"
      >
        <option value="">Do not send to a lab</option>
        {labs.map((lab) => (
          <option key={lab.id} value={lab.id}>
            {lab.name}
          </option>
        ))}
      </select>
      <span>Optional. Leave this blank if the lens stays in the shop.</span>
    </label>
  );
}
