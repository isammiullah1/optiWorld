'use client';

import type { JobStatus, LabClientRow, LabIncome, LabServiceRow } from '@optiworld/shared';
import { JOB_STATUSES } from '@optiworld/shared';
import type { LabStaffMember } from '@optiworld/shared';
import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';

import { formatRupee, formatShortDate } from '@/components/retailer/dashboard-format';
import { jobStatusLabel } from '@/components/retailer/LabJobStatus';
import {
  ReportSection,
  ReportTable,
  toneFor,
  type ReportCell,
} from '@/components/retailer/ReportTable';

import { loadLabStaff } from './lab-account-api';
import { downloadLabIncome, loadLabClients, loadLabIncome, loadOwnLabServices } from './lab-api';

type Filters = {
  from: string;
  to: string;
  party: string;
  service: string;
  billStatus: '' | 'OPEN' | 'ISSUED' | 'CLEARED' | 'VOID';
  status: '' | JobStatus;
  urgent: boolean;
  finishedBy: string;
};

export function LabIncome(): React.ReactElement {
  const { data: session } = useSession();
  const [filters, setFilters] = useState<Filters>(() => ({
    ...defaultRange(),
    party: 'ALL',
    service: '',
    billStatus: '',
    status: '',
    urgent: false,
    finishedBy: '',
  }));
  const [report, setReport] = useState<LabIncome | null>(null);
  const [clients, setClients] = useState<LabClientRow[]>([]);
  const [services, setServices] = useState<LabServiceRow[]>([]);
  const [staff, setStaff] = useState<LabStaffMember[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const token = session?.accessToken;
    if (!token || filters.from > filters.to) {
      return;
    }
    setReport(null);
    setError(null);
    void loadLabIncome(token, {
      from: filters.from,
      to: filters.to,
      ...(filters.party !== 'ALL' ? { party: filters.party } : {}),
      ...(filters.service ? { service: filters.service } : {}),
      ...(filters.billStatus ? { billStatus: filters.billStatus } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.urgent ? { urgent: 'true' as const } : {}),
      ...(filters.finishedBy ? { finishedBy: filters.finishedBy } : {}),
    })
      .then((next) => {
        setReport(next);
        setError(null);
      })
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : 'Income could not be loaded');
      });
  }, [filters, session?.accessToken]);

  useEffect(() => {
    const token = session?.accessToken;
    if (!token) {
      return;
    }
    void Promise.all([loadLabClients(token), loadOwnLabServices(token), loadLabStaff(token)])
      .then(([nextClients, nextServices, nextStaff]) => {
        setClients(nextClients);
        setServices(nextServices);
        setStaff(nextStaff);
      })
      .catch(() => undefined);
  }, [session?.accessToken]);

  function exportFile(format: 'xlsx' | 'pdf'): void {
    const token = session?.accessToken;
    if (!token) {
      return;
    }
    setExporting(true);
    void downloadLabIncome(token, {
      from: filters.from,
      to: filters.to,
      format,
      ...(filters.party !== 'ALL' ? { party: filters.party } : {}),
      ...(filters.service ? { service: filters.service } : {}),
      ...(filters.billStatus ? { billStatus: filters.billStatus } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.urgent ? { urgent: 'true' as const } : {}),
      ...(filters.finishedBy ? { finishedBy: filters.finishedBy } : {}),
    })
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : 'The report could not be downloaded');
      })
      .finally(() => setExporting(false));
  }

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-xl font-semibold text-ink">Income</h1>
        <p className="text-sm text-ink2">
          Issued and paid bills are sales. A finished job uses the day it was finished. A job still
          in progress uses the day the bill was issued or paid. Collected is the money already
          received.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <DateField
          label="From"
          value={filters.from}
          onChange={(from) => setFilters((current) => ({ ...current, from }))}
        />
        <DateField
          label="To"
          value={filters.to}
          onChange={(to) => setFilters((current) => ({ ...current, to }))}
        />
        <SelectField
          label="Party"
          value={filters.party}
          onChange={(party) => setFilters((current) => ({ ...current, party }))}
        >
          <option value="ALL">All parties</option>
          <option value="SHOPS">Connected shops</option>
          <option value="WALK_IN">Walk-in clients</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Service"
          value={filters.service}
          onChange={(service) => setFilters((current) => ({ ...current, service }))}
        >
          <option value="">All services</option>
          {services.map((service) => (
            <option key={service.id} value={service.name}>
              {service.name}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Bill"
          value={filters.billStatus}
          onChange={(billStatus) =>
            setFilters((current) => ({
              ...current,
              billStatus: billStatus as Filters['billStatus'],
            }))
          }
        >
          <option value="">Issued and paid</option>
          <option value="ISSUED">Issued</option>
          <option value="CLEARED">Paid</option>
          <option value="OPEN">Still open</option>
          <option value="VOID">Rejected</option>
        </SelectField>
        <SelectField
          label="Job stage"
          value={filters.status}
          onChange={(status) =>
            setFilters((current) => ({ ...current, status: status as Filters['status'] }))
          }
        >
          <option value="">All stages</option>
          {JOB_STATUSES.filter((stage) => stage !== 'FITTING' && stage !== 'QC').map((stage) => (
            <option key={stage} value={stage}>
              {jobStatusLabel(stage)}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Finished by"
          value={filters.finishedBy}
          onChange={(finishedBy) => setFilters((current) => ({ ...current, finishedBy }))}
        >
          <option value="">Anyone</option>
          {staff.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name}
            </option>
          ))}
        </SelectField>
        <label className="flex min-h-11 items-center gap-2 text-sm text-ink2">
          <input
            type="checkbox"
            checked={filters.urgent}
            onChange={(event) =>
              setFilters((current) => ({ ...current, urgent: event.target.checked }))
            }
          />
          Urgent only
        </label>
        <button
          type="button"
          disabled={exporting || filters.from > filters.to}
          className="min-h-11 rounded-lg bg-action px-4 text-sm font-medium text-white disabled:opacity-50"
          onClick={() => exportFile('xlsx')}
        >
          {exporting ? 'Exporting…' : 'Export Excel'}
        </button>
        <button
          type="button"
          disabled={exporting || filters.from > filters.to}
          className="min-h-11 rounded-lg border border-line bg-white px-4 text-sm font-medium text-ink2 disabled:opacity-50"
          onClick={() => exportFile('pdf')}
        >
          {exporting ? 'Exporting…' : 'Export PDF'}
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      {report === null && !error ? (
        <div className="h-40 animate-pulse rounded-xl border border-line bg-white" />
      ) : null}
      {report ? <IncomeBody report={report} /> : null}
    </div>
  );
}

function IncomeBody({ report }: { report: LabIncome }): React.ReactElement {
  const summary = report.summary;
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Income"
          value={formatRupee(summary.income)}
          note={`${summary.finishedSales} sales`}
          tone="border-action bg-action-soft"
        />
        <SummaryCard
          label="Collected"
          value={formatRupee(summary.collected)}
          note="Money received"
          tone="border-teal bg-teal-soft"
        />
        <SummaryCard
          label="Outstanding"
          value={formatRupee(summary.outstanding)}
          note="Still unpaid"
          tone="border-amber bg-amber-soft"
        />
        <SummaryCard
          label="Profit"
          value={summary.profit === null ? '—' : formatRupee(summary.profit)}
          note={
            summary.costMissing
              ? 'A material on these sales has no cost yet'
              : `Material cost ${summary.materialCost === null ? '—' : formatRupee(summary.materialCost)}`
          }
          tone="border-navy bg-[color-mix(in_srgb,var(--ow-navy)_10%,white)]"
        />
      </div>
      <p className="text-sm text-ink2">
        Connected shops {formatRupee(summary.shopIncome)}. Walk-in clients{' '}
        {formatRupee(summary.walkInIncome)}. Discounts {formatRupee(summary.discount)}. Adjustments{' '}
        {formatRupee(summary.adjustments)}.
      </p>
      <ReportSection
        title="Daily sales"
        tone="blue"
        note="Finished jobs use the finish day. Jobs still in progress use the day the bill was issued or paid."
      >
        <ReportTable
          tone="blue"
          columns={['Date', 'Jobs', 'Income', 'Collected', 'Outstanding']}
          empty="No finished sales in this period."
          rows={report.daily.map((row) => [
            { text: formatShortDate(`${row.date}T00:00:00.000Z`) },
            { text: String(row.jobs) },
            money(row.income, 'Sale'),
            money(row.collected, 'Sale'),
            money(row.outstanding, 'Sale'),
          ])}
        />
      </ReportSection>
      <ReportSection
        title="Top retailers"
        tone="teal"
        note="Connected shops, ranked by income. Average is income divided by finished sales."
      >
        <PartyTable
          rows={report.retailers}
          empty="No connected-shop sales in this period."
          label="Retailer"
        />
      </ReportSection>
      <ReportSection
        title="Top clients"
        tone="amber"
        note="Walk-in clients, kept apart from connected shops."
      >
        <PartyTable rows={report.clients} empty="No walk-in sales in this period." label="Client" />
      </ReportSection>
      <ReportSection
        title="Services"
        tone="navy"
        note="Income is each service's share of the bill after discount and adjustments."
      >
        <ReportTable
          tone="navy"
          columns={['Service', 'Jobs', 'Quantity', 'Income']}
          empty="No services were billed in this period."
          rows={report.services.map((row) => [
            { text: row.name, className: 'font-medium text-ink' },
            { text: String(row.jobs) },
            { text: String(row.quantity) },
            money(row.income, 'Sale'),
          ])}
        />
      </ReportSection>
      <ReportSection
        title="Finished by"
        tone="slate"
        note="The person who marked the job done, or who first moved it to ready."
      >
        <ReportTable
          tone="slate"
          columns={['Person', 'Jobs', 'Income']}
          empty="No finished sales in this period."
          rows={report.finishers.map((row) => [
            { text: row.name, className: 'font-medium text-ink' },
            { text: String(row.jobs) },
            money(row.income, 'Sale'),
          ])}
        />
      </ReportSection>
      <ReportSection
        title="Sales"
        tone="blue"
        note="Issued and paid bills in this period. Paid in full counts as collected. A part payment leaves the rest outstanding."
      >
        <ReportTable
          tone="blue"
          columns={[
            'Job',
            'Customer',
            'Party',
            'Finished',
            'Services',
            'Income',
            'Cost',
            'Profit',
            'Bill',
          ]}
          empty="No finished sales in this period."
          rows={report.sales.map((row) => [
            { text: row.referenceNumber, className: 'font-medium text-ink' },
            { text: row.customerName },
            { text: row.partyName, className: 'text-ink2' },
            { text: formatShortDate(`${row.finishedOn}T00:00:00.000Z`) },
            { text: row.services || '—', className: 'text-ink2' },
            money(row.income, 'Sale'),
            costCell(row.materialCost, row.costMissing),
            money(row.profit, 'Profit'),
            { text: row.billStatus === 'CLEARED' ? 'Paid' : 'Issued' },
          ])}
        />
      </ReportSection>
      <ReportSection
        title="Open bills on finished jobs"
        tone="sand"
        note={`${summary.openOnFinished} finished jobs are still unbilled, worth ${formatRupee(summary.openValue)}. These are not income yet.`}
      >
        <ReportTable
          tone="sand"
          columns={['Job', 'Customer', 'Party', 'Finished', 'Bill']}
          empty="Every finished job in this period has been issued."
          rows={report.openJobs.map((row) => [
            { text: row.referenceNumber, className: 'font-medium text-ink' },
            { text: row.customerName },
            { text: row.partyName, className: 'text-ink2' },
            { text: formatShortDate(`${row.finishedOn}T00:00:00.000Z`) },
            money(row.total, 'Sale'),
          ])}
        />
      </ReportSection>
      {report.voidedJobs.length > 0 ? (
        <ReportSection title="Rejected" tone="rose" note="A rejected bill is not income.">
          <ReportTable
            tone="rose"
            columns={['Job', 'Customer', 'Party', 'Finished', 'Bill']}
            empty="No voided bills."
            rows={report.voidedJobs.map((row) => [
              { text: row.referenceNumber, className: 'font-medium text-ink' },
              { text: row.customerName },
              { text: row.partyName },
              { text: formatShortDate(`${row.finishedOn}T00:00:00.000Z`) },
              money(row.total, 'Return'),
            ])}
          />
        </ReportSection>
      ) : null}
      <ReportSection
        title="Materials used on sales"
        tone="teal"
        note="Stock recorded against the finished jobs above."
      >
        <ReportTable
          tone="teal"
          columns={['Item', 'Category', 'Quantity', 'Jobs', 'Cost']}
          empty="No stock was recorded against these sales."
          rows={report.usedOnSales.map((row) => [
            { text: row.name, className: 'font-medium text-ink' },
            { text: row.category, className: 'text-ink2' },
            { text: `${row.quantity} ${row.unit}` },
            { text: String(row.jobs) },
            costCell(row.cost, row.costMissing),
          ])}
        />
      </ReportSection>
      <ReportSection
        title="Stock received"
        tone="navy"
        note="Receipts in this period. This list follows the dates, not the party filter."
      >
        <ReportTable
          tone="navy"
          columns={['Item', 'Category', 'Quantity', 'Supplier', 'Date', 'Unit cost']}
          empty="No stock was received in this period."
          rows={report.received.map((row) => [
            { text: row.name, className: 'font-medium text-ink' },
            { text: row.category, className: 'text-ink2' },
            { text: `${row.quantity} ${row.unit}` },
            { text: row.supplier },
            { text: formatShortDate(`${row.occurredOn}T00:00:00.000Z`) },
            costCell(row.unitCost, row.unitCost === null),
          ])}
        />
      </ReportSection>
      <ReportSection
        title="Used with no job"
        tone="rose"
        note="Usage that was not attached to a job."
      >
        <ReportTable
          tone="rose"
          columns={['Item', 'Category', 'Quantity', 'Date']}
          empty="No unassigned usage in this period."
          rows={report.unassignedUse.map((row) => [
            { text: row.name, className: 'font-medium text-ink' },
            { text: row.category, className: 'text-ink2' },
            { text: `${row.quantity} ${row.unit}` },
            { text: formatShortDate(`${row.occurredOn}T00:00:00.000Z`) },
          ])}
        />
      </ReportSection>
      <ReportSection
        title="Low stock"
        tone="amber"
        note="Current stock at or under the reorder level."
      >
        <ReportTable
          tone="amber"
          columns={['Item', 'Category', 'Quantity', 'Reorder level']}
          empty="Nothing is at the reorder level."
          rows={report.lowStock.map((row) => [
            { text: row.name, className: 'font-medium text-ink' },
            { text: row.category, className: 'text-ink2' },
            { text: `${row.quantity} ${row.unit}` },
            { text: `${row.reorderLevel} ${row.unit}` },
          ])}
        />
      </ReportSection>
    </div>
  );
}

