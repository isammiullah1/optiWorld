import {
  Baby,
  BatteryMedium,
  Blend,
  BookOpen,
  Box,
  Briefcase,
  Car,
  Circle,
  CircleDashed,
  CircleDot,
  Cog,
  Columns2,
  Diamond,
  Droplets,
  Dumbbell,
  Aperture,
  Eclipse,
  Eye,
  Focus,
  Frame,
  Glasses,
  HardHat,
  Layers,
  Link2,
  Monitor,
  Orbit,
  Package,
  Palette,
  Paperclip,
  Pipette,
  Presentation,
  Puzzle,
  RectangleHorizontal,
  Search,
  Shield,
  Shirt,
  Sparkles,
  SprayCan,
  Sun,
  SunMedium,
  Tag,
  Wand,
  Wrench,
  ZoomIn,
  type LucideIcon,
} from 'lucide-react';

const TONES: readonly { idle: string; active: string }[] = [
  {
    idle: 'border border-action bg-action-soft text-action',
    active: 'border border-action bg-action text-white',
  },
  {
    idle: 'border border-navy bg-[color-mix(in_srgb,var(--ow-navy)_12%,white)] text-navy',
    active: 'border border-navy bg-navy text-white',
  },
  {
    idle: 'border border-teal bg-teal-soft text-teal',
    active: 'border border-teal bg-teal text-white',
  },
  {
    idle: 'border border-amber bg-amber-soft text-amber',
    active: 'border border-amber bg-amber text-white',
  },
  {
    idle: 'border border-danger bg-danger-soft text-danger',
    active: 'border border-danger bg-danger text-white',
  },
  {
    idle: 'border border-ink3 bg-[color-mix(in_srgb,var(--ow-ink3)_24%,white)] text-ink2',
    active: 'border border-ink2 bg-ink2 text-white',
  },
  {
    idle: 'border border-[color-mix(in_srgb,var(--ow-red)_55%,var(--ow-navy))] bg-[color-mix(in_srgb,var(--ow-red)_14%,white)] text-[color-mix(in_srgb,var(--ow-red)_62%,var(--ow-navy))]',
    active:
      'border border-[color-mix(in_srgb,var(--ow-red)_55%,var(--ow-navy))] bg-[color-mix(in_srgb,var(--ow-red)_58%,var(--ow-navy))] text-white',
  },
  {
    idle: 'border border-[color-mix(in_srgb,var(--ow-amber)_62%,var(--ow-red))] bg-[color-mix(in_srgb,var(--ow-amber)_28%,white)] text-[color-mix(in_srgb,var(--ow-amber)_48%,var(--ow-red))]',
    active:
      'border border-[color-mix(in_srgb,var(--ow-amber)_62%,var(--ow-red))] bg-[color-mix(in_srgb,var(--ow-amber)_68%,var(--ow-red))] text-white',
  },
  {
    idle: 'border border-[color-mix(in_srgb,var(--ow-blue)_55%,var(--ow-teal))] bg-[color-mix(in_srgb,var(--ow-blue)_16%,white)] text-[color-mix(in_srgb,var(--ow-blue)_70%,var(--ow-navy))]',
    active:
      'border border-[color-mix(in_srgb,var(--ow-blue)_55%,var(--ow-teal))] bg-[color-mix(in_srgb,var(--ow-blue)_70%,var(--ow-navy))] text-white',
  },
  {
    idle: 'border border-[color-mix(in_srgb,var(--ow-teal)_50%,var(--ow-navy))] bg-[color-mix(in_srgb,var(--ow-teal)_18%,white)] text-[color-mix(in_srgb,var(--ow-teal)_45%,var(--ow-navy))]',
    active:
      'border border-[color-mix(in_srgb,var(--ow-teal)_50%,var(--ow-navy))] bg-[color-mix(in_srgb,var(--ow-teal)_55%,var(--ow-navy))] text-white',
  },
  {
    idle: 'border border-[color-mix(in_srgb,var(--ow-amber)_50%,var(--ow-navy))] bg-[color-mix(in_srgb,var(--ow-amber)_20%,white)] text-[color-mix(in_srgb,var(--ow-amber)_40%,var(--ow-navy))]',
    active:
      'border border-[color-mix(in_srgb,var(--ow-amber)_50%,var(--ow-navy))] bg-[color-mix(in_srgb,var(--ow-amber)_48%,var(--ow-navy))] text-white',
  },
  {
    idle: 'border border-[color-mix(in_srgb,var(--ow-navy)_40%,var(--ow-blue))] bg-[color-mix(in_srgb,var(--ow-navy)_10%,var(--ow-blue-soft))] text-navy',
    active:
      'border border-[color-mix(in_srgb,var(--ow-navy)_40%,var(--ow-blue))] bg-[color-mix(in_srgb,var(--ow-navy)_70%,var(--ow-blue))] text-white',
  },
];

