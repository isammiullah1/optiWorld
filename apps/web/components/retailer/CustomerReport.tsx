'use client';

import type { CustomerReport as CustomerReportData } from '@optiworld/shared';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';

import { formatDateTime, formatRupee } from './dashboard-format';
import { ReportSection, ReportTable, toneFor, type ReportCell } from './ReportTable';
import { defaultReportRange, downloadReport, loadCustomerReport } from './reports-api';

export function CustomerReport(): React.ReactElement {
  const { data: session } = useSession();
  const token = session?.accessToken;
  const initial = defaultReportRange();
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [report, setReport] = useState<CustomerReportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!token || from > to) {
      return;
    }
    setReport(null);
    void loadCustomerReport(token, from, to)
      .then((next) => {
        setReport(next);
        setError(null);
      })
      .catch((caught: unknown) => {
        setError(
          caught instanceof Error ? caught.message : 'The customer report could not be loaded',
        );
      });
  }, [from, to, token]);

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-xl font-semibold text-ink">Customer report</h1>
        <p className="text-sm text-ink2">
          Who bought in this period, who is new, and who has gone quiet.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-xs text-ink3">
          From
          <input
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            className="min-h-[44px] rounded-lg border border-line bg-white px-3 text-sm text-ink"
          />
        </label>
        <label className="grid gap-1 text-xs text-ink3">
          To
          <input
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            className="min-h-[44px] rounded-lg border border-line bg-white px-3 text-sm text-ink"
          />
        </label>
        <button
          type="button"
          disabled={exporting}
          onClick={() => exportFile('xlsx')}
          className="min-h-[44px] rounded-lg border border-line bg-white px-4 text-sm font-medium text-ink2 disabled:opacity-50"
        >
          {exporting ? 'Exporting…' : 'Export Excel'}
        </button>
        <button
          type="button"
          disabled={exporting}
          onClick={() => exportFile('pdf')}
          className="min-h-[44px] rounded-lg border border-line bg-white px-4 text-sm font-medium text-ink2 disabled:opacity-50"
        >
          {exporting ? 'Exporting…' : 'Export PDF'}
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      {report ? (
        <CustomerBody report={report} />
      ) : error ? null : (
        <p className="text-sm text-ink2">Loading the report…</p>
      )}
    </div>
  );

  function exportFile(format: 'xlsx' | 'pdf'): void {
    if (!token || from > to) {
      return;
    }
    setExporting(true);
    void downloadReport(token, 'CUSTOMERS', from, to, format)
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : 'The report could not be downloaded');
      })
      .finally(() => setExporting(false));
  }
}

