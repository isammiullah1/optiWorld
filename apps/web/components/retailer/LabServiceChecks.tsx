'use client';

import { centsToMoney, moneyToCents } from '@optiworld/shared';

import { formatRupee } from './dashboard-format';

export type LabServiceOption = {
  id: string;
  name: string;
  price: string;
};

const SERVICE_PRICE = /^\d{1,10}(\.\d{1,2})?$/;

export function labServiceChargeCents(
  services: readonly LabServiceOption[],
  selected: readonly string[],
  prices?: Readonly<Record<string, string>>,
): number {
  return services.reduce((sum, service) => {
    if (!selected.includes(service.id)) {
      return sum;
    }
    const raw = (prices?.[service.id] ?? service.price).trim();
    return SERVICE_PRICE.test(raw) ? sum + moneyToCents(raw) : sum;
  }, 0);
}

export function LabServiceChecks({
  services,
  selected,
  onToggle,
  showPrices = true,
  prices,
  onPriceChange,
}: {
  services: readonly LabServiceOption[];
  selected: readonly string[];
  onToggle: (serviceId: string) => void;
  showPrices?: boolean;
  prices?: Readonly<Record<string, string>>;
  onPriceChange?: (serviceId: string, price: string) => void;
}): React.ReactElement {
  if (services.length === 0) {
    return <p className="text-xs text-amber">This laboratory has not priced a service yet.</p>;
  }
  const charge = labServiceChargeCents(services, selected, prices);
  const editable = onPriceChange !== undefined;
  return (
    <div className="mt-2 grid min-w-0 gap-1 rounded-lg border border-line bg-white px-3 py-2">
      <p className="text-xs font-medium uppercase tracking-wide text-ink3">Lab services</p>
      {services.map((service) => (
        <div key={service.id} className="flex min-h-11 min-w-0 items-center gap-2 text-xs text-ink">
          <label className="flex min-w-0 flex-1 items-center gap-2">
            <input
              type="checkbox"
              checked={selected.includes(service.id)}
              onChange={() => onToggle(service.id)}
              className="h-4 w-4 shrink-0 accent-action"
            />
            <span className="min-w-0 flex-1 break-words">{service.name}</span>
          </label>
          {editable ? (
            <input
              aria-label={`${service.name} price`}
              inputMode="decimal"
              value={prices?.[service.id] ?? service.price}
              onChange={(event) => onPriceChange(service.id, event.target.value)}
              className="h-9 w-28 shrink-0 rounded-lg border border-line bg-white px-2 text-right text-sm text-ink outline-none focus:border-action"
            />
          ) : showPrices ? (
            <span className="shrink-0 text-ink2">{formatRupee(service.price)}</span>
          ) : null}
        </div>
      ))}
      {selected.length === 0 ? (
        <p className="text-xs text-danger">Choose at least one service.</p>
      ) : showPrices ? (
        <p className="text-xs font-semibold text-navy">
          Lab charge {formatRupee(centsToMoney(charge))}
        </p>
      ) : null}
    </div>
  );
}
