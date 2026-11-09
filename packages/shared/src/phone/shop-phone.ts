import {
  getCountries,
  getCountryCallingCode,
  Metadata,
  type CountryCode,
} from 'libphonenumber-js/max';

export const DEFAULT_PHONE_COUNTRY: CountryCode = 'PK';

export interface PhoneCountryOption {
  code: CountryCode;
  name: string;
  dial: string;
  flag: string;
  min: number;
  max: number;
  trunk: string;
}

interface PlanDetails {
  possibleLengths(): number[];
  nationalPrefix(): string | undefined;
  type(kind: 'MOBILE'): { possibleLengths(): number[] } | undefined;
}

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });

function countryFlag(code: string): string {
  return [...code.toUpperCase()]
    .map((char) => String.fromCodePoint(127397 + char.charCodeAt(0)))
    .join('');
}

function limitsFor(country: CountryCode): { min: number; max: number; trunk: string } {
  const metadata = new Metadata();
  metadata.selectNumberingPlan(country);
  const plan = metadata.numberingPlan as PlanDetails | undefined;
  if (!plan) {
    return { min: 4, max: 15, trunk: '' };
  }
  const mobileLengths = plan.type('MOBILE')?.possibleLengths() ?? [];
  const lengths = (mobileLengths.length > 0 ? mobileLengths : plan.possibleLengths()).filter(
    (length) => length > 0,
  );
  const min = lengths.length > 0 ? Math.min(...lengths) : 4;
  const max = lengths.length > 0 ? Math.max(...lengths) : 15;
  const trunkValue = plan.nationalPrefix();
  return { min, max, trunk: trunkValue ? String(trunkValue) : '' };
}

function buildCountries(): PhoneCountryOption[] {
  const options: PhoneCountryOption[] = [];
  for (const code of getCountries()) {
    const name = regionNames.of(code);
    if (!name) {
      continue;
    }
    const limits = limitsFor(code);
    options.push({
      code,
      name,
      dial: getCountryCallingCode(code),
      flag: countryFlag(code),
      min: limits.min,
      max: limits.max,
      trunk: limits.trunk,
    });
  }
  options.sort((left, right) => {
    if (left.code === DEFAULT_PHONE_COUNTRY) {
      return -1;
    }
    if (right.code === DEFAULT_PHONE_COUNTRY) {
      return 1;
    }
    return left.name.localeCompare(right.name);
  });
  return options;
}

export const PHONE_COUNTRIES: readonly PhoneCountryOption[] = buildCountries();

export function phoneCountry(code: string): PhoneCountryOption | undefined {
  return PHONE_COUNTRIES.find((country) => country.code === code);
}

export function limitNationalDigits(country: string, raw: string): string {
  const option = phoneCountry(country);
  if (!option) {
    return raw.replace(/\D/g, '').slice(0, 15);
  }
  let digits = raw.replace(/\D/g, '');
  if (option.trunk.length > 0 && digits.startsWith(option.trunk) && digits.length > option.max) {
    digits = digits.slice(option.trunk.length);
  }
  return digits.slice(0, option.max);
}

export function composeShopPhone(country: string, nationalDigits: string): string {
  const option = phoneCountry(country);
  if (!option || nationalDigits.length === 0) {
    return '';
  }
  return `+${option.dial} ${nationalDigits}`;
}

export function shopPhoneError(country: string, nationalDigits: string): string | null {
  const option = phoneCountry(country);
  if (!option) {
    return 'Choose a country code.';
  }
  if (nationalDigits.length === 0) {
    return 'Enter a phone number.';
  }
  if (nationalDigits.length < option.min || nationalDigits.length > option.max) {
    const span = option.min === option.max ? `${option.min}` : `${option.min}–${option.max}`;
    return `Enter ${span} digits after +${option.dial}.`;
  }
  return null;
}

export function shopPhoneMessage(value: string): string {
  const compact = value.replace(/[\s()-]/g, '');
  const digits = compact.startsWith('+') ? compact.slice(1) : '';
  const country = longestDialMatch(digits);
  if (!country) {
    return 'Enter a valid mobile number for the selected country. A Pakistan number is 10 digits after +92.';
  }
  return lengthMessage(country);
}

function lengthMessage(country: PhoneCountryOption): string {
  const span = country.min === country.max ? `${country.min}` : `${country.min}–${country.max}`;
  return `Enter ${span} digits after +${country.dial}.`;
}

function longestDialMatch(digits: string): PhoneCountryOption | undefined {
  const matches = PHONE_COUNTRIES.filter((country) => digits.startsWith(country.dial));
  if (matches.length === 0 || !/^\d+$/.test(digits)) {
    return undefined;
  }
  const longest = Math.max(...matches.map((country) => country.dial.length));
  return matches.find((country) => country.dial.length === longest);
}

function matchesNationalLength(country: PhoneCountryOption, national: string): boolean {
  return national.length >= country.min && national.length <= country.max;
}

/** Customer mobiles: Pakistan is 10 digits after +92, and every other country uses its own mobile length. */
export function isShopPhone(value: string): boolean {
  const compact = value.replace(/[\s()-]/g, '');
  if (/^0[1-9]\d{9}$/.test(compact)) {
    return true;
  }
  if (!compact.startsWith('+')) {
    return false;
  }
  const digits = compact.slice(1);
  if (!/^\d+$/.test(digits)) {
    return false;
  }
  const matches = PHONE_COUNTRIES.filter((country) => digits.startsWith(country.dial));
  if (matches.length === 0) {
    return false;
  }
  const longest = Math.max(...matches.map((country) => country.dial.length));
  return matches.some((country) => {
    if (country.dial.length !== longest) {
      return false;
    }
    return matchesNationalLength(country, digits.slice(country.dial.length));
  });
}
