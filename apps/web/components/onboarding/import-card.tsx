'use client';

import { useState } from 'react';

import type { ImportResult } from '@optiworld/shared';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

type ImportCardProps = {
  kind: 'customers' | 'inventory' | 'dues';
  title: string;
  columns: string;
  accessToken: string;
};

export function ImportCard({
  kind,
  title,
  columns,
  accessToken,
}: ImportCardProps): React.ReactElement {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function preview(next: File): Promise<void> {
    setFile(next);
    setMessage(null);
    setBusy(true);
    try {
      setResult(await postWorkbook(accessToken, kind, await fileBase64(next), true));
    } catch (error) {
      setResult(null);
      setMessage(error instanceof Error ? error.message : 'The file could not be read.');
    } finally {
      setBusy(false);
    }
  }

  async function commit(): Promise<void> {
    if (!file) {
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const imported = await postWorkbook(accessToken, kind, await fileBase64(file), false);
      setResult(imported);
      setMessage(
        imported.imported > 0
          ? `Imported ${imported.imported} row${imported.imported === 1 ? '' : 's'}.`
          : 'Nothing was imported.',
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The import could not finish.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="rounded-xl border border-line bg-white p-4">
      <h2 className="text-md font-medium text-ink">{title}</h2>
      <p className="mt-1 text-xs text-ink3">{columns}</p>
      <button
        type="button"
        className="mt-3 text-sm text-action"
        onClick={() => {
          void downloadTemplate(accessToken, kind);
        }}
      >
        Download Excel template
      </button>
      <label
        className="mt-3 flex min-h-[88px] cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-line px-3 py-4 text-center text-sm text-ink2"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          const dropped = event.dataTransfer.files[0];
          if (dropped) {
            void preview(dropped);
          }
        }}
      >
        Drop an Excel file here, or browse
        <input
          className="sr-only"
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          aria-label={`${title} file`}
          onChange={(event) => {
            const chosen = event.target.files?.[0];
            if (chosen) {
              void preview(chosen);
            }
          }}
        />
      </label>
      {result && result.rows.length > 0 ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr>
                {result.columns.map((column) => (
                  <th
                    key={column}
                    className="border-b border-line px-2 py-1 text-xs uppercase text-ink3"
                  >
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row, index) => (
                <tr key={`${kind}-${index}`}>
                  {row.map((value, cell) => (
                    <td
                      key={`${index}-${cell}`}
                      className="border-b border-line px-2 py-1 text-ink"
                    >
                      {value}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {result && result.errors.length > 0 ? (
        <ul className="mt-3 grid gap-1">
          {result.errors.map((error) => (
            <li key={`${error.row}-${error.message}`} className="text-sm text-danger" role="alert">
              Row {error.row}: {error.message}
            </li>
          ))}
        </ul>
      ) : null}
      {message ? (
        <p className="mt-2 text-sm text-ink2" role="status">
          {message}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={!file || busy}
          aria-busy={busy}
          className="min-h-[44px] rounded-lg bg-navy px-4 text-sm font-medium text-white disabled:opacity-60"
          onClick={() => {
            void commit();
          }}
        >
          {busy ? 'Working…' : 'Import'}
        </button>
        {result && result.errors.length > 0 ? (
          <button
            type="button"
            className="min-h-[44px] text-sm text-action"
            onClick={() => downloadErrors(kind, result)}
          >
            Download error report
          </button>
        ) : null}
      </div>
    </article>
  );
}

async function postWorkbook(
  accessToken: string,
  kind: ImportCardProps['kind'],
  fileBase64: string,
  preview: boolean,
): Promise<ImportResult> {
  const response = await fetch(`${API_BASE}/api/v1/import/${kind}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ fileBase64, preview }),
  });
  const payload: unknown = await response.json();
  if (!response.ok || !isImport(payload)) {
    throw new Error(readError(payload));
  }
  return payload.data;
}

async function downloadTemplate(accessToken: string, kind: ImportCardProps['kind']): Promise<void> {
  const response = await fetch(`${API_BASE}/api/v1/import/templates/${kind}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    return;
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${kind}-template.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadErrors(kind: string, result: ImportResult): void {
  const lines = ['Row,Message', ...result.errors.map((error) => `${error.row},"${error.message}"`)];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${kind}-errors.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function fileBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = typeof reader.result === 'string' ? reader.result.split(',')[1] : '';
      if (!value) {
        reject(new Error('The file could not be read.'));
        return;
      }
      resolve(value);
    };
    reader.onerror = () => reject(new Error('The file could not be read.'));
    reader.readAsDataURL(file);
  });
}

function isImport(value: unknown): value is { success: true; data: ImportResult } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'success' in value &&
    value.success === true &&
    'data' in value
  );
}

function readError(payload: unknown): string {
  if (
    typeof payload === 'object' &&
    payload !== null &&
    'error' in payload &&
    typeof payload.error === 'object' &&
    payload.error !== null &&
    'message' in payload.error &&
    typeof payload.error.message === 'string'
  ) {
    return payload.error.message;
  }
  return 'The import could not finish.';
}
