'use client';

import type { LabPrescription } from '@optiworld/shared';

const EMPTY_EYE = { sphere: '', cylinder: '', axis: '' };

export function PrescriptionModal({
  open,
  labs,
  draft,
  onChange,
  onClose,
  onAttach,
}: {
  open: boolean;
  labs: readonly { id: string; name: string }[];
  draft: LabPrescription;
  onChange: (next: LabPrescription) => void;
  onClose: () => void;
  onAttach: () => void;
}): React.ReactElement | null {
  if (!open) {
    return null;
  }
  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 sm:items-center"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="rx-title"
        className="grid max-h-[85vh] w-full max-w-lg gap-3 overflow-y-auto rounded-t-xl border border-line bg-white p-4 sm:rounded-xl"
      >
        <h2 id="rx-title" className="text-md font-semibold text-ink">
          Lab prescription
        </h2>
        <label className="grid gap-1 text-sm text-ink2">
          Laboratory
          <select
            value={draft.labOrgId}
            onChange={(event) => onChange({ ...draft, labOrgId: event.target.value })}
            className="rounded-lg border border-line px-3 py-2 text-base text-ink"
          >
            <option value="">Select a laboratory</option>
            {labs.map((lab) => (
              <option key={lab.id} value={lab.id}>
                {lab.name}
              </option>
            ))}
          </select>
        </label>
        <p className="text-sm text-ink2">Reference {draft.referenceNumber}</p>
        <EyeFields
          label="Right"
          value={draft.right}
          onChange={(right) => onChange({ ...draft, right })}
        />
        <EyeFields
          label="Left"
          value={draft.left}
          onChange={(left) => onChange({ ...draft, left })}
        />
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="Add"
            value={draft.add}
            onChange={(add) => onChange({ ...draft, add })}
          />
          <TextField label="PD" value={draft.pd} onChange={(pd) => onChange({ ...draft, pd })} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <TextField
            label="Frame type"
            value={draft.frameType ?? ''}
            onChange={(frameType) => onChange({ ...draft, frameType })}
          />
          <TextField
            label="Material"
            value={draft.frameMaterial ?? ''}
            onChange={(frameMaterial) => onChange({ ...draft, frameMaterial })}
          />
          <TextField
            label="Eye size"
            value={draft.eyeSize ?? ''}
            onChange={(eyeSize) => onChange({ ...draft, eyeSize })}
          />
        </div>
        <TextField
          label="Instructions"
          value={draft.specialInstructions ?? ''}
          onChange={(specialInstructions) => onChange({ ...draft, specialInstructions })}
        />
        <TextField
          label="Notes"
          value={draft.notes}
          onChange={(notes) => onChange({ ...draft, notes })}
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] flex-1 rounded-lg border border-line text-sm text-ink2"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onAttach}
            disabled={!draft.labOrgId}
            className="min-h-[44px] flex-1 rounded-lg bg-action text-sm font-medium text-white disabled:opacity-50"
          >
            Attach to invoice
          </button>
        </div>
      </div>
    </div>
  );
}

function EyeFields({
  label,
  value,
  onChange,
}: {
  label: string;
  value: typeof EMPTY_EYE;
  onChange: (value: typeof EMPTY_EYE) => void;
}): React.ReactElement {
  return (
    <fieldset className="grid grid-cols-3 gap-2">
      <legend className="col-span-3 text-sm text-ink2">{label}</legend>
      <TextField
        label="Sphere"
        value={value.sphere}
        onChange={(sphere) => onChange({ ...value, sphere })}
      />
      <TextField
        label="Cyl"
        value={value.cylinder}
        onChange={(cylinder) => onChange({ ...value, cylinder })}
      />
      <TextField
        label="Axis"
        value={value.axis}
        onChange={(axis) => onChange({ ...value, axis })}
      />
    </fieldset>
  );
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}): React.ReactElement {
  return (
    <label className="grid gap-1 text-xs text-ink3">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-lg border border-line px-2 py-2 text-sm text-ink outline-none focus:border-action"
      />
    </label>
  );
}