function PartyTable({
  rows,
  empty,
  label,
}: {
  rows: LabIncome['retailers'];
  empty: string;
  label: string;
}): React.ReactElement {
  const tone = label === 'Retailer' ? 'teal' : 'amber';
  return (
    <ReportTable
      tone={tone}
      columns={[label, 'Jobs', 'Income', 'Outstanding', 'Average']}
      empty={empty}
      rows={rows.map((row) => [
        { text: row.name, className: 'font-medium text-ink' },
        { text: String(row.jobs) },
        money(row.income, 'Sale'),
        money(row.outstanding, 'Sale'),
        money(row.average, 'Sale'),
      ])}
    />
  );
}

function SummaryCard({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  tone: string;
}): React.ReactElement {
  return (
    <article className={`rounded-xl border-2 px-4 py-3 ${tone}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-ink2">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-ink">{value}</p>
      <p className="mt-1 text-sm text-ink2">{note}</p>
    </article>
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}): React.ReactElement {
  return (
    <label className="grid gap-1 text-xs text-ink3">
      {label}
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-11 rounded-lg border border-line bg-white px-3 text-sm text-ink"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <label className="grid gap-1 text-xs text-ink3">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-11 rounded-lg border border-line bg-white px-3 text-sm text-ink"
      >
        {children}
      </select>
    </label>
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

function defaultRange(now = new Date()): { from: string; to: string } {
  const end = now.toISOString().slice(0, 10);
  const start = new Date(Date.parse(`${end}T00:00:00.000Z`) - 29 * 86_400_000);
  return { from: start.toISOString().slice(0, 10), to: end };
}
