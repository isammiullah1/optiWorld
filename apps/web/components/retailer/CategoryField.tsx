'use client';

import {
  findInventoryCategory,
  INVENTORY_CATEGORY_GROUPS,
  type InventoryCategoryRule,
} from '@optiworld/shared';
import { ChevronDown } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

export function CategoryField({
  value,
  prescriptionRequired,
  rules,
  error,
  disabled = false,
  onChange,
  onPick,
  onPrescription,
}: {
  value: string;
  prescriptionRequired: boolean;
  rules: readonly InventoryCategoryRule[];
  error?: string;
  disabled?: boolean;
  onChange: (name: string) => void;
  onPick: (name: string, prescriptionRequired: boolean) => void;
  onPrescription: (required: boolean) => void;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const listId = useId();
  const query = value.trim().toLowerCase();
  const known = findInventoryCategory(value);
  const saved = rules.filter((rule) => findInventoryCategory(rule.name) === null);
  const savedMatch = saved.find((rule) => rule.name.toLowerCase() === query) ?? null;
  const existing = known ?? savedMatch;
  const browsing = query.length === 0 || existing?.name.toLowerCase() === query;
  const groups = INVENTORY_CATEGORY_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => browsing || item.name.toLowerCase().includes(query)),
  })).filter((group) => group.items.length > 0);
  const customOptions = saved.filter((rule) => browsing || rule.name.toLowerCase().includes(query));

  useEffect(() => {
    if (!open) {
      return;
    }
    function onPointer(event: MouseEvent): void {
      if (!(event.target instanceof Node) || !panel.current?.contains(event.target)) {
        setOpen(false);
      }
    }
    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function applyTyped(next: string): void {
    const builtIn = findInventoryCategory(next);
    if (builtIn) {
      onPick(builtIn.name, builtIn.prescriptionRequired);
      return;
    }
    const custom = saved.find((rule) => rule.name.toLowerCase() === next.trim().toLowerCase());
    if (custom) {
      onPick(custom.name, custom.prescriptionRequired);
      return;
    }
    onChange(next);
  }

  return (
    <div className="relative grid gap-1 text-sm text-ink2" ref={panel}>
      <span>Category</span>
      <div className="relative">
        <input
          aria-label="Category"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          role="combobox"
          value={value}
          maxLength={40}
          autoComplete="off"
          disabled={disabled}
          placeholder="Search or enter a category"
          onFocus={() => {
            if (!disabled) {
              setOpen(true);
            }
          }}
          onChange={(event) => {
            if (disabled) {
              return;
            }
            applyTyped(event.target.value);
            setOpen(true);
          }}
          className={`${inputClass} pr-9 disabled:bg-canvas disabled:text-ink2`}
        />
        {disabled ? null : (
          <button
            type="button"
            aria-label={open ? 'Hide categories' : 'Show categories'}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setOpen((current) => !current)}
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-ink3"
          >
            <ChevronDown size={16} aria-hidden="true" />
          </button>
        )}
      </div>
      {open ? (
        <div
          id={listId}
          role="listbox"
          aria-label="Category"
          className="max-h-72 overflow-y-auto rounded-lg border border-line bg-white"
        >
          {groups.map((group) => (
            <div key={group.id}>
              <p className="px-3 pt-3 text-xs font-medium uppercase tracking-wide text-ink3">
                {group.label}
              </p>
              {group.items.map((item) => (
                <button
                  key={item.name}
                  type="button"
                  role="option"
                  aria-selected={known?.name === item.name}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onPick(item.name, item.prescriptionRequired);
                    setOpen(false);
                  }}
                  className={`flex min-h-11 w-full items-center px-3 text-left text-sm ${known?.name === item.name ? 'bg-action-soft text-action' : 'text-ink'}`}
                >
                  {item.name}
                </button>
              ))}
            </div>
          ))}
          {customOptions.length > 0 ? (
            <div>
              <p className="px-3 pt-3 text-xs font-medium uppercase tracking-wide text-ink3">
                Your categories
              </p>
              {customOptions.map((item) => (
                <button
                  key={item.name}
                  type="button"
                  role="option"
                  aria-selected={savedMatch?.name === item.name}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onPick(item.name, item.prescriptionRequired);
                    setOpen(false);
                  }}
                  className={`flex min-h-11 w-full items-center px-3 text-left text-sm ${savedMatch?.name === item.name ? 'bg-action-soft text-action' : 'text-ink'}`}
                >
                  {item.name}
                </button>
              ))}
            </div>
          ) : null}
          {existing ? (
            <p className="px-3 py-2 text-sm text-ink3">
              Type a new name to add a category, then mark whether a prescription is required.
            </p>
          ) : value.trim().length > 0 ? (
            <p className="px-3 py-2 text-sm text-ink3">
              No saved category with this name. Continue to add a new category.
            </p>
          ) : null}
        </div>
      ) : null}
      {value.trim().length > 0 && !existing ? (
        <label className="mt-1 flex min-h-11 items-start gap-2 text-sm text-ink">
          <input
            type="checkbox"
            disabled={disabled}
            className="mt-1"
            checked={prescriptionRequired}
            onChange={(event) => onPrescription(event.target.checked)}
          />
          <span>
            Prescription required
            <span className="block text-sm text-ink3">
              Billing asks for a prescription on products in this category.
            </span>
          </span>
        </label>
      ) : existing ? (
        <p className="text-sm text-ink3">
          {existing.prescriptionRequired
            ? 'Billing asks for a prescription for this category.'
            : 'Billing does not ask for a prescription for this category.'}
        </p>
      ) : null}
      {error ? (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      ) : null}
    </div>
  );
}

const inputClass =
  'min-h-[44px] w-full rounded-lg border border-line px-3 text-base text-ink outline-none focus:border-action';
