'use client';

import {
  acceptPrescriptionInput,
  addOptions,
  axisOptions,
  cylinderOptions,
  pdOptions,
  sphereOptions,
  type PrescriptionIssueKey,
  type PrescriptionReading,
} from '@optiworld/shared';
import { ChevronDown, Eye, Plus, Ruler } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { EMPTY_EYE } from './item-prescription';

export function PrescriptionFields({
  draft,
  issues,
  onChange,
  showNotes = true,
  showGuidance = true,
}: {
  draft: PrescriptionReading;
  issues: Partial<Record<PrescriptionIssueKey, string>>;
  onChange: (next: PrescriptionReading) => void;
  showNotes?: boolean;
  showGuidance?: boolean;
  pairedEyes?: boolean;
}): React.ReactElement {
  const [mirror, setMirror] = useState(false);

  function changeRight(right: typeof EMPTY_EYE): void {
    onChange({ ...draft, right, ...(mirror ? { left: { ...right } } : {}) });
  }

  return (
    <div className="grid min-w-0 gap-3">
      <div className="flex items-center gap-2 text-ink">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-action-soft text-action">
          <Eye size={16} aria-hidden="true" />
        </span>
        <h3 className="text-sm font-medium">Vision</h3>
      </div>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        <EyeCard
          label="Right eye"
          tone="right"
          value={draft.right}
          issues={issues}
          side="right"
          onChange={changeRight}
        />
        <EyeCard
          label="Left eye"
          tone="left"
          value={draft.left}
          issues={issues}
          side="left"
          mirror={mirror}
          onMirror={(next) => {
            setMirror(next);
            if (next) {
              onChange({ ...draft, left: { ...draft.right } });
            }
          }}
          onChange={(left) => {
            setMirror(false);
            onChange({ ...draft, left });
          }}
        />
      </div>
      <div className="grid min-w-0 gap-3 rounded-xl border border-line bg-teal-soft p-3 sm:grid-cols-2">
        <ReadingField
          id="add"
          label="Add"
          icon={<Plus size={14} className="text-teal" aria-hidden="true" />}
          value={draft.add}
          field="add"
          error={issues.add}
          onChange={(add) => onChange({ ...draft, add })}
        />
        <ReadingField
          id="pd"
          label="Pupillary distance (PD)"
          icon={<Ruler size={14} className="text-teal" aria-hidden="true" />}
          value={draft.pd}
          field="pd"
          error={issues.pd}
          onChange={(pd) => onChange({ ...draft, pd })}
        />
      </div>
      {showNotes ? (
        <label className="grid gap-1 text-xs text-ink3">
          Notes
          <input
            aria-label="Notes"
            value={draft.notes}
            maxLength={500}
            onChange={(event) => onChange({ ...draft, notes: event.target.value })}
            className="min-h-11 rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-action"
          />
        </label>
      ) : null}
      {showGuidance ? (
        <p className="text-xs text-ink3">
          Sphere −20.00 to +20.00 and cylinder −6.00 to +6.00, in steps of 0.25. Axis is 1–180 when
          a cylinder is entered. Add is +0.25 to +4.00. PD is 46–80 mm.
        </p>
      ) : null}
      {issues.form ? (
        <p role="alert" className="text-sm text-danger">
          {issues.form}
        </p>
      ) : null}
    </div>
  );
}

