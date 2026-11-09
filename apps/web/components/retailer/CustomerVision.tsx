'use client';

import {
  prescriptionIssues,
  type PrescriptionReading,
  type SavedPrescription,
} from '@optiworld/shared';
import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';

import {
  loadCustomerPrescriptions,
  updateCustomerPrescription,
  saveCustomerPrescription,
} from './customers-api';
import { emptyItemPrescription } from './item-prescription';
import { PrescriptionFields } from './PrescriptionFields';
import { formatShortDate } from './dashboard-format';

export function CustomerVision({ customerId }: { customerId: string }): React.ReactElement {
  const { data: session } = useSession();
  const token = session?.accessToken;
  const [rows, setRows] = useState<SavedPrescription[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PrescriptionReading>(emptyItemPrescription());
  const [issues, setIssues] = useState<ReturnType<typeof prescriptionIssues>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!token) {
      return;
    }
    let active = true;
    void loadCustomerPrescriptions(token, customerId)
      .then((loaded) => {
        if (!active) {
          return;
        }
        const ordered = [...loaded].sort((left, right) =>
          right.createdAt.localeCompare(left.createdAt),
        );
        setRows(ordered);
        const latest = ordered[0];
        setSelectedId(latest?.id ?? null);
        setDraft(latest ? readingOf(latest) : emptyItemPrescription());
        setError(null);
      })
      .catch((reason: unknown) => {
        if (active) {
          setRows([]);
          setError(reason instanceof Error ? reason.message : 'Prescriptions could not be loaded');
        }
      });
    return () => {
      active = false;
    };
  }, [token, customerId]);

  const selected = rows?.find((row) => row.id === selectedId) ?? rows?.[0] ?? null;

  function choose(id: string): void {
    const next = rows?.find((row) => row.id === id);
    if (!next) {
      return;
    }
    setSelectedId(next.id);
    setDraft(readingOf(next));
    setIssues({});
  }

  async function save(): Promise<void> {
    if (!token || !selected) {
      return;
    }
    const found = prescriptionIssues(draft);
    setIssues(found);
    if (Object.keys(found).length > 0) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved =
        selected.source === 'SAVED'
          ? await updateCustomerPrescription(token, customerId, selected.id, draft)
          : await saveCustomerPrescription(token, customerId, draft);
      setRows((current) => {
        const rest = (current ?? []).filter((row) => row.id !== saved.id);
        return [saved, ...rest].sort((left, right) =>
          right.createdAt.localeCompare(left.createdAt),
        );
      });
      setSelectedId(saved.id);
      setDraft(readingOf(saved));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The prescription could not be saved');
    } finally {
      setSaving(false);
    }
  }

  if (rows === null && !error) {
    return (
      <div
        className="h-40 animate-pulse rounded-xl border border-line bg-canvas"
        aria-busy="true"
      />
    );
  }

  return (
    <div className="grid max-h-[70vh] grid-rows-[auto_minmax(0,1fr)_auto] gap-3 overflow-hidden rounded-xl border border-line bg-canvas p-3">
      {rows && rows.length > 1 ? (
        <label className="grid gap-1 text-xs text-ink2">
          Earlier prescriptions
          <select
            aria-label="Earlier prescriptions"
            value={selected?.id ?? ''}
            onChange={(event) => choose(event.target.value)}
            className="min-h-11 rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none focus:border-action"
          >
            {rows.map((row, index) => (
              <option key={row.id} value={row.id}>
                {index === 0 ? 'Latest' : 'Earlier'} · {row.summary || 'Prescription'} ·{' '}
                {formatShortDate(row.createdAt)}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <div className="grid min-h-0 content-start gap-3 overflow-y-auto">
        {rows && rows.length === 0 ? (
          <p className="text-sm text-ink2">No prescription records yet.</p>
        ) : (
          <PrescriptionFields draft={draft} issues={issues} onChange={setDraft} />
        )}
        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      {selected ? (
        <div className="flex justify-end">
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="min-h-11 rounded-lg bg-action px-4 text-sm font-medium text-white disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save prescription'}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function readingOf(row: SavedPrescription): PrescriptionReading {
  return { right: row.right, left: row.left, add: row.add, pd: row.pd, notes: row.notes };
}
