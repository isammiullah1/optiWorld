'use client';

export function ReportRange({
  from,
  to,
  onFrom,
  onTo,
  onExport,
  exporting,
}: {
  from: string;
  to: string;
  onFrom: (value: string) => void;
  onTo: (value: string) => void;
  onExport: (format: 'xlsx' | 'pdf') => void;
  exporting: boolean;
}): React.ReactElement {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="grid gap-1 text-xs text-ink3">
        From
        <input
          type="date"
          value={from}
          onChange={(event) => onFrom(event.target.value)}
          className="min-h-[44px] rounded-lg border border-line bg-white px-3 text-sm text-ink"
        />
      </label>
      <label className="grid gap-1 text-xs text-ink3">
        To
        <input
          type="date"
          value={to}
          onChange={(event) => onTo(event.target.value)}
          className="min-h-[44px] rounded-lg border border-line bg-white px-3 text-sm text-ink"
        />
      </label>
      <button
        type="button"
        disabled={exporting}
        onClick={() => onExport('xlsx')}
        className="min-h-[44px] rounded-lg bg-action px-4 text-sm font-medium text-white disabled:opacity-50"
      >
        {exporting ? 'Exporting…' : 'Export Excel'}
      </button>
      <button
        type="button"
        disabled={exporting}
        onClick={() => onExport('pdf')}
        className="min-h-[44px] rounded-lg border border-line bg-white px-4 text-sm font-medium text-ink2 disabled:opacity-50"
      >
        {exporting ? 'Exporting…' : 'Export PDF'}
      </button>
    </div>
  );
}