const MARKS: Record<string, { icon: LucideIcon; tone: number }> = {
  'single vision': { icon: Eye, tone: 0 },
  bifocal: { icon: Columns2, tone: 1 },
  trifocal: { icon: Layers, tone: 2 },
  progressive: { icon: Blend, tone: 3 },
  occupational: { icon: Briefcase, tone: 4 },
  'blue cut': { icon: Shield, tone: 8 },
  photochromic: { icon: Eclipse, tone: 6 },
  polarized: { icon: Sun, tone: 7 },
  'high index': { icon: Diamond, tone: 9 },
  aspheric: { icon: CircleDashed, tone: 10 },
  'myopia control': { icon: Focus, tone: 11 },
  'anti-fatigue': { icon: BatteryMedium, tone: 5 },
  'driving lenses': { icon: Car, tone: 4 },
  'computer lenses': { icon: Monitor, tone: 1 },
  lenses: { icon: Aperture, tone: 2 },
  'ready readers': { icon: BookOpen, tone: 3 },
  'low vision aids': { icon: ZoomIn, tone: 6 },
  frames: { icon: Glasses, tone: 10 },
  'full rim frames': { icon: Box, tone: 11 },
  'semi-rimless frames': { icon: RectangleHorizontal, tone: 1 },
  'rimless frames': { icon: Frame, tone: 8 },
  'kids frames': { icon: Baby, tone: 7 },
  sunglasses: { icon: SunMedium, tone: 3 },
  'sports eyewear': { icon: Dumbbell, tone: 4 },
  'safety eyewear': { icon: HardHat, tone: 9 },
  'contact lenses': { icon: CircleDot, tone: 0 },
  'spherical contacts': { icon: Circle, tone: 8 },
  'toric contacts': { icon: Orbit, tone: 11 },
  'multifocal contacts': { icon: Layers, tone: 6 },
  coatings: { icon: Sparkles, tone: 9 },
  'lens treatments': { icon: Wand, tone: 7 },
  tints: { icon: Palette, tone: 6 },
  cases: { icon: Package, tone: 5 },
  'cleaning solutions': { icon: SprayCan, tone: 2 },
  cloths: { icon: Shirt, tone: 1 },
  accessories: { icon: Puzzle, tone: 10 },
  'cords and chains': { icon: Link2, tone: 11 },
  'nose pads': { icon: Droplets, tone: 0 },
  'screws and tools': { icon: Wrench, tone: 4 },
  'clip-ons': { icon: Paperclip, tone: 8 },
  magnifiers: { icon: Search, tone: 3 },
  'display material': { icon: Presentation, tone: 5 },
  equipment: { icon: Cog, tone: 1 },
  'spare parts': { icon: Puzzle, tone: 7 },
  other: { icon: Tag, tone: 5 },
};

function toneIndex(name: string): number {
  const known = MARKS[name.trim().toLowerCase()];
  if (known) {
    return known.tone % TONES.length;
  }
  let hash = 0;
  for (const char of name.trim().toLowerCase()) {
    hash = (hash + char.charCodeAt(0)) % TONES.length;
  }
  return hash;
}

export function categoryLook(name: string): { icon: LucideIcon; idle: string; active: string } {
  const key = name.trim().toLowerCase();
  const tone = TONES[toneIndex(name)] ?? TONES[0];
  if (!tone) {
    return {
      icon: Pipette,
      idle: 'border border-line bg-white text-ink2',
      active: 'border border-ink2 bg-ink2 text-white',
    };
  }
  return { icon: MARKS[key]?.icon ?? Pipette, idle: tone.idle, active: tone.active };
}

export function CategoryTag({ name }: { name: string }): React.ReactElement {
  const look = categoryLook(name);
  const Icon = look.icon;
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-medium ${look.idle}`}
    >
      <Icon size={14} className="shrink-0" aria-hidden="true" />
      <span className="truncate">{name}</span>
    </span>
  );
}
