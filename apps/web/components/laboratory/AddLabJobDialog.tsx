'use client';

import {
  centsToMoney,
  CreateLabBoardJobSchema,
  isShopPhone,
  moneyToCents,
  prescriptionIssues,
  productTagLabel,
  shopPhoneMessage,
  type LabBill,
  type LabClientRow,
  type LabInventoryItem,
  type PrescriptionIssueKey,
  type PrescriptionReading,
} from '@optiworld/shared';
import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { CustomerPhoneField } from '@/components/retailer/CustomerPhoneField';
import { formatRupee } from '@/components/retailer/dashboard-format';
import { emptyItemPrescription } from '@/components/retailer/item-prescription';
import { PrescriptionFields } from '@/components/retailer/PrescriptionFields';

import {
  createLabBoardJob,
  loadLabInventory,
  loadOwnLabServices,
  reserveLabReference,
} from './lab-api';
import {
  LabServiceChecks,
  labServiceChargeCents,
  type LabServiceOption,
} from '@/components/retailer/LabServiceChecks';

const RECEIVED_SAMPLE = 'Received Sample';
const LENS_NAMES = ['Blue Cut', 'CR-39', 'Photochromic', 'Progressive HD'] as const;
const LENS_TYPES = ['Single vision', 'Bifocal', 'Progressive', 'Office'] as const;
const FRAME_NAMES = ['Acetate', 'Metal', 'Combination'] as const;
const FRAME_TYPES = ['Full rim', 'Half rim', 'Rimless', 'Nylon'] as const;

const fieldClass =
  'box-border h-11 w-full min-w-0 max-w-full rounded-lg border bg-white px-3 text-sm text-ink outline-none focus:border-action';

