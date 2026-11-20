'use client';

import type { LabServiceRow } from '@optiworld/shared';
import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';

import { loadOwnLabServices, saveOwnLabService } from './lab-api';
import { labServiceLook } from './service-look';

export function LabRateCard(): React.ReactElement {
  const { data: session } = useSession();
  const token = session?.accessToken;
  const admin = session?.user.role === 'ADMIN';
  const [rows, setRows] = useState<LabServiceRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');

  function reload(): void {
    if (!token) {
      return;
    }
    void loadOwnLabServices(token)
      .then((next) => {
        setRows(next);
        setError(null);
      })
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : 'The rate card could not be loaded');
      });
  }

  useEffect(() => {
    reload();
  }, [token]);

  return (
    <section className="grid gap-4">
      <div>
        <h1 className="text-xl font-semibold text-ink">Our Services</h1>
        <p className="text-sm text-ink2">
          Prices for the services a shop can tick on a job. A price already copied onto a bill does
          not change.
        </p>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="overflow-x-auto rounded-xl border border-line bg-white">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="bg-navy text-left">
              {['Service', 'Price', 'Offered'].map((heading) => (
                <th
                  key={heading}
                  className="border border-navy px-3 py-2 text-xs font-medium uppercase tracking-wide text-white"
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((row) => (
              <RateRow
                key={row.id}
                row={row}
                editable={admin}
                onSave={async (next) => {
                  if (!token) {
                    return;
                  }
                  await saveOwnLabService(token, row.id, next);
                  reload();
                }}
              />
            ))}
          </tbody>
        </table>
      </div>
      {admin ? (
        <form
          className="flex flex-wrap items-end gap-3 rounded-xl border-2 border-[var(--ow-work)] bg-[var(--ow-work-soft)] p-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (
              !token ||
              !/^\d{1,10}(\.\d{1,2})?$/.test(price.trim()) ||
              name.trim().length === 0
            ) {
              setError('Enter a service name and a price.');
              return;
            }
            void saveOwnLabService(token, null, {
              name: name.trim(),
              price: price.trim(),
              isActive: true,
            })
              .then(() => {
                setName('');
                setPrice('');
                reload();
              })
              .catch((caught: unknown) => {
                setError(
                  caught instanceof Error ? caught.message : 'The service could not be added',
                );
              });
          }}
        >
          <label className="grid gap-1 text-xs text-ink2">
            New service
            <span className="flex items-center gap-2">
              <ServiceGlyph name={name || 'Service'} />
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="min-h-[44px] rounded-lg border border-line bg-white px-3 text-sm text-ink"
              />
            </span>
          </label>
          <label className="grid gap-1 text-xs text-ink2">
            Price
            <input
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              inputMode="decimal"
              className="min-h-[44px] w-32 rounded-lg border border-line bg-white px-3 text-sm text-ink"
            />
          </label>
          <button
            type="submit"
            className="min-h-[44px] rounded-lg bg-action px-4 text-sm font-medium text-white"
          >
            Add service
          </button>
        </form>
      ) : (
        <p className="text-sm text-ink2">A laboratory admin edits these prices.</p>
      )}
    </section>
  );
}

function ServiceGlyph({ name }: { name: string }): React.ReactElement {
  const look = labServiceLook(name);
  const Icon = look.icon;
  return (
    <span
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border bg-white ${look.tone}`}
      title={name}
    >
      <Icon size={16} aria-hidden="true" />
    </span>
  );
}

function RateRow({
  row,
  editable,
  onSave,
}: {
  row: LabServiceRow;
  editable: boolean;
  onSave: (input: { name: string; price: string; isActive: boolean }) => Promise<void>;
}): React.ReactElement {
  const [price, setPrice] = useState(row.price);
  const [active, setActive] = useState(row.isActive);
  return (
    <tr>
      <td className="border border-line px-3 py-2 text-sm text-ink">
        <span className="flex items-center gap-2">
          <ServiceGlyph name={row.name} />
          {row.name}
        </span>
      </td>
      <td className="border border-line px-3 py-2">
        <input
          value={price}
          disabled={!editable}
          onChange={(event) => setPrice(event.target.value)}
          onBlur={() => {
            if (price !== row.price && /^\d{1,10}(\.\d{1,2})?$/.test(price)) {
              void onSave({ name: row.name, price, isActive: active });
            }
          }}
          className="h-10 w-28 rounded-lg border border-line px-2 text-sm text-ink disabled:bg-canvas"
        />
      </td>
      <td className="border border-line px-3 py-2">
        <label className="flex min-h-10 items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={active}
            disabled={!editable}
            onChange={(event) => {
              const next = event.target.checked;
              setActive(next);
              void onSave({ name: row.name, price, isActive: next });
            }}
            className="h-4 w-4 accent-action"
          />
          Offered
        </label>
      </td>
    </tr>
  );
}