function EyeCard({
  label,
  tone,
  value,
  issues,
  side,
  mirror,
  onMirror,
  onChange,
}: {
  label: string;
  tone: 'right' | 'left';
  value: typeof EMPTY_EYE;
  issues: Partial<Record<PrescriptionIssueKey, string>>;
  side: 'right' | 'left';
  mirror?: boolean;
  onMirror?: (next: boolean) => void;
  onChange: (value: typeof EMPTY_EYE) => void;
}): React.ReactElement {
  const soft = tone === 'right' ? 'border-line bg-action-soft' : 'border-line bg-danger-soft';
  const icon = tone === 'right' ? 'text-action' : 'text-danger';
  return (
    <div className={`grid min-w-0 gap-2 rounded-xl border p-3 ${soft}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="inline-flex items-center gap-1.5 text-sm font-medium text-ink">
          <Eye size={15} className={icon} aria-hidden="true" />
          {label}
        </p>
        {onMirror ? (
          <label className="inline-flex min-h-11 items-center gap-1.5 text-xs text-ink2">
            <input
              type="checkbox"
              checked={mirror}
              onChange={(event) => onMirror(event.target.checked)}
            />
            Same as right
          </label>
        ) : null}
      </div>
      <ReadingField
        id={`${side}-sphere`}
        label="SPH"
        value={value.sphere}
        field="sphere"
        error={issues[`${side}.sphere`]}
        name={`${label} sphere`}
        onChange={(sphere) => onChange({ ...value, sphere })}
      />
      <div className="grid min-w-0 grid-cols-2 gap-2">
        <ReadingField
          id={`${side}-cylinder`}
          label="CYL"
          value={value.cylinder}
          field="cylinder"
          error={issues[`${side}.cylinder`]}
          name={`${label} cylinder`}
          onChange={(cylinder) => onChange({ ...value, cylinder })}
        />
        <ReadingField
          id={`${side}-axis`}
          label="Axis"
          value={value.axis}
          field="axis"
          error={issues[`${side}.axis`]}
          name={`${label} axis`}
          onChange={(axis) => onChange({ ...value, axis })}
        />
      </div>
    </div>
  );
}

function ReadingField({
  id,
  label,
  value,
  field,
  error,
  name,
  icon,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  field: 'sphere' | 'cylinder' | 'axis' | 'add' | 'pd';
  error?: string;
  name?: string;
  icon?: React.ReactNode;
  onChange: (value: string) => void;
}): React.ReactElement {
  const listId = `rx-${id}`;
  const anchorRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [menuBox, setMenuBox] = useState<{ top: number; left: number; width: number } | null>(null);
  const options = OPTIONS[field];
  const fieldName = name ?? label;

  useLayoutEffect(() => {
    if (!open) {
      return;
    }
    function place(): void {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }
      const menuHeight = 192;
      const spaceBelow = window.innerHeight - rect.bottom;
      const top =
        spaceBelow < menuHeight && rect.top > spaceBelow
          ? Math.max(8, rect.top - menuHeight - 4)
          : rect.bottom + 4;
      setMenuBox({ top, left: rect.left, width: rect.width });
    }
    place();
    const selected = listRef.current?.querySelector('[aria-selected="true"]');
    if (selected instanceof HTMLElement && listRef.current) {
      listRef.current.scrollTop = selected.offsetTop;
    }
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    function closeOnOutside(event: MouseEvent): void {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (anchorRef.current?.contains(target) || listRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return (
    <label className="grid gap-1 text-xs text-ink2">
      <span className="inline-flex items-center gap-1">
        {icon}
        {label}
      </span>
      <div ref={anchorRef} className="relative">
        <input
          aria-label={fieldName}
          aria-invalid={Boolean(error)}
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          inputMode={field === 'axis' ? 'numeric' : 'decimal'}
          value={value}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            const next = event.target.value;
            if (acceptPrescriptionInput(field, next)) {
              onChange(next);
              setOpen(true);
            }
          }}
          className={`min-h-11 w-full rounded-lg border bg-white px-3 py-2 pr-9 text-sm text-ink outline-none focus:border-action ${
            error ? 'border-danger' : 'border-line'
          }`}
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label={`Show ${fieldName} options`}
          onMouseDown={(event) => {
            event.preventDefault();
            setOpen((current) => !current);
          }}
          className="absolute inset-y-0 right-0 grid w-9 place-items-center text-ink3"
        >
          <ChevronDown size={16} aria-hidden="true" />
        </button>
      </div>
      {open ? (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={fieldName}
          style={
            menuBox
              ? { top: menuBox.top, left: menuBox.left, width: menuBox.width }
              : { top: 0, left: 0, width: 160 }
          }
          className={`fixed z-50 max-h-48 overflow-y-auto rounded-lg border border-line bg-white ${menuBox ? '' : 'invisible'}`}
        >
          {options.map((option) => {
            const selected = option === value;
            return (
              <li key={option}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    onChange(option);
                    setOpen(false);
                  }}
                  className={`block min-h-9 w-full px-3 text-left text-sm ${
                    selected ? 'bg-action-soft font-medium text-action' : 'text-ink hover:bg-canvas'
                  }`}
                >
                  {option}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      {error ? (
        <span role="alert" className="text-danger">
          {error}
        </span>
      ) : null}
    </label>
  );
}

const OPTIONS = {
  sphere: sphereOptions(),
  cylinder: cylinderOptions(),
  axis: axisOptions(),
  add: addOptions(),
  pd: pdOptions(),
} as const;