const NAME_REQUIRED = 'Enter the customer name.';
const PRODUCT_REQUIRED = 'Enter at least one lens or frame detail.';

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
  onCreated: (referenceNumber: string, invoice: LabBill | null) => void;
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
  const [missingName, setMissingName] = useState<string | null>(null);
  const [productError, setProductError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [services, setServices] = useState<LabServiceOption[]>([]);
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [servicePrices, setServicePrices] = useState<Record<string, string>>({});
  const [paymentTaken, setPaymentTaken] = useState(false);
  const [deliver, setDeliver] = useState(false);
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryCharge, setDeliveryCharge] = useState('');
  const [inventory, setInventory] = useState<LabInventoryItem[]>([]);
  const nameRef = useRef<HTMLInputElement | null>(null);
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
    void loadOwnLabServices(token)
      .then((rows) => setServices(rows.filter((row) => row.isActive && Number(row.price) > 0)))
      .catch(() => setServices([]));
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

  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape' && !busy) {
        onClose();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-hidden bg-navy/40 p-3"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-job-title"
    >
      <form
        noValidate
        className="grid max-h-[calc(100dvh-1.5rem)] min-h-0 w-full min-w-0 max-w-3xl grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-xl border-2 border-navy bg-action-soft"
        onSubmit={(event) => {
          event.preventDefault();
          const nextIssues = prescriptionIssues(prescription);
          setIssues(nextIssues);
          const nameMissing = name.trim().length === 0;
          const productFilled = [lensName, lensType, frameName, frameType].some(
            (value) => value.trim().length > 0,
          );
          setMissingName(nameMissing ? NAME_REQUIRED : null);
          setProductError(productFilled ? null : PRODUCT_REQUIRED);
          if (!isShopPhone(phone)) {
            setPhoneError(shopPhoneMessage(phone));
          } else {
            setPhoneError(null);
          }
          if (nameMissing) {
            nameRef.current?.focus();
            nameRef.current?.scrollIntoView({ block: 'center' });
          }
          const walkIn = clientId.length === 0;
          const chargeOk = /^\d{1,10}(\.\d{1,2})?$/.test(deliveryCharge.trim());
          const deliveryCents =
            walkIn && deliver && chargeOk ? moneyToCents(deliveryCharge.trim()) : 0;
          const due =
            labServiceChargeCents(services, serviceIds, walkIn ? servicePrices : undefined) +
            deliveryCents;
          if (walkIn && deliver && deliveryAddress.trim().length === 0) {
            setFormError('Enter the delivery address.');
            return;
          }
          if (walkIn && deliver && (!chargeOk || deliveryCents <= 0)) {
            setFormError('Enter the delivery charges.');
            return;
          }
          if (serviceIds.length === 0) {
            setFormError('Choose at least one lab service.');
            return;
          }
          if (
            walkIn &&
            serviceIds.some((serviceId) => {
              const service = services.find((row) => row.id === serviceId);
              const raw = (service ? (servicePrices[serviceId] ?? service.price) : '').trim();
              return !/^\d{1,10}(\.\d{1,2})?$/.test(raw) || moneyToCents(raw) <= 0;
            })
          ) {
            setFormError('Enter a price above zero for each selected service.');
            return;
          }
          if (walkIn && due > 0 && !paymentTaken) {
            setFormError('Take the full walk-in payment before saving the job.');
            return;
          }
          if (
            !serial ||
            Object.keys(nextIssues).length > 0 ||
            !isShopPhone(phone) ||
            nameMissing ||
            !productFilled
          ) {
            if (!serial) {
              setFormError(serialError ?? 'Wait for the product tag number.');
            } else if (nameMissing) {
              setFormError(NAME_REQUIRED);
            } else if (!productFilled) {
              setFormError(PRODUCT_REQUIRED);
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
            serviceIds,
            servicePrices: walkIn
              ? serviceIds.flatMap((serviceId) => {
                  const service = services.find((row) => row.id === serviceId);
                  const price = (service ? (servicePrices[serviceId] ?? service.price) : '').trim();
                  return service ? [{ serviceId, price }] : [];
                })
              : undefined,
            amountReceived: walkIn ? centsToMoney(due) : '',
            deliveryAddress: walkIn && deliver ? deliveryAddress.trim() : '',
            deliveryCharge: walkIn && deliver ? deliveryCharge.trim() : '',
          });
          if (!parsed.success) {
            setFormError(parsed.error.issues[0]?.message ?? 'Check the job details.');
            return;
          }
          setBusy(true);
          setFormError(null);
          void createLabBoardJob(token, parsed.data)
            .then((created) => onCreated(created.referenceNumber, created.invoice))
            .catch((caught: unknown) =>
              setFormError(caught instanceof Error ? caught.message : 'The job could not be added'),
            )
            .finally(() => setBusy(false));
        }}
      >
        <div className="flex items-start justify-between gap-3 border-b border-navy bg-navy p-4">
          <div className="min-w-0">
            <h2 id="add-job-title" className="text-lg font-semibold text-white">
              Add New Job
            </h2>
            <p className="text-sm text-white/80">
              Write the tag on the product before it leaves the bench.
            </p>
          </div>
          <div className="flex items-start gap-2">
            <div className="rounded-xl border border-white/40 bg-white px-4 py-2 text-right">
              <p className="text-xs font-medium uppercase tracking-wide text-action">Product tag</p>
              <p className="font-mono text-xl font-semibold tracking-wide text-navy">
                {serial ? productTagLabel(serial) : 'Assigning…'}
              </p>
            </div>
            <button
              type="button"
              aria-label="Close"
              disabled={busy}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-white/40 text-white disabled:opacity-50"
              onClick={onClose}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className="grid min-h-0 min-w-0 content-start gap-3 overflow-y-auto overscroll-contain bg-action-soft p-4">
          {serialError ? (
            <p role="alert" className="text-sm text-danger">
              {serialError}
            </p>
          ) : null}
          <fieldset className="grid min-w-0 gap-2 rounded-xl border border-action bg-white p-3">
            <legend className="text-sm font-medium text-ink">Customer</legend>
            <div className="grid items-start gap-3 sm:grid-cols-2">
              <label
                className="grid min-w-0 content-start gap-1 text-xs text-ink2"
                htmlFor="lab-job-customer-name"
              >
                <span>
                  Customer name <span className="text-danger">*</span>
                </span>
                <input
                  id="lab-job-customer-name"
                  ref={nameRef}
                  value={name}
                  aria-invalid={missingName ? true : undefined}
                  onChange={(event) => {
                    setName(event.target.value);
                    setMissingName(null);
                  }}
                  className={inputClass(Boolean(missingName))}
                />
                {missingName ? (
                  <span role="alert" className="text-xs text-danger">
                    {missingName}
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
            <label className="grid min-w-0 gap-1 text-xs text-ink2">
              Client
              <select
                value={clientId}
                onChange={(event) => {
                  setClientId(event.target.value);
                  setPaymentTaken(false);
                }}
                className={`${fieldClass} border-line`}
              >
                <option value="">Walk-in</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
            </label>
          </fieldset>
          <LabServiceChecks
            services={services}
            selected={serviceIds}
            prices={clientId.length === 0 ? servicePrices : undefined}
            onPriceChange={
              clientId.length === 0
                ? (serviceId, price) => {
                    setPaymentTaken(false);
                    setServicePrices((current) => ({ ...current, [serviceId]: price }));
                  }
                : undefined
            }
            onToggle={(serviceId) => {
              setPaymentTaken(false);
              setServiceIds((current) =>
                current.includes(serviceId)
                  ? current.filter((id) => id !== serviceId)
                  : [...current, serviceId],
              );
            }}
          />
          {clientId.length === 0 ? (
            <fieldset className="grid min-w-0 gap-2 rounded-xl border border-amber bg-amber-soft p-3">
              <legend className="text-sm font-medium text-ink">Walk-in payment</legend>
              <p className="text-sm text-ink">
                Amount due{' '}
                <span className="font-semibold">
                  {formatRupee(
                    centsToMoney(
                      labServiceChargeCents(services, serviceIds, servicePrices) +
                        (deliver && /^\d{1,10}(\.\d{1,2})?$/.test(deliveryCharge.trim())
                          ? moneyToCents(deliveryCharge.trim())
                          : 0),
                    ),
                  )}
                </span>
              </p>
              <label className="flex min-h-11 items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={deliver}
                  onChange={(event) => {
                    setDeliver(event.target.checked);
                    setPaymentTaken(false);
                  }}
                />
                Deliver this order
              </label>
              {deliver ? (
                <>
                  <label className="grid gap-1 text-xs text-ink2">
                    Delivery address
                    <textarea
                      value={deliveryAddress}
                      onChange={(event) => setDeliveryAddress(event.target.value)}
                      rows={2}
                      maxLength={300}
                      className="box-border min-h-20 w-full resize-y rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-action"
                    />
                  </label>
                  <label className="grid gap-1 text-xs text-ink2">
                    Delivery charges
                    <input
                      inputMode="decimal"
                      value={deliveryCharge}
                      onChange={(event) => {
                        setDeliveryCharge(event.target.value);
                        setPaymentTaken(false);
                      }}
                      className="min-h-11 rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none focus:border-action"
                    />
                  </label>
                </>
              ) : null}
              <label className="flex min-h-11 items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={paymentTaken}
                  onChange={(event) => setPaymentTaken(event.target.checked)}
                />
                Payment taken in full
              </label>
            </fieldset>
          ) : null}
          <fieldset className="grid min-w-0 gap-2 rounded-xl border border-action bg-white p-3">
            <legend className="text-sm font-medium text-ink">Prescription</legend>
            <PrescriptionFields
              draft={prescription}
              issues={issues}
              onChange={setPrescription}
              showNotes={false}
              showGuidance={false}
              pairedEyes
            />
          </fieldset>
          <fieldset className="grid min-w-0 gap-2 rounded-xl border border-action bg-white p-3">
            <legend className="text-sm font-medium text-ink">Lens and frame</legend>
            <p className="text-xs text-ink2">At least one of these is required.</p>
            {productError ? (
              <p role="alert" className="text-xs text-danger">
                {productError}
              </p>
            ) : null}
            <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
              <RequiredInput
                tone="blue"
                label="Lens name"
                value={lensName}
                suggestions={lensNameSuggestions}
                onChange={(value) => {
                  setLensName(value);
                  setProductError(null);
                }}
              />
              <RequiredInput
                tone="teal"
                label="Lens type"
                value={lensType}
                suggestions={lensTypeSuggestions}
                onChange={(value) => {
                  setLensType(value);
                  setProductError(null);
                }}
              />
              <RequiredInput
                tone="amber"
                label="Frame name"
                value={frameName}
                suggestions={frameNameSuggestions}
                onChange={(value) => {
                  setFrameName(value);
                  setProductError(null);
                }}
              />
              <RequiredInput
                tone="navy"
                label="Frame type"
                value={frameType}
                suggestions={frameTypeSuggestions}
                onChange={(value) => {
                  setFrameType(value);
                  setProductError(null);
                }}
              />
            </div>
          </fieldset>
          <fieldset className="grid min-w-0 gap-2 rounded-xl border border-action bg-white p-3">
            <legend className="text-sm font-medium text-ink">Notes</legend>
            <label className="grid gap-1 text-xs text-ink2">
              Special instructions
              <textarea
                value={instructions}
                onChange={(event) => setInstructions(event.target.value)}
                rows={2}
                maxLength={500}
                className="box-border min-h-20 w-full min-w-0 max-w-full resize-y rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-action"
              />
            </label>
          </fieldset>
        </div>
        <div className="grid gap-3 border-t-2 border-navy bg-white p-4">
          {formError ? (
            <p role="alert" className="text-sm text-danger">
              {formError}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className="min-h-11 rounded-lg border border-navy bg-white px-4 text-sm text-navy"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !serial}
              className="min-h-11 rounded-lg bg-action px-4 text-sm font-medium text-white disabled:opacity-60"
            >
              {busy ? 'Adding…' : 'Add to Received'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

const FIELD_TONES = {
  blue: 'border-action bg-action-soft',
  teal: 'border-teal bg-teal-soft',
  amber: 'border-amber bg-amber-soft',
  navy: 'border-navy bg-[color-mix(in_srgb,var(--ow-navy)_10%,white)]',
} as const;

function inputClass(invalid: boolean): string {
  return `${fieldClass} ${invalid ? 'border-danger bg-danger-soft' : 'border-line'}`;
}

function RequiredInput({
  label,
  tone,
  value,
  message,
  suggestions,
  inputRef,
  onChange,
}: {
  label: string;
  tone: keyof typeof FIELD_TONES;
  value: string;
  message?: string;
  suggestions: readonly string[];
  inputRef?: (node: HTMLInputElement | null) => void;
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
    <div
      className={`relative grid min-w-0 gap-1 rounded-lg border px-2 py-2 text-xs text-ink2 ${FIELD_TONES[tone]}`}
    >
      <span className="font-medium text-ink">{label}</span>
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
