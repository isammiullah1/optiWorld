'use client';

import {
  acceptPrescriptionInput,
  addOptions,
  axisOptions,
  cylinderOptions,
  pdOptions,
  sphereOptions,
  type EyeReading,
  type PrescriptionIssueKey,
  type PrescriptionReading,
} from '@optiworld/shared';
import { ChevronDown, Eye, Plus, Ruler } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

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

  function changeRight(right: EyeReading): void {
    onChange({
      ...draft,
      right,
      ...(mirror ? { left: { ...right, add: right.add ?? draft.add } } : {}),
    });
  }

  return (
    <div className="grid min-w-0 gap-3">
      <label className="grid gap-1 text-xs text-ink2">
        Title
        <input
          aria-label="Prescription title"
          value={draft.title ?? ''}
          maxLength={40}
          placeholder="Mother, father, son"
          onChange={(event) => onChange({ ...draft, title: event.target.value })}
          className="box-border min-h-11 w-full min-w-0 max-w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-action"
        />
      </label>
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
          sharedAdd={draft.add}
          issues={issues}
          side="right"
          onChange={changeRight}
        />
        <EyeCard
          label="Left eye"
          tone="left"
          value={draft.left}
          sharedAdd={draft.add}
          issues={issues}
          side="left"
          mirror={mirror}
          onMirror={(next) => {
            setMirror(next);
            if (next) {
              onChange({
                ...draft,
                left: { ...draft.right, add: draft.right.add ?? draft.add },
              });
            }
          }}
          onChange={(left) => {
            setMirror(false);
            onChange({ ...draft, left });
          }}
        />
      </div>
      <div className="grid min-w-0 gap-3 rounded-xl border border-line bg-teal-soft p-3">
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
            className="box-border min-h-11 w-full min-w-0 max-w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-action"
          />
        </label>
      ) : null}
      {showGuidance ? (
        <p className="text-xs text-ink3">
          Sphere −20.00 to +20.00 and cylinder −6.00 to +6.00, in steps of 0.25. Axis is 1–180 when
          a cylinder is entered. Each eye has its own add, from +0.25 to +4.00. PD is 46–80 mm.
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
  sharedAdd,
  issues,
  side,
  mirror,
  onMirror,
  onChange,
}: {
  label: string;
  tone: 'right' | 'left';
  value: EyeReading;
  sharedAdd: string;
  issues: Partial<Record<PrescriptionIssueKey, string>>;
  side: 'right' | 'left';
  mirror?: boolean;
  onMirror?: (next: boolean) => void;
  onChange: (value: EyeReading) => void;
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
      <ReadingField
        id={`${side}-add`}
        label="Add"
        icon={<Plus size={14} className={icon} aria-hidden="true" />}
        value={value.add ?? sharedAdd}
        field="add"
        error={issues[`${side}.add`]}
        name={`${label} add`}
        onChange={(add) => onChange({ ...value, add })}
      />
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
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [menuBox, setMenuBox] = useState<{ top: number; left: number; width: number } | null>(null);
  const options = OPTIONS[field];
  const shown = options.filter((option) => matchesReading(field, value, option));
  const highlight = activeIndex >= 0 && activeIndex < shown.length ? activeIndex : -1;
  const fieldName = name ?? label;
  const seededPd = useRef(false);

  useEffect(() => {
    if (field !== 'pd' || seededPd.current) {
      return;
    }
    seededPd.current = true;
    if (value.trim() === '') {
      onChange('62');
    }
  }, [field, onChange, value]);

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
    const list = listRef.current;
    const active = list?.querySelector('[data-active="true"]');
    if (active instanceof HTMLElement && list) {
      const top = active.offsetTop;
      const bottom = top + active.offsetHeight;
      if (top < list.scrollTop) {
        list.scrollTop = top;
      } else if (bottom > list.scrollTop + list.clientHeight) {
        list.scrollTop = bottom - list.clientHeight;
      }
    } else if (list) {
      const selected = list.querySelector('[aria-selected="true"]');
      list.scrollTop = selected instanceof HTMLElement ? selected.offsetTop : 0;
    }
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, value, highlight]);

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
    <label className="grid min-w-0 gap-1 text-xs text-ink2">
      <span className="inline-flex items-center gap-1">
        {icon}
        {label}
      </span>
      <div ref={anchorRef} className="relative">
        <input
          ref={inputRef}
          role="combobox"
          aria-label={fieldName}
          aria-invalid={Boolean(error)}
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={highlight >= 0 ? `${listId}-${highlight}` : undefined}
          autoComplete="off"
          spellCheck={false}
          inputMode={field === 'axis' ? 'numeric' : 'decimal'}
          value={value}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            const next = event.target.value.replace('−', '-');
            if (acceptPrescriptionInput(field, next)) {
              onChange(next);
              setOpen(true);
              setActiveIndex(-1);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              setOpen(true);
              setActiveIndex((current) => {
                const count = shown.length;
                if (count === 0) {
                  return -1;
                }
                const index = current >= 0 && current < count ? current : -1;
                if (event.key === 'ArrowDown') {
                  return index < 0 ? 0 : Math.min(count - 1, index + 1);
                }
                return index <= 0 ? -1 : index - 1;
              });
              return;
            }
            if (event.key !== 'Enter') {
              return;
            }
            event.preventDefault();
            const picked = highlight >= 0 ? shown[highlight] : undefined;
            const next = picked ?? commitReading(field, value, options);
            if (next !== value) {
              onChange(next);
            }
            setActiveIndex(-1);
            setOpen(false);
          }}
          className={`box-border min-h-11 w-full min-w-0 max-w-full rounded-lg border bg-white px-3 py-2 pr-9 text-sm text-ink outline-none focus:border-action ${
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
          {shown.map((option, index) => {
            const chosen = option === value;
            const active = index === highlight;
            return (
              <li key={option} role="presentation">
                <button
                  type="button"
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={chosen}
                  data-active={active ? 'true' : undefined}
                  tabIndex={-1}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    onChange(option);
                    setActiveIndex(-1);
                    setOpen(false);
                  }}
                  onMouseMove={() => {
                    if (highlight !== index) {
                      setActiveIndex(index);
                    }
                  }}
                  className={`block min-h-9 w-full px-3 text-left text-sm ${
                    active || (highlight < 0 && chosen)
                      ? 'bg-action-soft font-medium text-action'
                      : 'text-ink hover:bg-canvas'
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

function matchesReading(
  field: 'sphere' | 'cylinder' | 'axis' | 'add' | 'pd',
  query: string,
  option: string,
): boolean {
  const typed = query.trim().replace('−', '-');
  if (typed === '') {
    return true;
  }
  if (field === 'axis' || field === 'pd') {
    return option.startsWith(typed);
  }
  if (typed === '+') {
    return option.startsWith('+');
  }
  if (typed === '-') {
    return option.startsWith('-');
  }
  if (powerPrefix(typed, option)) {
    return true;
  }
  if (!typed.startsWith('+') && !typed.startsWith('-')) {
    return powerPrefix(typed, option.replace(/^[+-]/, ''));
  }
  return false;
}

function powerPrefix(query: string, option: string): boolean {
  if (!option.startsWith(query)) {
    return false;
  }
  const rest = option.slice(query.length);
  if (rest === '' || rest.startsWith('.')) {
    return true;
  }
  return query.includes('.') || !/^\d/.test(rest);
}

function commitReading(
  field: 'sphere' | 'cylinder' | 'axis' | 'add' | 'pd',
  query: string,
  options: readonly string[],
): string {
  const typed = query.trim().replace('−', '-');
  if (typed === '' || typed === '+' || typed === '-') {
    return query;
  }
  const exact = options.find((option) => option === typed);
  if (exact) {
    return exact;
  }
  const matches = options.filter((option) => matchesReading(field, typed, option));
  if (matches.length === 1) {
    return matches[0] ?? typed;
  }
  if (field === 'axis' || field === 'pd' || matches.length === 0) {
    return typed;
  }
  const sign = typed.startsWith('-') ? '-' : '+';
  return matches.find((option) => option.startsWith(sign) && option.endsWith('.00')) ?? typed;
}

const OPTIONS = {
  sphere: sphereOptions(),
  cylinder: cylinderOptions(),
  axis: axisOptions(),
  add: addOptions(),
  pd: pdOptions(),
} as const;
