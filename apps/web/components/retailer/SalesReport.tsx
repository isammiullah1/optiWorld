'use client';

import { centsToMoney, moneyToCents, type SalesReport as SalesReportData } from '@optiworld/shared';
import { Banknote, Calculator, CreditCard, Receipt, type LucideIcon } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';

import { isShopOwnerRole } from '@/lib/shop-scope';
import { formatRupee, formatShortDate } from './dashboard-format';
import { ReportRange } from './ReportRange';
import { SalesCharts } from './SalesCharts';
import { SalesSections } from './SalesSections';
import { SalesInvoiceList } from './SalesInvoiceList';
import { defaultReportRange, downloadReport, loadSalesReport } from './reports-api';

export function SalesReport(): React.ReactElement {
  const { data: session } = useSession();
  const token = session?.accessToken;
  const initial = defaultReportRange();
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [report, setReport] = useState<SalesReportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [revenueOpen, setRevenueOpen] = useState(false);
  const [saleOpen, setSaleOpen] = useState(false);

  useEffect(() => {
    if (!token || from > to) {
      return;
    }
    setReport(null);
    void loadSalesReport(token, from, to)
      .then((next) => {
        setReport(next);
        setError(null);
      })
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : 'The sales report could not be loaded');
      });
  }, [from, to, token]);

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-xl font-semibold text-ink">Sales</h1>
        <p className="text-sm text-ink2">Revenue, invoices, and payment mix for this shop.</p>
      </div>
      {report ? (
        <SalesInvoiceList
          invoices={report.invoices}
          from={from}
          to={to}
          token={token}
          canEdit={isShopOwnerRole(session?.user.role)}
          onRange={(nextFrom, nextTo) => {
            setFrom(nextFrom);
            setTo(nextTo);
          }}
          onChanged={() => {
            if (!token) {
              return;
            }
            void loadSalesReport(token, from, to)
              .then((next) => {
                setReport(next);
                setError(null);
              })
              .catch((caught: unknown) => {
                setError(
                  caught instanceof Error ? caught.message : 'The sales report could not be loaded',
                );
              });
          }}
        />
      ) : null}
      <ReportRange
        from={from}
        to={to}
        onFrom={setFrom}
        onTo={setTo}
        exporting={exporting}
        onExport={(format) => {
          if (!token) {
            return;
          }
          setExporting(true);
          void downloadReport(token, 'SALES', from, to, format)
            .catch((caught: unknown) => {
              setError(
                caught instanceof Error ? caught.message : 'The workbook could not be downloaded',
              );
            })
            .finally(() => setExporting(false));
        }}
      />
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      {report === null && !error ? (
        <div className="h-24 animate-pulse rounded-xl bg-white" />
      ) : null}
      {report ? (
        <>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              label="Total sale"
              value={formatRupee(report.revenue)}
              icon={Banknote}
              card={TEAL_CARD}
              mark="bg-teal-soft text-teal"
              onClick={() => setSaleOpen(true)}
              detail={
                report.profit !== null ? (
                  <>
                    <span
                      className={`block text-sm font-semibold leading-tight ${
                        moneyToCents(report.profit) < 0 ? 'text-danger' : 'text-teal'
                      }`}
                    >
                      Profit {formatRupee(report.profit)}
                    </span>
                    {report.labExpense !== null ? (
                      <span className="block text-xs font-medium leading-tight text-amber">
                        Lab expense {formatRupee(report.labExpense)}
                      </span>
                    ) : null}
                  </>
                ) : null
              }
            />
            <SummaryCard
              label="Invoices"
              value={String(report.invoiceCount)}
              icon={Receipt}
              card={BLUE_CARD}
              mark="bg-action-soft text-action"
            />
            <SummaryCard
              label="Average bill"
              value={formatRupee(report.averageValue)}
              icon={Calculator}
              card={NAVY_CARD}
              mark="bg-white text-navy"
            />
            <button
              type="button"
              onClick={() => setRevenueOpen(true)}
              className={`flex min-h-[44px] w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left ${AMBER_CARD} hover:ring-2 hover:ring-amber-soft`}
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-amber-soft text-amber">
                <CreditCard size={15} aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-medium uppercase tracking-wide text-ink3">
                  Cash vs credit
                </span>
                <span className="block text-sm font-semibold leading-tight text-teal">
                  Cash {formatRupee(report.cashTotal)}
                </span>
                <span className="block text-sm font-semibold leading-tight text-amber">
                  Credit {formatRupee(report.creditTotal)}
                </span>
              </span>
            </button>
          </div>
          {saleOpen ? <ProfitDetail report={report} onClose={() => setSaleOpen(false)} /> : null}
          {revenueOpen ? (
            <RevenueDetail report={report} onClose={() => setRevenueOpen(false)} />
          ) : null}
          <SalesSections report={report} />
          <SalesCharts report={report} />
        </>
      ) : null}
    </div>
  );
}

