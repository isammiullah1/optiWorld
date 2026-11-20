import type { SalesReport } from '@optiworld/shared';

import { formatRupee, formatShortDate } from './dashboard-format';
import { ReportSection, ReportTable, toneFor, type ReportCell } from './ReportTable';

export function SalesSections({ report }: { report: SalesReport }): React.ReactElement {
  const owner = report.profit !== null;
  return (
    <div className="grid gap-4">
      <ReportSection
        title="Daily summary"
        tone="blue"
        note="Sale is the bill total, which already includes the discount and any delivery charge. Profit is that sale, minus item cost, minus issued lab bills."
      >
        <ReportTable
          tone="blue"
          columns={
            owner
              ? [
                  'Date',
                  'Bills',
                  'Sale',
                  'Discount',
                  'Cash',
                  'Credit',
                  'Cost',
                  'Lab expense',
                  'Profit',
                  'Margin',
                ]
              : ['Date', 'Bills', 'Sale', 'Discount', 'Cash', 'Credit']
          }
          empty="No sales in this period."
          rows={report.dailySummary.map((row) => {
            const cells: ReportCell[] = [
              { text: formatShortDate(`${row.date}T00:00:00.000Z`) },
              { text: String(row.invoiceCount) },
              money(row.sale, 'Sale'),
              money(row.discount, 'Discount'),
              money(row.cash, 'Cash'),
              money(row.credit, 'Credit'),
            ];
            if (owner) {
              cells.push(
                costCell(row.cost, row.costMissing),
                money(row.labExpense, 'Cost'),
                money(row.profit, 'Profit'),
                marginCell(row.margin),
              );
            }
            return cells;
          })}
        />
      </ReportSection>
      <ReportSection
        title="By product"
        tone="teal"
        note="Sale is the line price before the bill discount. Profit takes off this line's share of the discount and of any issued lab bill. A line without a stock batch is Uncategorised."
      >
        <ReportTable
          tone="teal"
          columns={
            owner
              ? ['Product', 'Category', 'Quantity', 'Sale', 'Discount', 'Cost', 'Profit', 'Margin']
              : ['Product', 'Category', 'Quantity', 'Sale', 'Discount']
          }
          empty="No products sold in this period."
          rows={report.byProduct.map((row) => {
            const cells: ReportCell[] = [
              { text: row.productName, className: 'font-medium text-ink' },
              { text: row.category, className: 'text-ink2' },
              { text: String(row.quantity) },
              money(row.sale, 'Sale'),
              money(row.discount, 'Discount'),
            ];
            if (owner) {
              cells.push(
                costCell(row.cost, row.costMissing),
                money(row.profit, 'Profit'),
                marginCell(row.margin),
              );
            }
            return cells;
          })}
        />
      </ReportSection>
      <ReportSection title="By category" tone="amber" note="Category comes from the stock batch.">
        <ReportTable
          tone="amber"
          columns={
            owner
              ? ['Category', 'Quantity', 'Sale', 'Discount', 'Cost', 'Profit', 'Margin']
              : ['Category', 'Quantity', 'Sale', 'Discount']
          }
          empty="No categories in this period."
          rows={report.byCategory.map((row) => {
            const cells: ReportCell[] = [
              { text: row.category, className: 'font-medium text-ink' },
              { text: String(row.quantity) },
              money(row.sale, 'Sale'),
              money(row.discount, 'Discount'),
            ];
            if (owner) {
              cells.push(
                costCell(row.cost, row.costMissing),
                money(row.profit, 'Profit'),
                marginCell(row.margin),
              );
            }
            return cells;
          })}
        />
      </ReportSection>
      <div className="grid gap-4 lg:grid-cols-2">
        <ReportSection title="By payment method" tone="navy">
          <ReportTable
            tone="navy"
            columns={['Method', 'Bills', 'Sale']}
            empty="No payments in this period."
            rows={report.byPayment.map((row) => [
              { text: row.label },
              { text: String(row.invoiceCount) },
              money(row.sale, 'Sale'),
            ])}
          />
        </ReportSection>
        <ReportSection
          title="By cashier"
          tone="slate"
          note="The cashier is the person who prepared the bill. A bill with no record shows as Unknown."
        >
          <ReportTable
            tone="slate"
            columns={['Cashier', 'Bills', 'Sale']}
            empty="No cashier is recorded for these bills."
            rows={report.byCashier.map((row) => [
              { text: row.name },
              { text: String(row.invoiceCount) },
              money(row.sale, 'Sale'),
            ])}
          />
        </ReportSection>
      </div>
      <ReportSection
        title="Discounts"
        tone="sand"
        note="Each bill that has a discount, with the discount and the bill total."
      >
        <ReportTable
          tone="sand"
          columns={['Invoice', 'Customer', 'Discount', 'Bill total']}
          empty="No discounts in this period."
          rows={report.discounts.map((row) => [
            { text: `#${row.invoiceNumber}`, className: 'font-medium text-ink' },
            { text: row.customerName },
            money(row.discount, 'Discount'),
            money(row.total, 'Sale'),
          ])}
        />
      </ReportSection>
      <ReportSection
        title="Returns"
        tone="rose"
        note="Cancelled bills and removed bills. These amounts are already out of the period sale."
      >
        <ReportTable
          tone="rose"
          columns={['Invoice', 'Customer', 'Status', 'Return', 'Reason', 'By']}
          empty="No cancelled or removed bills in this period."
          rows={report.returns.map((row) => [
            { text: `#${row.invoiceNumber}`, className: 'font-medium text-ink' },
            { text: row.customerName },
            {
              text: row.kind === 'REMOVED' ? 'Removed' : 'Cancelled',
              className: toneFor('Status', row.kind === 'REMOVED' ? 'Removed' : 'Cancelled'),
            },
            money(row.amount, 'Return'),
            { text: row.reason ?? '—', className: 'text-ink2' },
            { text: row.by ?? '—', className: 'text-ink2' },
          ])}
        />
      </ReportSection>
    </div>
  );
}

function money(value: string | null, column: string): ReportCell {
  return {
    text: value === null ? '—' : formatRupee(value),
    className: value === null ? 'text-ink3' : toneFor(column, value),
  };
}

function costCell(value: string | null, missing: boolean): ReportCell {
  return {
    text: value === null ? '—' : formatRupee(value),
    note: missing ? 'No cost price' : undefined,
    className: value === null ? 'text-ink3' : toneFor('Cost', value),
  };
}

function marginCell(value: string | null): ReportCell {
  const text = value === null ? '—' : `${value}%`;
  return {
    text,
    className: value === null ? 'text-ink3' : toneFor('Margin', value),
  };
}
