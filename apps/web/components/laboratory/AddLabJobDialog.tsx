'use client';

import {
  CreateLabBoardJobSchema,
  isShopPhone,
  prescriptionIssues,
  productTagLabel,
  shopPhoneMessage,
  type LabClientRow,
  type LabInventoryItem,
  type PrescriptionIssueKey,
  type PrescriptionReading,
} from '@optiworld/shared';
import { useEffect, useRef, useState } from 'react';

import { CustomerPhoneField } from '@/components/retailer/CustomerPhoneField';
import { emptyItemPrescription } from '@/components/retailer/item-prescription';
import { PrescriptionFields } from '@/components/retailer/PrescriptionFields';

import { createLabBoardJob, loadLabInventory, reserveLabReference } from './lab-api';

const RECEIVED_SAMPLE = 'Received Sample';
const LENS_NAMES = ['Blue Cut', 'CR-39', 'Photochromic', 'Progressive HD'] as const;
const LENS_TYPES = ['Single vision', 'Bifocal', 'Progressive', 'Office'] as const;
const FRAME_NAMES = ['Acetate', 'Metal', 'Combination'] as const;
const FRAME_TYPES = ['Full rim', 'Half rim', 'Rimless', 'Nylon'] as const;

const fieldClass =
  'min-h-11 rounded-lg border border-line px-3 text-sm text-ink outline-none focus:border-action';

type RequiredField = 'name' | 'lensName' | 'lensType' | 'frameName' | 'frameType';

const REQUIRED_COPY: Record<RequiredField, string> = {
  name: 'Enter the customer name.',
  lensName: 'Enter the lens name.',
  lensType: 'Enter the lens type.',
  frameName: 'Enter the frame name.',
  frameType: 'Enter the frame type.',
};

