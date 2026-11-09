'use client';

import {
  composeShopPhone,
  DEFAULT_PHONE_COUNTRY,
  limitNationalDigits,
  PHONE_COUNTRIES,
  phoneCountry,
  type PhoneCountryOption,
} from '@optiworld/shared';
import { Phone } from 'lucide-react';

import { WhatsAppMark } from '@/components/WhatsAppMark';
import { useEffect, useMemo, useRef, useState } from 'react';

export function CustomerPhoneField({
  value,
  error,
  onChange,
  onBlur,
  autoFocus = false,
  label = 'Phone',
  inputLabel = 'Customer phone',
  icon = 'phone',
  required = false,
  disabled = false,
}: {
  value: string;
  error?: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  autoFocus?: boolean;
  label?: string;
  inputLabel?: string;
  icon?: 'phone' | 'message';
  required?: boolean;
  disabled?: boolean;
}): React.ReactElement {
  const phoneRef = useRef<HTMLInputElement>(null);
  const [countryCode, setCountryCode] = useState(DEFAULT_PHONE_COUNTRY);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const selected = phoneCountry(countryCode) ?? PHONE_COUNTRIES[0];
  const national = nationalFrom(value, selected);
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return PHONE_COUNTRIES;
    }
    return PHONE_COUNTRIES.filter((country) => {
      return (
        country.name.toLowerCase().includes(needle) ||
        country.dial.includes(needle.replace(/^\+/, ''))
      );
    });
  }, [query]);

  useEffect(() => {
    if (!autoFocus) {
      return;
    }
    phoneRef.current?.focus();
  }, [autoFocus]);

  function choose(country: PhoneCountryOption): void {
    const nextNational = limitNationalDigits(country.code, national);
    setCountryCode(country.code);
    setOpen(false);
    setQuery('');
    onChange(composeShopPhone(country.code, nextNational));
  }

  if (!selected) {
    return <p className="text-sm text-danger">Country codes are unavailable.</p>;
  }

  const lengthLabel =
    selected.min === selected.max
      ? `${selected.max} digits`
      : `${selected.min}–${selected.max} digits`;

  return (
    <div className="relative grid gap-1 text-xs text-ink2">
      <span className="inline-flex items-center gap-1">
        {icon === 'message' ? (
          <WhatsAppMark size={14} />
        ) : (
          <Phone size={14} className="text-action" aria-hidden="true" />
        )}
        {label}
        {required ? <span className="text-danger">*</span> : null}
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          aria-label="Country code"
          aria-expanded={open}
          aria-haspopup="listbox"
          onClick={() => {
            if (!disabled) {
              setOpen((current) => !current);
            }
          }}
          disabled={disabled}
          className={`flex shrink-0 items-center gap-1 rounded-lg border bg-white px-3 py-2 text-base text-ink outline-none focus:border-action ${error ? 'border-danger' : 'border-line'}`}
        >
          <span aria-hidden="true">{selected.flag}</span>
          <span>+{selected.dial}</span>
        </button>
        <input
          ref={phoneRef}
          aria-label={inputLabel}
          onBlur={onBlur}
          aria-invalid={error ? true : undefined}
          inputMode="numeric"
          autoComplete="tel-national"
          placeholder={selected.code === DEFAULT_PHONE_COUNTRY ? '321 5550100' : 'Mobile number'}
          value={national}
          maxLength={selected.max + selected.trunk.length}
          onChange={(event) => {
            const nextNational = limitNationalDigits(selected.code, event.target.value);
            onChange(composeShopPhone(selected.code, nextNational));
          }}
          disabled={disabled}
          className={`min-w-0 flex-1 rounded-lg border px-3 py-2 text-base text-ink outline-none focus:border-action disabled:bg-canvas ${error ? 'border-danger' : 'border-line'}`}
        />
      </div>
      {open ? (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 grid gap-2 rounded-lg border border-line bg-white p-2">
          <input
            aria-label="Search country"
            value={query}
            placeholder="Search country"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
              }
            }}
            className="rounded-lg border border-line px-3 py-2 text-base text-ink outline-none focus:border-action"
          />
          <ul
            role="listbox"
            aria-label="Country codes"
            className="grid max-h-40 gap-1 overflow-y-auto"
          >
            {matches.map((country) => (
              <li key={country.code}>
                <button
                  type="button"
                  role="option"
                  aria-selected={country.code === selected.code}
                  onClick={() => choose(country)}
                  className="flex min-h-[44px] w-full items-center justify-between rounded-lg px-2 text-left text-sm text-ink hover:bg-canvas"
                >
                  <span>
                    <span aria-hidden="true">{country.flag}</span> {country.name}
                  </span>
                  <span className="text-ink3">+{country.dial}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <span className="text-xs text-ink3">
        {lengthLabel} after +{selected.dial}
      </span>
      {error ? (
        <span className="text-xs text-danger" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

function nationalFrom(value: string, selected: PhoneCountryOption | undefined): string {
  if (!selected) {
    return '';
  }
  const compact = value.replace(/[^\d+]/g, '');
  const dial = `+${selected.dial}`;
  if (compact.startsWith(dial)) {
    return limitNationalDigits(selected.code, compact.slice(dial.length));
  }
  return limitNationalDigits(selected.code, value);
}
