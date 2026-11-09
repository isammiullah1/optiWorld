import { z } from 'zod';
import { ORG_TYPES, type OrgType } from '@optiworld/shared';

const KEY = 'optiworld.setup';

const SetupDraftSchema = z.object({
  orgType: z.enum(ORG_TYPES),
  businessName: z.string(),
  city: z.string(),
  phone: z.string(),
  whatsappNumber: z.string(),
  address: z.string(),
  listingProfileNotes: z.string(),
});

export type SetupDraft = z.infer<typeof SetupDraftSchema>;

const EMPTY: SetupDraft = {
  orgType: 'RETAILER',
  businessName: '',
  city: '',
  phone: '',
  whatsappNumber: '',
  address: '',
  listingProfileNotes: '',
};

export function readSetup(): SetupDraft | null {
  const raw = window.sessionStorage.getItem(KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    const result = SetupDraftSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function writeSetup(patch: Partial<SetupDraft> & { orgType?: OrgType }): void {
  const current = readSetup() ?? EMPTY;
  window.sessionStorage.setItem(KEY, JSON.stringify({ ...current, ...patch }));
}

export function clearSetup(): void {
  window.sessionStorage.removeItem(KEY);
}
