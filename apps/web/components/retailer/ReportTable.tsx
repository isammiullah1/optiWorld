export type ReportCell = {
  text: string;
  note?: string;
  className?: string;
};

export type ReportTone = 'blue' | 'teal' | 'amber' | 'navy' | 'slate' | 'sand' | 'rose';

const TONES: Record<ReportTone, { section: string; band: string; header: string; alt: string }> = {
  blue: {
    section: 'border-action bg-action-soft',
    band: 'border-action bg-[color-mix(in_srgb,var(--ow-blue)_14%,white)]',
    header: 'bg-[color-mix(in_srgb,var(--ow-blue)_22%,white)] text-ink',
    alt: 'bg-[color-mix(in_srgb,var(--ow-blue)_8%,white)]',
  },
  teal: {
    section: 'border-teal bg-[color-mix(in_srgb,var(--ow-teal)_20%,white)]',
    band: 'border-teal bg-[color-mix(in_srgb,var(--ow-teal)_28%,white)]',
    header: 'bg-[color-mix(in_srgb,var(--ow-teal)_34%,white)] text-ink',
    alt: 'bg-[color-mix(in_srgb,var(--ow-teal)_12%,white)]',
  },
  amber: {
    section: 'border-amber bg-amber-soft',
    band: 'border-amber bg-[color-mix(in_srgb,var(--ow-amber)_16%,white)]',
    header: 'bg-[color-mix(in_srgb,var(--ow-amber)_22%,white)] text-ink',
    alt: 'bg-[color-mix(in_srgb,var(--ow-amber)_9%,white)]',
  },
  navy: {
    section: 'border-navy bg-[color-mix(in_srgb,var(--ow-navy)_14%,white)]',
    band: 'border-navy bg-[color-mix(in_srgb,var(--ow-navy)_20%,white)]',
    header: 'bg-[color-mix(in_srgb,var(--ow-navy)_26%,white)] text-ink',
    alt: 'bg-[color-mix(in_srgb,var(--ow-navy)_8%,white)]',
  },
  slate: {
    section: 'border-ink2 bg-[color-mix(in_srgb,var(--ow-ink2)_14%,white)]',
    band: 'border-ink2 bg-[color-mix(in_srgb,var(--ow-ink2)_20%,white)]',
    header: 'bg-[color-mix(in_srgb,var(--ow-ink2)_26%,white)] text-ink',
    alt: 'bg-[color-mix(in_srgb,var(--ow-ink2)_8%,white)]',
  },
  sand: {
    section: 'border-amber bg-[color-mix(in_srgb,var(--ow-amber)_24%,white)]',
    band: 'border-amber bg-[color-mix(in_srgb,var(--ow-amber)_30%,white)]',
    header: 'bg-[color-mix(in_srgb,var(--ow-amber)_34%,white)] text-ink',
    alt: 'bg-[color-mix(in_srgb,var(--ow-amber)_14%,white)]',
  },
  rose: {
    section: 'border-danger bg-danger-soft',
    band: 'border-danger bg-[color-mix(in_srgb,var(--ow-red)_14%,white)]',
    header: 'bg-[color-mix(in_srgb,var(--ow-red)_18%,white)] text-ink',
    alt: 'bg-[color-mix(in_srgb,var(--ow-red)_8%,white)]',
  },
};

export function ReportSection({
  title,
  note,
  tone,
  children,
}: {
  title: string;
  note?: string;
  tone?: ReportTone;
  children: React.ReactNode;
}): React.ReactElement {
  const paint = tone ? TONES[tone] : null;
  return (
    <section
      className={`overflow-hidden rounded-xl border-2 ${paint ? paint.section : 'border border-line bg-white'}`}
    >
      <div className={`border-b px-4 py-3 ${paint ? paint.band : 'border-line'}`}>
        <h2 className="text-md font-semibold text-ink">{title}</h2>
        {note ? <p className="mt-1 text-sm text-ink2">{note}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function ReportTable({
  columns,
  rows,
  empty,
  tone,
}: {
  columns: readonly string[];
  rows: readonly (readonly ReportCell[])[];
  empty: string;
  tone?: ReportTone;
}): React.ReactElement {
  const paint = tone ? TONES[tone] : null;
  return (
    <div className="max-h-[28rem] overflow-auto">
      <table className="w-full min-w-[720px] border-collapse text-left">
        <thead className="sticky top-0">
          <tr className={paint ? paint.header : 'bg-navy text-left'}>
            {columns.map((heading) => (
              <th
                key={heading}
                className={`border px-3 py-2 text-xs font-medium uppercase tracking-wide ${
                  paint ? 'border-white/70 text-ink' : 'border-navy text-white'
                }`}
              >
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="border border-line px-3 py-6 text-center text-sm text-ink2"
              >
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row, index) => (
              <tr
                key={rowKey(row, index)}
                className={
                  paint
                    ? `${index % 2 === 0 ? 'bg-white' : paint.alt} hover:bg-white`
                    : 'hover:bg-canvas'
                }
              >
                {row.map((cell, cellIndex) => (
                  <td
                    key={`${columns[cellIndex] ?? 'cell'}-${cellIndex}`}
                    className={`border border-line px-3 py-2 text-sm ${cell.className ?? 'text-ink'}`}
                  >
                    <span className="block">{cell.text}</span>
                    {cell.note ? (
                      <span className="block text-xs font-medium text-amber">{cell.note}</span>
                    ) : null}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function rowKey(row: readonly ReportCell[], index: number): string {
  const first = row[0]?.text ?? 'row';
  return `${first}-${index}`;
}

export function toneFor(column: string, value: string): string {
  const negative = value.trim().startsWith('-') || value.trim().startsWith('₨ -');
  const lower = column.toLowerCase();
  if (lower.includes('profit') || lower.includes('margin')) {
    return negative ? 'font-semibold text-danger' : 'font-semibold text-teal';
  }
  if (
    lower.includes('cost') ||
    lower.includes('discount') ||
    lower.includes('outstanding') ||
    lower === 'credit'
  ) {
    return 'font-medium text-amber';
  }
  if (lower.includes('sale') || lower.includes('revenue')) {
    return 'font-medium text-action';
  }
  if (lower === 'cash') {
    return 'font-medium text-teal';
  }
  if (lower.includes('return')) {
    return 'font-medium text-danger';
  }
  if (lower === 'status' && /cancel|removed|overdue/i.test(value)) {
    return 'font-medium text-danger';
  }
  return 'text-ink';
}
