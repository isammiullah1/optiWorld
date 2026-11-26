'use client';

import { centsToMoney, moneyToCents, type PosReceipt } from '@optiworld/shared';

import { formatRupee } from './dashboard-format';

export function CostingSummary({
  costing,
}: {
  costing: NonNullable<PosReceipt['costing']>;
}): React.ReactElement {
  const profit = moneyToCents(costing.profit);
  const totalCost = centsToMoney(
    moneyToCents(costing.inventoryCost) + moneyToCents(costing.labCost),
  );
  return (
    <section
      aria-label="Costing summary"
      className="grid gap-2 rounded-lg border-2 border-navy bg-white px-3 py-3"
    >
      <h3 className="text-sm font-semibold text-navy">Costing summary</h3>
      <dl className="grid gap-1 text-sm">
        {costing.lines.length > 0 ? (
          costing.lines.map((line, index) => (
            <div
              key={`${line.priceCode}-${line.productName}-${index}`}
              className="flex items-start justify-between gap-3"
            >
              <dt className="min-w-0 text-ink2">{costLineLabel(line)}</dt>
              <dd className={`shrink-0 font-medium ${line.cost ? 'text-ink' : 'text-amber'}`}>
                {line.cost ? formatRupee(line.cost) : 'No cost'}
              </dd>
            </div>
          ))
        ) : (
          <div className="flex items-center justify-between gap-3">
            <dt className="text-ink2">Inventory cost</dt>
            <dd className="font-medium text-ink">{formatRupee(costing.inventoryCost)}</dd>
          </div>
        )}
        {costing.lines.length > 1 ? (
          <div className="flex items-center justify-between gap-3 border-t border-line pt-1">
            <dt className="text-ink2">Inventory cost</dt>
            <dd className="font-medium text-ink">{formatRupee(costing.inventoryCost)}</dd>
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-3">
          <dt className="text-ink2">Lab cost</dt>
          <dd className="font-medium text-ink">{formatRupee(costing.labCost)}</dd>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-line pt-1">
          <dt className="font-medium text-ink">Total cost</dt>
          <dd className="font-semibold text-ink">{formatRupee(totalCost)}</dd>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-line pt-1">
          <dt className="font-medium text-ink">Profit</dt>
          <dd className={`font-semibold ${profit < 0 ? 'text-danger' : 'text-teal'}`}>
            {formatRupee(costing.profit)}
          </dd>
        </div>
      </dl>
      {costing.inventoryCostMissing ? (
        <p className="text-xs text-amber">
          A line has no cost price, so that cost is not included.
        </p>
      ) : null}
    </section>
  );
}

function costLineLabel(line: { productName: string; priceCode: string; quantity: number }): string {
  const name = line.productName.trim() || line.priceCode;
  return line.quantity > 1 ? `${name} × ${line.quantity}` : name;
}