function CustomerBody({ report }: { report: CustomerReportData }): React.ReactElement {
  const showBalance = report.outstanding !== null;
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <article className="rounded-xl border-2 border-action bg-action-soft p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-ink3">New</p>
          <p className="text-lg font-semibold text-ink">{report.acquired.newCount}</p>
          <p className="text-sm text-action">{formatRupee(report.acquired.newSale)}</p>
          <p className="mt-1 text-sm text-ink2">
            Their first bill with this shop is in this period, and it is their only sale here.
          </p>
        </article>
        <article className="rounded-xl border-2 border-teal bg-[color-mix(in_srgb,var(--ow-teal)_20%,white)] p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-ink3">Returning</p>
          <p className="text-lg font-semibold text-ink">{report.acquired.returningCount}</p>
          <p className="text-sm text-teal">{formatRupee(report.acquired.returningSale)}</p>
          <p className="mt-1 text-sm text-ink2">More than one sale in this period.</p>
        </article>
      </div>
      <ReportSection title="Top customers" tone="blue" note="Highest sale in this period.">
        <ReportTable
          tone="blue"
          columns={
            showBalance
              ? ['Customer', 'Bills', 'Sale', 'Outstanding']
              : ['Customer', 'Bills', 'Sale']
          }
          empty="No customers bought in this period."
          rows={report.top.map((row) => saleRow(row, showBalance))}
        />
      </ReportSection>
      <ReportSection
        title="New customers"
        tone="teal"
        note={
          report.acquired.newCustomers.length < report.acquired.newCount
            ? `First bill in this period, and their only sale. Showing ${report.acquired.newCustomers.length} of ${report.acquired.newCount}.`
            : 'First bill in this period, and their only sale.'
        }
      >
        <ReportTable
          tone="teal"
          columns={
            showBalance
              ? ['Customer', 'Bills', 'Sale', 'Outstanding']
              : ['Customer', 'Bills', 'Sale']
          }
          empty="No new customers in this period."
          rows={report.acquired.newCustomers.map((row) => saleRow(row, showBalance))}
        />
      </ReportSection>
      <ReportSection
        title="Returning customers"
        tone="amber"
        note={
          report.acquired.returningCustomers.length < report.acquired.returningCount
            ? `More than one sale in this period. Showing ${report.acquired.returningCustomers.length} of ${report.acquired.returningCount}.`
            : 'More than one sale in this period.'
        }
      >
        <ReportTable
          tone="amber"
          columns={
            showBalance
              ? ['Customer', 'Bills', 'Sale', 'Outstanding']
              : ['Customer', 'Bills', 'Sale']
          }
          empty="No returning customers in this period."
          rows={report.acquired.returningCustomers.map((row) => saleRow(row, showBalance))}
        />
      </ReportSection>
      {report.outstanding ? (
        <ReportSection
          title="Outstanding balances"
          tone="navy"
          note="The same aging figures as the aging report."
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
            <p className="text-sm text-ink2">
              Current {formatRupee(report.outstanding.buckets.current)} · 31–60{' '}
              {formatRupee(report.outstanding.buckets.days31to60)} · 61–90{' '}
              {formatRupee(report.outstanding.buckets.days61to90)} · 90+{' '}
              {formatRupee(report.outstanding.buckets.days90plus)}
            </p>
            <Link href="/retailer/reports/aging" className="text-sm font-medium text-action">
              Open the aging report
            </Link>
          </div>
          <ReportTable
            tone="navy"
            columns={['Customer', 'Outstanding', 'Status']}
            empty="No outstanding balances."
            rows={report.outstanding.rows.map((row) => [
              { text: row.customerName, className: 'font-medium text-ink' },
              {
                text: formatRupee(row.total),
                className: toneFor('Outstanding', row.total),
              },
              {
                text: statusLabel(row.status),
                className: toneFor('Status', statusLabel(row.status)),
              },
            ])}
          />
        </ReportSection>
      ) : null}
      <ReportSection
        title="Inactive customers"
        tone="slate"
        note="No bill in this period, and either a balance is still open or their last purchase was earlier."
      >
        <ReportTable
          tone="slate"
          columns={
            showBalance ? ['Customer', 'Last visit', 'Outstanding'] : ['Customer', 'Last visit']
          }
          empty="No inactive customers."
          rows={report.inactive.map((row) => {
            const cells: ReportCell[] = [
              { text: row.customerName, className: 'font-medium text-ink' },
              {
                text: row.lastVisit ? formatDateTime(row.lastVisit) : 'Never',
                className: 'text-ink2',
              },
            ];
            if (showBalance) {
              cells.push(
                row.outstanding
                  ? {
                      text: formatRupee(row.outstanding),
                      className: toneFor('Outstanding', row.outstanding),
                    }
                  : { text: '—', className: 'text-ink3' },
              );
            }
            return cells;
          })}
        />
      </ReportSection>
    </div>
  );
}

function saleRow(row: CustomerReportData['top'][number], showBalance: boolean): ReportCell[] {
  const cells: ReportCell[] = [
    { text: row.customerName, className: 'font-medium text-ink' },
    { text: String(row.invoiceCount) },
    { text: formatRupee(row.sale), className: toneFor('Sale', row.sale) },
  ];
  if (showBalance) {
    cells.push(
      row.outstanding
        ? { text: formatRupee(row.outstanding), className: toneFor('Outstanding', row.outstanding) }
        : { text: '—', className: 'text-ink3' },
    );
  }
  return cells;
}

function statusLabel(status: 'CURRENT' | 'DAYS_31_60' | 'OVERDUE'): string {
  if (status === 'OVERDUE') {
    return 'Overdue';
  }
  if (status === 'DAYS_31_60') {
    return '31-60 days';
  }
  return 'Current';
}
