'use client';

import {
  LAB_INVENTORY_CATEGORIES,
  SaveLabInventorySchema,
  type LabInventoryItem,
} from '@optiworld/shared';
import { useSession } from 'next-auth/react';
import { useCallback, useEffect, useState } from 'react';

import { adjustLabInventory, loadLabBoard, loadLabInventory, saveLabInventory } from './lab-api';

type DrawerMode = 'create' | 'edit' | 'adjust';

export function LabInventory(): React.ReactElement {
  const { data: session, status } = useSession();
  const token = session?.accessToken;
  const [items, setItems] = useState<LabInventoryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<DrawerMode | null>(null);
  const [selected, setSelected] = useState<LabInventoryItem | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    if (!token) {
      return;
    }
    try {
      setItems(await loadLabInventory(token));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Inventory could not be loaded');
    }
  }, [token]);

  useEffect(() => {
    if (status !== 'loading') {
      void refresh();
    }
  }, [refresh, status]);

  return (
    <section className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-ink2">Lens blanks, coatings, and materials on hand.</p>
        <button
          type="button"
          className="min-h-11 rounded-lg bg-action px-4 text-sm font-medium text-white"
          onClick={() => {
            setSelected(null);
            setMode('create');
          }}
        >
          Add item
        </button>
      </div>
      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger"
        >
          {error}
        </p>
      ) : null}
      {items === null ? (
        <div className="h-40 animate-pulse rounded-xl border border-line bg-white" />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-white">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="text-xs uppercase text-ink3">
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Category</th>
                <th className="px-3 py-2 font-medium">Qty</th>
                <th className="px-3 py-2 font-medium">Unit</th>
                <th className="px-3 py-2 font-medium">Reorder level</th>
                <th className="px-3 py-2 font-medium">Stock</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-sm text-ink3">
                    No inventory items yet.
                  </td>
                </tr>
              ) : null}
              {items.map((item) => (
                <tr key={item.id} className="border-t border-line text-xs hover:bg-canvas">
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      className="font-medium text-ink"
                      onClick={() => {
                        setSelected(item);
                        setMode('edit');
                      }}
                    >
                      {item.name}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-ink2">{item.category}</td>
                  <td className="px-3 py-2">{item.quantity}</td>
                  <td className="px-3 py-2 text-ink2">{item.unit}</td>
                  <td className="px-3 py-2">{item.reorderLevel}</td>
                  <td className="px-3 py-2">
                    {item.lowStock ? (
                      <span className="rounded-full bg-amber-soft px-2 py-0.5 text-xs font-medium text-amber">
                        Low stock
                      </span>
                    ) : (
                      <span className="text-ink3">In stock</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      className="min-h-11 text-action"
                      onClick={() => {
                        setSelected(item);
                        setMode('adjust');
                      }}
                    >
                      Adjust stock
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {mode === 'create' || (mode === 'edit' && selected) ? (
        <ItemDrawer
          item={mode === 'edit' ? selected : null}
          onClose={() => setMode(null)}
          onSaved={async () => {
            setMode(null);
            await refresh();
          }}
        />
      ) : null}
      {mode === 'adjust' && selected ? (
        <AdjustDrawer
          item={selected}
          onClose={() => setMode(null)}
          onSaved={async () => {
            setMode(null);
            await refresh();
          }}
        />
      ) : null}
    </section>
  );
}

function ItemDrawer({
  item,
  onClose,
  onSaved,
}: {
  item: LabInventoryItem | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}): React.ReactElement {
  const { data: session } = useSession();
  const [name, setName] = useState(item?.name ?? '');
  const [category, setCategory] = useState(item?.category ?? 'Lens blank');
  const [quantity, setQuantity] = useState(item?.quantity ?? '');
  const [unit, setUnit] = useState(item?.unit ?? 'pcs');
  const [reorderLevel, setReorderLevel] = useState(item?.reorderLevel ?? '0');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const categories = LAB_INVENTORY_CATEGORIES.includes(
    category as (typeof LAB_INVENTORY_CATEGORIES)[number],
  )
    ? LAB_INVENTORY_CATEGORIES
    : [category, ...LAB_INVENTORY_CATEGORIES];

  return (
    <aside
      className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-line bg-white"
      aria-label={item ? 'Edit item' : 'Add item'}
    >
      <form
        className="flex flex-1 flex-col"
        onSubmit={(event) => {
          event.preventDefault();
          const token = session?.accessToken;
          if (!token) {
            return;
          }
          const parsed = SaveLabInventorySchema.safeParse({
            name,
            category,
            quantity,
            unit,
            reorderLevel,
          });
          if (!parsed.success) {
            setError(parsed.error.issues[0]?.message ?? 'Check the item details.');
            return;
          }
          setBusy(true);
          void saveLabInventory(token, parsed.data, item?.id)
            .then(() => onSaved())
            .catch((caught: unknown) =>
              setError(caught instanceof Error ? caught.message : 'The item could not be saved'),
            )
            .finally(() => setBusy(false));
        }}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-md font-semibold">{item ? 'Edit item' : 'Add item'}</h2>
          <button type="button" className="min-h-11 px-3 text-sm text-ink2" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="grid flex-1 content-start gap-3 overflow-y-auto px-4 py-4">
          <Field label="Name" value={name} onChange={setName} />
          <label className="grid gap-1 text-xs text-ink2">
            Category
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="min-h-11 rounded-lg border border-line px-3 text-sm text-ink"
            >
              {categories.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <Field label="Quantity" value={quantity} onChange={setQuantity} />
          <Field label="Unit" value={unit} onChange={setUnit} />
          <Field label="Reorder level" value={reorderLevel} onChange={setReorderLevel} />
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
        </div>
        <div className="border-t border-line p-4">
          <button
            type="submit"
            disabled={busy}
            className="min-h-11 rounded-lg bg-action px-4 text-sm font-medium text-white disabled:opacity-50"
          >
            Save item
          </button>
        </div>
      </form>
    </aside>
  );
}

function AdjustDrawer({
  item,
  onClose,
  onSaved,
}: {
  item: LabInventoryItem;
  onClose: () => void;
  onSaved: () => Promise<void>;
}): React.ReactElement {
  const { data: session } = useSession();
  const [kind, setKind] = useState<'RECEIVED' | 'USAGE'>('RECEIVED');
  const [quantity, setQuantity] = useState('');
  const [occurredOn, setOccurredOn] = useState(new Date().toISOString().slice(0, 10));
  const [supplier, setSupplier] = useState('');
  const [labJobId, setLabJobId] = useState('');
  const [jobs, setJobs] = useState<{ id: string; referenceNumber: string; patientName: string }[]>(
    [],
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const token = session?.accessToken;
    if (!token) {
      return;
    }
    void loadLabBoard(token, {})
      .then((board) => setJobs(board.jobs))
      .catch(() => undefined);
  }, [session?.accessToken]);

  return (
    <aside
      className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-line bg-white"
      aria-label="Adjust stock"
    >
      <form
        className="flex flex-1 flex-col"
        onSubmit={(event) => {
          event.preventDefault();
          const token = session?.accessToken;
          if (!token) {
            return;
          }
          setBusy(true);
          const body =
            kind === 'RECEIVED'
              ? { kind, quantity, occurredOn, supplier }
              : { kind, quantity, labJobId };
          void adjustLabInventory(token, item.id, body)
            .then(() => onSaved())
            .catch((caught: unknown) =>
              setError(caught instanceof Error ? caught.message : 'Stock could not be adjusted'),
            )
            .finally(() => setBusy(false));
        }}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-md font-semibold">Adjust {item.name}</h2>
          <button type="button" className="min-h-11 px-3 text-sm text-ink2" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="grid flex-1 content-start gap-3 px-4 py-4">
          <div className="flex gap-2">
            <button
              type="button"
              className={`min-h-11 rounded-lg px-3 text-sm ${kind === 'RECEIVED' ? 'bg-action text-white' : 'border border-line text-ink2'}`}
              onClick={() => setKind('RECEIVED')}
            >
              Add received
            </button>
            <button
              type="button"
              className={`min-h-11 rounded-lg px-3 text-sm ${kind === 'USAGE' ? 'bg-action text-white' : 'border border-line text-ink2'}`}
              onClick={() => setKind('USAGE')}
            >
              Record usage
            </button>
          </div>
          <Field label="Quantity" value={quantity} onChange={setQuantity} />
          {kind === 'RECEIVED' ? (
            <>
              <label className="grid gap-1 text-xs text-ink2">
                Date
                <input
                  type="date"
                  value={occurredOn}
                  onChange={(event) => setOccurredOn(event.target.value)}
                  className="min-h-11 rounded-lg border border-line px-3 text-sm"
                />
              </label>
              <Field label="Supplier" value={supplier} onChange={setSupplier} />
            </>
          ) : (
            <label className="grid gap-1 text-xs text-ink2">
              Linked job
              <select
                value={labJobId}
                onChange={(event) => setLabJobId(event.target.value)}
                className="min-h-11 rounded-lg border border-line px-3 text-sm text-ink"
              >
                <option value="">No linked job</option>
                {jobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.referenceNumber} · {job.patientName}
                  </option>
                ))}
              </select>
            </label>
          )}
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
        </div>
        <div className="border-t border-line p-4">
          <button
            type="submit"
            disabled={busy}
            className="min-h-11 rounded-lg bg-action px-4 text-sm font-medium text-white disabled:opacity-50"
          >
            Save adjustment
          </button>
        </div>
      </form>
    </aside>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}): React.ReactElement {
  return (
    <label className="grid gap-1 text-xs text-ink2">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-11 rounded-lg border border-line px-3 text-sm text-ink focus:border-action focus:outline-none"
      />
    </label>
  );
}
