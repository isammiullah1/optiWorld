import {
  CircleDot,
  Glasses,
  Layers,
  Scissors,
  Slice,
  Sparkles,
  Sun,
  Tags,
  type LucideIcon,
} from 'lucide-react';

export type LabServiceLook = {
  icon: LucideIcon;
  tone: string;
};

/** Each named service keeps its own icon and colour. */
export function labServiceLook(name: string): LabServiceLook {
  const value = name.toLowerCase();
  if (value.includes('cut')) {
    return { icon: Scissors, tone: 'border-action bg-action-soft text-action' };
  }
  if (value.includes('edg')) {
    return {
      icon: Slice,
      tone: 'border-[var(--ow-work)] bg-[var(--ow-work-soft)] text-[var(--ow-work)]',
    };
  }
  if (value.includes('drill')) {
    return { icon: CircleDot, tone: 'border-navy bg-[var(--ow-navy-soft)] text-navy' };
  }
  if (value.includes('tint') || value.includes('photo')) {
    return { icon: Sun, tone: 'border-amber bg-amber-soft text-amber' };
  }
  if (value.includes('coat')) {
    return {
      icon: Sparkles,
      tone: 'border-[var(--ow-sent)] bg-[var(--ow-sent-soft)] text-[var(--ow-sent)]',
    };
  }
  if (value.includes('mount')) {
    return { icon: Layers, tone: 'border-danger bg-danger-soft text-danger' };
  }
  if (
    value.includes('fit') ||
    value.includes('lens') ||
    value.includes('vision') ||
    value.includes('surfac')
  ) {
    return { icon: Glasses, tone: 'border-teal bg-teal-soft text-teal' };
  }
  return { icon: Tags, tone: 'border-line bg-canvas text-ink2' };
}
