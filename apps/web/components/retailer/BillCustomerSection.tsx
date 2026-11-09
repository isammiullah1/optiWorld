'use client';

import type { CustomerGender, CustomerSearchHit } from '@optiworld/shared';
import { Cake, Mars, User, UserRound, Venus } from 'lucide-react';
import { useEffect, useRef } from 'react';

import { WhatsAppLabel } from '@/components/WhatsAppMark';

import { CustomerPhoneField } from './CustomerPhoneField';
import { formatRupee, formatShortDate } from './dashboard-format';

export type BillGender = CustomerGender | '';

export type BillCustomerDraft = {
  id: string | null;
  name: string;
  phone: string;
  whatsappNumber: string;
  gender: BillGender;
  dateOfBirth: string;
  age: string;
  referredBy: string;
  creditLimit: string;
  outstanding: string | null;
};

export const EMPTY_BILL_CUSTOMER: BillCustomerDraft = {
  id: null,
  name: '',
  phone: '',
  whatsappNumber: '',
  gender: '',
  dateOfBirth: '',
  age: '',
  referredBy: '',
  creditLimit: '0.00',
  outstanding: null,
};

export function draftFromHit(hit: CustomerSearchHit): BillCustomerDraft {
  return {
    id: hit.id,
    name: hit.name,
    phone: hit.phone ?? '',
    whatsappNumber: hit.whatsappNumber ?? '',
    gender: hit.gender ?? '',
    dateOfBirth: hit.dateOfBirth ?? '',
    age: '',
    referredBy: hit.referredBy ?? '',
    creditLimit: hit.creditLimit,
    outstanding: hit.outstanding,
  };
}

export function contactDigits(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '');
}

export function contactsMatch(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  const a = contactDigits(left);
  const b = contactDigits(right);
  if (a.length < 10 || b.length < 10) {
    return false;
  }
  return a.slice(-10) === b.slice(-10);
}

export function matchingCustomer(
  hits: readonly CustomerSearchHit[],
  number: string,
): CustomerSearchHit | null {
  return (
    hits.find(
      (hit) => contactsMatch(hit.phone, number) || contactsMatch(hit.whatsappNumber, number),
    ) ?? null
  );
}

const GENDERS: ReadonlyArray<{
  id: CustomerGender;
  label: string;
  icon: typeof Mars;
  iconClass: string;
  selected: string;
}> = [
  {
    id: 'MALE',
    label: 'Male',
    icon: Mars,
    iconClass: 'text-action',
    selected: 'border-action bg-action-soft text-action',
  },
  {
    id: 'FEMALE',
    label: 'Female',
    icon: Venus,
    iconClass: 'text-danger',
    selected: 'border-danger bg-danger-soft text-danger',
  },
  {
    id: 'OTHER',
    label: 'Other',
    icon: UserRound,
    iconClass: 'text-teal',
    selected: 'border-teal bg-teal-soft text-teal',
  },
];