export function AddLabJobDialog({
  token,
  clients,
  initialClientId,
  onClose,
  onCreated,
}: {
  token: string;
  clients: readonly LabClientRow[];
  initialClientId: string;
  onClose: () => void;
  onCreated: (referenceNumber: string) => void;
}): React.ReactElement {
  const [serial, setSerial] = useState<string | null>(null);
  const [serialError, setSerialError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [clientId, setClientId] = useState(initialClientId);
  const [frameName, setFrameName] = useState('');
  const [frameType, setFrameType] = useState('');
  const [lensName, setLensName] = useState('');
  const [lensType, setLensType] = useState('');
  const [instructions, setInstructions] = useState('');
  const [prescription, setPrescription] = useState<PrescriptionReading>(() =>
    emptyItemPrescription(),
  );
  const [issues, setIssues] = useState<Partial<Record<PrescriptionIssueKey, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [missing, setMissing] = useState<Partial<Record<RequiredField, string>>>({});
  const [busy, setBusy] = useState(false);
  const [inventory, setInventory] = useState<LabInventoryItem[]>([]);
  const fieldRefs = useRef<Partial<Record<RequiredField, HTMLInputElement | null>>>({});
  const lensItems = inventory.filter((item) => isLensCategory(item.category));
  const frameItems = inventory.filter((item) => isFrameCategory(item.category));
  const lensNameSuggestions = suggestionList(
    LENS_NAMES,
    lensItems.map((item) => item.name),
  );
  const lensTypeSuggestions = suggestionList(
    LENS_TYPES,
    lensItems.map((item) => item.category),
  );
  const frameNameSuggestions = suggestionList(
    FRAME_NAMES,
    frameItems.map((item) => item.name),
  );
  const frameTypeSuggestions = suggestionList(
    FRAME_TYPES,
    frameItems.map((item) => item.category),
  );

  useEffect(() => {
    let active = true;
    void reserveLabReference(token)
      .then((reference) => {
        if (active) {
          setSerial(reference);
          setSerialError(null);
        }
      })
      .catch((caught: unknown) => {
        if (active) {
          setSerialError(
            caught instanceof Error ? caught.message : 'A product tag number could not be reserved',
          );
        }
      });
    return () => {
      active = false;
    };
  }, [token]);

  useEffect(() => {
    let active = true;
    void loadLabInventory(token)
      .then((items) => {
        if (active) {
          setInventory(items);
        }
      })
      .catch(() => {
        if (active) {
          setInventory([]);
        }
      });
    return () => {
      active = false;
    };
  }, [token]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-hidden bg-ink/30 p-3"
      role="dialog"
      aria-labelledby="add-job-title"
    >
      <form
        noValidate
        className="grid max-h-full w-full max-w-3xl gap-2 overflow-visible rounded-xl border border-line bg-white p-3"
        onSubmit={(event) => {
          event.preventDefault();
          const nextIssues = prescriptionIssues(prescription);
          setIssues(nextIssues);
          const gaps: Partial<Record<RequiredField, string>> = {};
          const values: Record<RequiredField, string> = {
            name,
            lensName,
            lensType,
            frameName,
            frameType,
          };
          (Object.keys(REQUIRED_COPY) as RequiredField[]).forEach((key) => {
            if (!values[key].trim()) {
              gaps[key] = REQUIRED_COPY[key];
            }
          });
          setMissing(gaps);
          if (!isShopPhone(phone)) {
            setPhoneError(shopPhoneMessage(phone));
          } else {
            setPhoneError(null);
          }
          const firstGap = (Object.keys(REQUIRED_COPY) as RequiredField[]).find((key) => gaps[key]);
          if (firstGap) {
            const target = fieldRefs.current[firstGap];
            target?.focus();
            target?.scrollIntoView({ block: 'center' });
          }
          if (!serial || Object.keys(nextIssues).length > 0 || !isShopPhone(phone) || firstGap) {
            if (!serial) {
              setFormError(serialError ?? 'Wait for the product tag number.');
            } else if (firstGap === 'name') {
              setFormError(REQUIRED_COPY.name);
            } else {
              setFormError(null);
            }
            return;
          }
          const parsed = CreateLabBoardJobSchema.safeParse({
            patientName: name,
            patientPhone: phone,
            labClientId: clientId,
            frameName,
            frameType,
            lensName,
            lensType,
            specialInstructions: instructions,
            referenceNumber: serial,
            prescription,
          });
          if (!parsed.success) {
            setFormError(parsed.error.issues[0]?.message ?? 'Check the job details.');
            return;
          }
          setBusy(true);
          setFormError(null);
          void createLabBoardJob(token, parsed.data)
            .then((created) => onCreated(created.referenceNumber))
            .catch((caught: unknown) =>
              setFormError(caught instanceof Error ? caught.message : 'The job could not be added'),
            )
            .finally(() => setBusy(false));
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 id="add-job-title" className="text-lg font-semibold text-ink">
              Add New Job
            </h2>
            <p className="text-xs text-ink2">
              Write the tag on the product before it leaves the bench.
            </p>
          </div>
          <div className="rounded-lg border border-navy bg-canvas px-3 py-1.5 text-right">
            <p className="text-xs font-medium uppercase tracking-wide text-ink3">Product tag</p>
            <p className="font-mono text-lg font-semibold tracking-wide text-ink">
              {serial ? productTagLabel(serial) : 'Assigning…'}
            </p>
          </div>
        </div>
        {serialError ? (
          <p role="alert" className="text-sm text-danger">
            {serialError}
          </p>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-xs text-ink2" htmlFor="lab-job-customer-name">
            Customer name
            <input
              id="lab-job-customer-name"
              ref={(node) => {
                fieldRefs.current.name = node;
              }}
              value={name}
              aria-invalid={missing.name ? true : undefined}
              onChange={(event) => {
                setName(event.target.value);
                setMissing((current) => ({ ...current, name: undefined }));
              }}
              className={inputClass(Boolean(missing.name))}
            />
            {missing.name ? (
              <span role="alert" className="text-xs text-danger">
                {missing.name}
              </span>
            ) : null}
          </label>
          <CustomerPhoneField
            value={phone}
            error={phoneError ?? undefined}
            onChange={(next) => {
              setPhone(next);
              setPhoneError(null);
            }}
          />
        </div>
        <label className="grid gap-1 text-xs text-ink2">
          Client
          <select
            value={clientId}
            onChange={(event) => setClientId(event.target.value)}
            className={fieldClass}
          >
            <option value="">Walk-in</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        </label>
        <div className="grid gap-2">
          <h3 className="text-sm font-semibold text-ink">Prescription</h3>
          <div>
            <PrescriptionFields
              draft={prescription}
              issues={issues}
              onChange={setPrescription}
              showNotes={false}
              showGuidance={false}
              pairedEyes
            />
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-4">
          <RequiredInput
            label="Lens name"
            value={lensName}
            message={missing.lensName}
            suggestions={lensNameSuggestions}
            inputRef={(node) => {
              fieldRefs.current.lensName = node;
            }}
            onChange={(value) => {
              setLensName(value);
              setMissing((current) => ({ ...current, lensName: undefined }));
            }}
          />
          <RequiredInput
            label="Lens type"
            value={lensType}
            message={missing.lensType}
            suggestions={lensTypeSuggestions}
            inputRef={(node) => {
              fieldRefs.current.lensType = node;
            }}
            onChange={(value) => {
              setLensType(value);
              setMissing((current) => ({ ...current, lensType: undefined }));
            }}
          />
          <RequiredInput
            label="Frame name"
            value={frameName}
            message={missing.frameName}
            suggestions={frameNameSuggestions}
            inputRef={(node) => {
              fieldRefs.current.frameName = node;
            }}
            onChange={(value) => {
              setFrameName(value);
              setMissing((current) => ({ ...current, frameName: undefined }));
            }}
          />
          <RequiredInput
            label="Frame type"
            value={frameType}
            message={missing.frameType}
            suggestions={frameTypeSuggestions}
            inputRef={(node) => {
              fieldRefs.current.frameType = node;
            }}
            onChange={(value) => {
              setFrameType(value);
              setMissing((current) => ({ ...current, frameType: undefined }));
            }}
          />
        </div>
        <label className="grid gap-1 text-xs text-ink2">
          Notes/Special instructions
          <input
            value={instructions}
            maxLength={500}
            onChange={(event) => setInstructions(event.target.value)}
            className={fieldClass}
          />
        </label>
        {formError ? (
          <p role="alert" className="text-sm text-danger">
            {formError}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={busy || !serial}
            className="min-h-11 rounded-lg bg-action px-4 text-sm font-medium text-white disabled:opacity-60"
          >
            {busy ? 'Adding…' : 'Add to Received'}
          </button>
          <button
            type="button"
            className="min-h-11 rounded-lg border border-line px-4 text-sm text-ink2"
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function inputClass(invalid: boolean): string {
  return `${fieldClass} ${invalid ? 'border-danger bg-danger-soft' : ''}`;
}

function RequiredInput({
  label,
  value,
  message,
  suggestions,
  inputRef,
  onChange,
}: {
  label: string;
  value: string;
  message?: string;
  suggestions: readonly string[];
  inputRef: (node: HTMLInputElement | null) => void;
  onChange: (value: string) => void;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  const listId = `${label.replace(/\s+/g, '-').toLowerCase()}-suggestions`;
  const needle = value.trim().toLowerCase();
  const matches = suggestions.filter((item, index) => {
    if (index === 0) {
      return true;
    }
    return needle.length === 0 || item.toLowerCase().includes(needle);
  });
  return (
    <div className="relative grid gap-1 text-xs text-ink2">
      <span>{label}</span>
      <input
        ref={inputRef}
        value={value}
        aria-label={label}
        aria-invalid={message ? true : undefined}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        className={inputClass(Boolean(message))}
      />
      {open ? (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          className="absolute bottom-full left-0 right-0 z-20 mb-1 max-h-36 overflow-y-auto rounded-lg border border-line bg-white py-1"
        >
          {matches.map((item) => (
            <li key={item}>
              <button
                type="button"
                role="option"
                aria-selected={value === item}
                className="min-h-11 w-full px-3 text-left text-sm text-ink hover:bg-canvas"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(item);
                  setOpen(false);
                }}
              >
                {item}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {message ? (
        <span role="alert" className="text-xs text-danger">
          {message}
        </span>
      ) : null}
    </div>
  );
}

function suggestionList(builtIn: readonly string[], inventoryValues: readonly string[]): string[] {
  const seen = new Set<string>([RECEIVED_SAMPLE.toLowerCase()]);
  const rest: string[] = [];
  for (const value of [...builtIn, ...inventoryValues]) {
    const trimmed = value.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) {
      continue;
    }
    seen.add(key);
    rest.push(trimmed);
  }
  return [RECEIVED_SAMPLE, ...rest];
}

function isLensCategory(category: string): boolean {
  const value = category.toLowerCase();
  return value.includes('lens') || value.includes('blank') || value.includes('coating');
}

function isFrameCategory(category: string): boolean {
  return category.toLowerCase().includes('frame');
}