const TEAL_CARD =
  'border-teal bg-[linear-gradient(165deg,color-mix(in_srgb,var(--ow-teal)_18%,white)_0%,white_52%,var(--ow-teal-soft)_100%)]';
const NAVY_CARD =
  'border-navy bg-[linear-gradient(165deg,color-mix(in_srgb,var(--ow-navy)_10%,white)_0%,white_55%,var(--ow-bg)_100%)]';
const BLUE_CARD =
  'border-action bg-[linear-gradient(165deg,color-mix(in_srgb,var(--ow-blue)_22%,white)_0%,white_50%,var(--ow-blue-soft)_100%)]';
const AMBER_CARD =
  'border-amber bg-[linear-gradient(165deg,color-mix(in_srgb,var(--ow-amber)_22%,white)_0%,white_50%,var(--ow-amber-soft)_100%)]';

function ProfitDetail({
  report,
  onClose,
}: {
  report: SalesReportData;
  onClose: () => void;
}): React.ReactElement {
  const showProfit = report.profit !== null;
  const missing = report.profitRows.filter((row) => row.costMissing).length;
  const columns = showProfit ? 6 : 4;
  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 sm:items-center"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sale-profit-title"
        className="grid max-h-[92vh] w-full max-w-5xl gap-3 overflow-hidden rounded-t-xl border border-line bg-white p-4 sm:rounded-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="sale-profit-title" className="text-lg font-semibold text-ink">
              Sale and profit
            </h2>
            <p className="text-sm text-ink2">
              Each bill in this period. Profit is the bill total, minus the cost of the items, minus
              lab bills that have been issued.
            </p>
          </div>
          <button type="button" className="min-h-[44px] px-2 text-sm text-ink2" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="max-h-[60vh] overflow-auto rounded-lg border border-line">
          <table className="w-full min-w-[760px] border-collapse text-left">
            <thead className="sticky top-0">
              <tr className="bg-navy text-left">
                {(showProfit
                  ? ['Invoice', 'Customer', 'Products', 'Sale', 'Cost', 'Profit']
                  : ['Invoice', 'Customer', 'Products', 'Sale']
                ).map((heading) => (
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
              {report.profitRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns}
                    className="border border-line px-3 py-6 text-center text-sm text-ink2"
                  >
                    No sales in this period.
                  </td>
                </tr>
              ) : (
                report.profitRows.map((row) => (
                  <tr key={row.id} className="hover:bg-canvas">
                    <td className="border border-line px-3 py-2 text-sm font-medium text-ink">
                      #{row.invoiceNumber}
                    </td>
                    <td className="border border-line px-3 py-2 text-sm text-ink">
                      {row.customerName}
                    </td>
                    <td className="border border-line px-3 py-2 text-sm text-ink2">
                      {row.products || '—'}
                    </td>
                    <td className="border border-line px-3 py-2 text-sm font-medium text-ink">
                      {formatRupee(row.sale)}
                    </td>
                    {showProfit && row.cost !== null && row.profit !== null ? (
                      <>
                        <td className="border border-line px-3 py-2 text-sm text-ink">
                          <span className="block">{formatRupee(row.cost)}</span>
                          {row.costMissing ? (
                            <span className="block text-xs font-medium text-amber">
                              No cost price
                            </span>
                          ) : null}
                        </td>
                        <td
                          className={`border border-line px-3 py-2 text-sm font-semibold ${
                            moneyToCents(row.profit) < 0 ? 'text-danger' : 'text-teal'
                          }`}
                        >
                          {formatRupee(row.profit)}
                        </td>
                      </>
                    ) : null}
                  </tr>
                ))
              )}
            </tbody>
            {report.profitRows.length > 0 ? (
              <tfoot>
                <tr className="bg-teal-soft">
                  <td
                    colSpan={3}
                    className="border border-line px-3 py-2 text-sm font-semibold text-ink"
                  >
                    Total
                  </td>
                  <td className="border border-line px-3 py-2 text-sm font-semibold text-ink">
                    {formatRupee(report.revenue)}
                  </td>
                  {showProfit && report.costIncurred !== null && report.profit !== null ? (
                    <>
                      <td className="border border-line px-3 py-2 text-sm font-semibold text-ink">
                        {formatRupee(report.costIncurred)}
                      </td>
                      <td
                        className={`border border-line px-3 py-2 text-sm font-semibold ${
                          moneyToCents(report.profit) < 0 ? 'text-danger' : 'text-teal'
                        }`}
                      >
                        {formatRupee(report.profit)}
                      </td>
                    </>
                  ) : null}
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
        {showProfit && report.profitRows.some((row) => row.labPending) ? (
          <p className="text-sm text-amber">
            A lab bill is still open on a sale in this list. That charge is not in the profit yet.
          </p>
        ) : null}
        {showProfit && missing > 0 ? (
          <p className="text-sm text-ink2">
            {missing === 1 ? '1 bill has' : `${missing} bills have`} an item with no cost price.
            That part of the sale is not subtracted, so the profit includes it until a cost price is
            saved on the product.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function RevenueDetail({
  report,
  onClose,
}: {
  report: SalesReportData;
  onClose: () => void;
}): React.ReactElement {
  const sales = report.invoices.filter((invoice) => !invoice.cancelled);
  const creditSales = sales.filter(
    (invoice) => invoice.paymentType === 'CREDIT' || invoice.status === 'CREDIT',
  );
  const cashSales = sales.filter(
    (invoice) => invoice.paymentType !== 'CREDIT' && invoice.status !== 'CREDIT',
  );
  const cashLines = [
    ...cashSales.map((invoice) => ({
      id: invoice.id,
      label: `Invoice #${invoice.invoiceNumber} · ${invoice.customerName}`,
      detail: formatShortDate(invoice.issuedAt),
      amount: invoice.total,
    })),
    ...creditSales.flatMap((invoice) => {
      const received = Math.max(0, moneyToCents(invoice.total) - moneyToCents(invoice.outstanding));
      if (received === 0) {
        return [];
      }
      return [
        {
          id: `${invoice.id}-received`,
          label: `Invoice #${invoice.invoiceNumber} · ${invoice.customerName}`,
          detail: `${formatShortDate(invoice.issuedAt)} · Received on this credit bill`,
          amount: centsToMoney(received),
        },
      ];
    }),
  ];
  const creditLines = creditSales.flatMap((invoice) => {
    if (moneyToCents(invoice.outstanding) === 0) {
      return [];
    }
    return [
      {
        id: invoice.id,
        label: `Invoice #${invoice.invoiceNumber} · ${invoice.customerName}`,
        detail: formatShortDate(invoice.issuedAt),
        amount: invoice.outstanding,
      },
    ];
  });
  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 sm:items-center"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cash-credit-detail-title"
        className="grid max-h-[92vh] w-full max-w-lg gap-3 overflow-y-auto rounded-t-xl border border-line bg-white p-4 sm:rounded-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="cash-credit-detail-title" className="text-lg font-semibold text-ink">
              Cash vs credit
            </h2>
            <p className="text-sm text-ink2">
              Cash and credit for this period. Opening credit is left out.
            </p>
          </div>
          <button type="button" className="min-h-[44px] px-2 text-sm text-ink2" onClick={onClose}>
            Close
          </button>
        </div>
        <SaleGroup title="Cash" total={report.cashTotal} tone="text-teal" lines={cashLines} />
        <SaleGroup
          title="Credit"
          total={report.creditTotal}
          tone="text-amber"
          lines={creditLines}
        />
        <div className="rounded-lg border border-teal bg-teal-soft px-3 py-3">
          <p className="text-sm font-semibold text-teal">Revenue {formatRupee(report.revenue)}</p>
        </div>
      </div>
    </div>
  );
}

function SaleGroup({
  title,
  total,
  tone,
  lines,
}: {
  title: string;
  total: string;
  tone: string;
  lines: readonly { id: string; label: string; detail: string; amount: string }[];
}): React.ReactElement {
  return (
    <div className="grid gap-2">
      <p className={`text-sm font-semibold ${tone}`}>
        {title} {formatRupee(total)}
      </p>
      {lines.length === 0 ? (
        <p className="text-sm text-ink2">No {title.toLowerCase()} sales in this period.</p>
      ) : (
        <ul className="grid gap-1">
          {lines.map((line) => (
            <li
              key={line.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2"
            >
              <span className="min-w-0">
                <span className="block text-sm font-medium text-ink">{line.label}</span>
                <span className="block text-xs text-ink2">{line.detail}</span>
              </span>
              <span className="shrink-0 text-sm font-semibold text-ink">
                {formatRupee(line.amount)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  card,
  mark,
  detail,
  onClick,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  card: string;
  mark: string;
  detail?: React.ReactNode;
  onClick?: () => void;
}): React.ReactElement {
  const className = `flex min-h-[44px] w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left ${card}${
    onClick ? ' hover:ring-2 hover:ring-teal' : ''
  }`;
  const body = (
    <>
      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${mark}`}>
        <Icon size={15} aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-medium uppercase tracking-wide text-ink3">{label}</span>
        <span className="block text-md font-semibold leading-tight text-ink">{value}</span>
        {detail}
      </span>
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {body}
      </button>
    );
  }
  return <section className={className}>{body}</section>;
}
