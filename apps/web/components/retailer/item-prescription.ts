import {
  categoryRequiresPrescription,
  type ItemPrescription,
  type LinePrescriptionInput,
} from '@optiworld/shared';

export const EMPTY_EYE = { sphere: '', cylinder: '', axis: '' };

export function emptyItemPrescription(): ItemPrescription {
  return {
    right: { ...EMPTY_EYE },
    left: { ...EMPTY_EYE },
    add: '',
    pd: '',
    notes: '',
  };
}

export function prescriptionLabel(value: ItemPrescription | null): string | null {
  if (!value) {
    return null;
  }
  return `R ${eyeText(value.right)} · L ${eyeText(value.left)}`;
}

export function needsPrescription(
  category: string,
  productName = '',
  stored?: boolean | null,
): boolean {
  return categoryRequiresPrescription(category, productName, stored);
}

export function hasFilledPrescription(value: ItemPrescription | null): boolean {
  if (!value) {
    return false;
  }
  return [
    value.right.sphere,
    value.right.cylinder,
    value.left.sphere,
    value.left.cylinder,
    value.add,
    value.pd,
  ].some((part) => part.trim().length > 0);
}

export function linePrescription(
  value: ItemPrescription,
  savedId?: string,
  labOrgId?: string,
): LinePrescriptionInput {
  return {
    ...value,
    remember: savedId === undefined,
    ...(savedId ? { savedId } : {}),
    ...(labOrgId ? { labOrgId } : {}),
  };
}

function eyeText(eye: ItemPrescription['right']): string {
  return `${eye.sphere || '—'} / ${eye.cylinder || '—'} × ${eye.axis || '—'}`;
}