export function BillCustomerSection({
  draft,
  suggestions,
  menuOpen,
  focusTick,
  match,
  onName,
  onPhone,
  onWhatsapp,
  onGender,
  onDateOfBirth,
  onAge,
  onMenu,
  onPick,
  onPhoneBlur,
  onWhatsappBlur,
  onUseMatch,
  onEditMatch,
  nameError,
  whatsappError,
  genderError,
}: {
  draft: BillCustomerDraft;
  suggestions: readonly CustomerSearchHit[];
  menuOpen: boolean;
  focusTick: number;
  match: CustomerSearchHit | null;
  onName: (value: string) => void;
  onPhone: (value: string) => void;
  onWhatsapp: (value: string) => void;
  onGender: (value: BillGender) => void;
  onDateOfBirth: (value: string) => void;
  onAge: (value: string) => void;
  onMenu: (open: boolean) => void;
  onPick: (customer: CustomerSearchHit) => void;
  onPhoneBlur: () => void;
  onWhatsappBlur: () => void;
  onUseMatch: () => void;
  onEditMatch: () => void;
  nameError?: string;
  whatsappError?: string;
  genderError?: string;
}): React.ReactElement {
  const nameRef = useRef<HTMLInputElement>(null);
  const dobAge = ageFromDob(draft.dateOfBirth);
  const ageLocked = dobAge.length > 0;

  useEffect(() => {
    if (focusTick > 0) {
      nameRef.current?.focus();
    }
  }, [focusTick]);

  return (
    <section className="grid gap-3 rounded-xl border border-line bg-canvas p-3">
      <div className="flex items-center gap-2 text-ink">
        <User size={16} className="text-action" aria-hidden="true" />
        <h3 className="text-sm font-medium">Customer</h3>
      </div>
      <div className="grid items-start gap-3 sm:grid-cols-2">
        <div className="relative">
          <label className="grid gap-1 text-xs text-ink2">
            <span className="inline-flex items-center gap-1">
              <User size={14} className="text-action" aria-hidden="true" />
              Name <span className="text-danger">*</span>
            </span>
            <input
              ref={nameRef}
              aria-label="Customer name"
              aria-invalid={nameError ? true : undefined}
              aria-expanded={menuOpen}
              aria-autocomplete="list"
              value={draft.name}
              autoComplete="off"
              placeholder="Customer name"
              onFocus={() => onMenu(true)}
              onBlur={() => onMenu(false)}
              onChange={(event) => onName(event.target.value)}
              className={`min-h-11 rounded-lg border bg-white px-3 text-sm text-ink outline-none focus:border-action ${nameError ? 'border-danger' : 'border-line'}`}
            />
            {nameError ? (
              <span className="text-xs text-danger" role="alert">
                {nameError}
              </span>
            ) : null}
          </label>
          {menuOpen ? (
            <ul
              role="listbox"
              aria-label="Saved customers"
              className="absolute z-30 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-line bg-white"
            >
              {suggestions.map((customer) => (
                <li key={customer.id}>
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => onPick(customer)}
                    className="flex min-h-11 w-full flex-col items-start px-3 py-2 text-left hover:bg-action-soft"
                  >
                    <span className="text-sm font-medium text-ink">{customer.name}</span>
                    <span className="text-xs text-ink3">
                      {customer.phone ?? 'No contact number'}
                    </span>
                  </button>
                </li>
              ))}
              {suggestions.length === 0 ? (
                <li className="px-3 py-2 text-sm text-ink3">
                  No saved customer with this name. Continue to add a new customer.
                </li>
              ) : null}
            </ul>
          ) : null}
        </div>
        <CustomerPhoneField
          label="WhatsApp"
          inputLabel="WhatsApp number"
          icon="message"
          required
          error={whatsappError}
          value={draft.whatsappNumber}
          onChange={onWhatsapp}
          onBlur={onWhatsappBlur}
        />
      </div>
      <div className="grid items-start gap-3 sm:grid-cols-2">
        <CustomerPhoneField
          label="Contact"
          inputLabel="Contact number"
          icon="phone"
          value={draft.phone}
          onChange={onPhone}
          onBlur={onPhoneBlur}
        />
        <div className="grid gap-1">
          <span className="text-xs text-ink2">
            Gender <span className="text-danger">*</span>
          </span>
          <div
            className="flex flex-wrap gap-1.5"
            role="group"
            aria-label="Gender"
            aria-required="true"
          >
            {GENDERS.map((option) => {
              const Icon = option.icon;
              const selected = draft.gender === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onGender(option.id)}
                  className={`inline-flex h-8 items-center gap-1 rounded-full border px-2.5 text-xs font-medium ${
                    selected ? option.selected : 'border-line bg-white text-ink2'
                  }`}
                >
                  <Icon size={14} className={option.iconClass} aria-hidden="true" />
                  {option.label}
                </button>
              );
            })}
          </div>
          {genderError ? (
            <span className="text-xs text-danger" role="alert">
              {genderError}
            </span>
          ) : null}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-xs text-ink2">
          <span className="inline-flex items-center gap-1">
            <Cake size={14} className="text-amber" aria-hidden="true" />
            Date of birth
          </span>
          <input
            aria-label="Date of birth"
            type="date"
            value={draft.dateOfBirth}
            onChange={(event) => onDateOfBirth(event.target.value)}
            className="min-h-11 rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none focus:border-action"
          />
        </label>
        <label className="grid gap-1 text-xs text-ink2">
          <span>Age</span>
          <input
            aria-label="Age"
            inputMode="numeric"
            readOnly={ageLocked}
            value={ageLocked ? dobAge : draft.age}
            onChange={(event) => onAge(event.target.value.replace(/\D/g, '').slice(0, 3))}
            className="min-h-11 rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none focus:border-action read-only:bg-canvas"
          />
        </label>
      </div>
      {draft.id && draft.outstanding ? (
        <p className="text-xs text-ink3">Outstanding {formatRupee(draft.outstanding)}</p>
      ) : null}
      {match ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center"
          role="presentation"
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="existing-customer-title"
            className="grid w-full max-w-md gap-3 rounded-t-xl border border-line bg-white p-4 sm:rounded-xl"
          >
            <h3 id="existing-customer-title" className="text-md font-semibold text-ink">
              This contact is already on file
            </h3>
            <dl className="grid gap-1 rounded-xl border border-line bg-canvas p-3 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-ink3">Name</dt>
                <dd className="text-ink">{match.name}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink3">Contact</dt>
                <dd className="text-ink">{match.phone ?? '—'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink3">WhatsApp</dt>
                <dd className="text-ink">
                  {match.whatsappNumber ? (
                    <WhatsAppLabel>{match.whatsappNumber}</WhatsAppLabel>
                  ) : (
                    '—'
                  )}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink3">Last purchase</dt>
                <dd className="text-ink">
                  {match.lastPurchaseAt ? formatShortDate(match.lastPurchaseAt) : 'No purchase yet'}
                </dd>
              </div>
            </dl>
            <p className="text-sm text-ink2">
              Use the saved customer, or keep editing this name and number as a new customer.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={onEditMatch}
                className="min-h-11 rounded-lg border border-line text-sm text-ink2"
              >
                Edit as new
              </button>
              <button
                type="button"
                onClick={onUseMatch}
                className="min-h-11 rounded-lg bg-action text-sm font-medium text-white"
              >
                Use these details
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ageFromDob(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return '';
  }
  const born = new Date(`${value}T00:00:00`);
  const now = new Date();
  let years = now.getFullYear() - born.getFullYear();
  const month = now.getMonth() - born.getMonth();
  if (month < 0 || (month === 0 && now.getDate() < born.getDate())) {
    years -= 1;
  }
  return years >= 0 ? String(years) : '';
}
