import type { InventoryReport } from '@optiworld/shared';
import { useState } from 'react';

import { formatDateTime, formatRupee } from './dashboard-format';
import { ReportSection, ReportTable, toneFor, type ReportCell } from './ReportTable';

export function InventorySections({
  report,
  quietDays,
  onQuietDays,
}: {
  report: InventoryReport;
  quietDays: number;
  onQuietDays: (days: number) => void;
}): React.ReactElement {
  const [draft, setDraft] = useState(String(quietDays));
  return (
    <div className="grid gap-4">
      <ReportSection
        title="Stock valuation"
        tone="teal"
        note={
          report.stockValue.missingCost > 0
            ? `On hand at cost ${formatRupee(report.stockValue.cost)}. On hand at sale price ${formatRupee(report.stockValue.sale)}. ${report.stockValue.missingCost} product${report.stockValue.missingCost === 1 ? '' : 's'} have no cost price.`
            : `On hand at cost ${formatRupee(report.stockValue.cost)}. On hand at sale price ${formatRupee(report.stockValue.sale)}.`
        }
      >
        <ReportTable
          tone="teal"
          columns={['Product', 'Code', 'Quantity', 'Cost value', 'Sale value']}
          empty="No stock on hand."
          rows={report.valuation.map((row) => [
            { text: row.productName, className: 'font-medium text-ink' },
            { text: row.priceCode, className: 'text-ink2' },
            { text: String(row.quantity) },
            costValue(row.costValue, row.costMissing),
            money(row.saleValue, 'Sale'),
          ])}
        />
      </ReportSection>
      <ReportSection
        title="Low stock and reorder"
        tone="amber"
        note="Products at or under their threshold, and how many to add to reach it."
      >
        <ReportTable
          tone="amber"
          columns={['Product', 'Code', 'Quantity', 'Threshold', 'Reorder']}
          empty="No product is at or under its threshold."
          rows={report.reorder.map((row) => [
            { text: row.productName, className: 'font-medium text-ink' },
            { text: row.priceCode, className: 'text-ink2' },
            {
              text: String(row.quantity),
              className: row.quantity <= 0 ? 'font-medium text-danger' : 'text-ink',
            },
            { text: String(row.threshold) },
            { text: String(row.reorder), className: 'font-medium text-amber' },
          ])}
        />
      </ReportSection>
      <ReportSection
        title="Movement ledger"
        tone="navy"
        note="Each stock movement in this period. Sale is out. Received and opening stock are in. Damaged, lost, and corrections are adjustments."
      >
        <ReportTable
          tone="navy"
          columns={['When', 'Product', 'Kind', 'Quantity', 'Balance', 'Reason', 'By']}
          empty="No stock movement in this period."
          rows={report.ledger.map((row) => [
            { text: formatDateTime(row.at), className: 'text-ink2' },
            { text: row.productName },
            { text: row.kind, className: kindClass(row.kind) },
            {
              text: String(row.quantity),
              className: row.quantity < 0 ? 'font-medium text-danger' : 'font-medium text-teal',
            },
            { text: String(row.balance) },
            { text: row.note ?? '—', className: 'text-ink2' },
            { text: row.by ?? '—', className: 'text-ink2' },
          ])}
        />
      </ReportSection>
      <ReportSection
        title="Dead stock"
        tone="rose"
        note="Still in stock, with no sale in the quiet period ending on the To date."
      >
        <form
          className="flex flex-wrap items-end gap-3 border-b border-line px-4 py-3"
          onSubmit={(event) => {
            event.preventDefault();
            applyQuiet(draft, onQuietDays);
          }}
        >
          <label className="grid gap-1 text-xs text-ink2">
            Quiet period (days)
            <input
              type="number"
              min={1}
              max={365}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={() => applyQuiet(draft, onQuietDays)}
              className="h-11 w-28 rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none focus:border-action"
            />
          </label>
          <button
            type="submit"
            className="h-11 rounded-lg border border-line bg-white px-4 text-sm font-medium text-ink2"
          >
            Apply
          </button>
        </form>
        <ReportTable
          tone="rose"
          columns={['Product', 'Code', 'Quantity', 'Last sale']}
          empty="No stock has been this quiet."
          rows={report.deadStock.map((row) => [
            { text: row.productName, className: 'font-medium text-ink' },
            { text: row.priceCode, className: 'text-ink2' },
            { text: String(row.quantity) },
            {
              text: row.lastSaleAt ? formatDateTime(row.lastSaleAt) : 'Never',
              className: 'text-ink2',
            },
          ])}
        />
      </ReportSection>
    </div>
  );
}

function applyQuiet(draft: string, onQuietDays: (days: number) => void): void {
  const next = Number(draft);
  if (Number.isInteger(next) && next >= 1 && next <= 365) {
    onQuietDays(next);
  }
}

function money(value: string, column: string): ReportCell {
  return { text: formatRupee(value), className: toneFor(column, value) };
}

function costValue(value: string | null, missing: boolean): ReportCell {
  if (missing || value === null) {
    return { text: 'No cost price', className: 'font-medium text-amber' };
  }
  return money(value, 'Cost');
}

function kindClass(kind: 'In' | 'Out' | 'Adjustment'): string {
  if (kind === 'Out') {
    return 'font-medium text-amber';
  }
  if (kind === 'In') {
    return 'font-medium text-teal';
  }
  return 'font-medium text-ink2';
}
