import { z } from 'zod';

const money = z.string().regex(/^\d{1,10}(\.\d{1,2})?$/);

export const AGING_STATUSES = ['CURRENT', 'DAYS_31_60', 'OVERDUE'] as const;

export const AgingRowSchema = z.object({
  customerId: z.string().uuid(),
  customerName: z.string(),
  phone: z.string().nullable(),
  current: money,
  days31to60: money,
  days61to90: money,
  days90plus: money,
  total: money,
  status: z.enum(AGING_STATUSES),
  dueOn: z.string(),
  preview: z.string(),
  remindersSentAt: z.array(z.string().datetime()).default([]),
});

export type AgingRow = z.infer<typeof AgingRowSchema>;

export const LedgerSummarySchema = z.object({
  totalOutstanding: money,
  creditBilled: money,
  creditReceived: money,
  customersWithDues: z.number().int(),
  overdue30Plus: z.number().int(),
  overdue60Plus: z.number().int(),
  rows: z.array(AgingRowSchema),
});

export type LedgerSummary = z.infer<typeof LedgerSummarySchema>;

export const AgingReportSchema = z.object({
  buckets: z.object({
    current: money,
    days31to60: money,
    days61to90: money,
    days90plus: money,
  }),
  rows: z.array(AgingRowSchema),
});

export type AgingReport = z.infer<typeof AgingReportSchema>;

export const SendPaymentReminderSchema = z.object({
  customerIds: z.array(z.string().uuid()).min(1).max(200),
  note: z.string().trim().max(500).optional(),
});

export type SendPaymentReminderRequest = z.infer<typeof SendPaymentReminderSchema>;

export const SendRemindersSchema = z.object({
  customerIds: z.array(z.string().uuid()).max(200).optional(),
  note: z.string().trim().max(500).optional(),
});

export type SendRemindersRequest = z.infer<typeof SendRemindersSchema>;

export const ReminderSendResultSchema = z.object({
  results: z.array(
    z.object({
      customerId: z.string().uuid(),
      customerName: z.string(),
      sent: z.boolean(),
      message: z.string(),
    }),
  ),
});

export type ReminderSendResult = z.infer<typeof ReminderSendResultSchema>;

export const DEFAULT_REMINDER_NOTE = 'Please clear this amount at the shop.';

export type PaymentReminderBill = {
  invoiceNumber: string;
  total: string;
  paid: string;
  remaining: string;
  issuedAt?: string | null;
};

export type PaymentReminderSlip = {
  customerName: string;
  businessName: string;
  outstanding: string;
  dueOn: string;
  bills: PaymentReminderBill[];
  extraBills: number;
  note: string;
};

const MONEY = String.raw`[\d,]+\.\d{2}`;

export function paymentReminderMessage(input: {
  customerName: string;
  businessName: string;
  outstanding: string;
  dueOn: string;
  note?: string;
  bills?: ReadonlyArray<{
    invoiceNumber: number;
    total: string;
    paid: string;
    remaining: string;
    issuedAt?: string;
  }>;
}): string {
  const bills = input.bills ?? [];
  const listed = bills.slice(0, 6);
  const note = input.note?.trim() || DEFAULT_REMINDER_NOTE;
  const lines = [
    input.businessName,
    'Payment reminder',
    '',
    `Hello ${input.customerName}`,
    '',
    `Outstanding: ₨ ${displayMoney(input.outstanding)}`,
    `Due: ${input.dueOn}`,
  ];
  if (listed.length > 0) {
    lines.push('', 'Open bills');
    for (const bill of listed) {
      const when = bill.issuedAt ? ` · ${bill.issuedAt}` : '';
      lines.push(
        `Invoice ${bill.invoiceNumber}${when}`,
        `Total: ₨ ${displayMoney(bill.total)}`,
        `Received: ₨ ${displayMoney(bill.paid)}`,
        `Remaining: ₨ ${displayMoney(bill.remaining)}`,
      );
    }
    const hidden = bills.length - listed.length;
    if (hidden === 1) {
      lines.push('1 more bill is still open.');
    } else if (hidden > 1) {
      lines.push(`${hidden} more bills are still open.`);
    }
  }
  lines.push('', note);
  return lines.join('\n');
}

export function readPaymentReminder(message: string): PaymentReminderSlip | null {
  return readLegacyReminder(message) ?? readLinedReminder(message);
}

function displayMoney(value: string): string {
  const amount = Number(value.replace(/[₨,\s]/g, ''));
  if (!Number.isFinite(amount)) {
    return value;
  }
  return amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function readLegacyReminder(message: string): PaymentReminderSlip | null {
  const match = message.match(
    new RegExp(
      String.raw`^Hello (.+?), this is a payment reminder from (.+?)\. Your outstanding balance is ₨ (${MONEY}), due on ([^.]+)\.(?: Open bills: ([\s\S]*?))? Please clear it at the shop\.$`,
    ),
  );
  if (!match) {
    return null;
  }
  return {
    customerName: match[1] ?? '',
    businessName: match[2] ?? '',
    outstanding: match[3] ?? '',
    dueOn: match[4] ?? '',
    bills: readLegacyBills(match[5] ?? ''),
    extraBills: extraBillCount(match[5] ?? ''),
    note: 'Please clear it at the shop.',
  };
}

function readLegacyBills(text: string): PaymentReminderBill[] {
  const bills: PaymentReminderBill[] = [];
  const pattern = new RegExp(
    String.raw`Invoice (\d+): total ₨ (${MONEY}), received ₨ (${MONEY}), remaining ₨ (${MONEY})\.`,
    'g',
  );
  for (const bill of text.matchAll(pattern)) {
    bills.push({
      invoiceNumber: bill[1] ?? '',
      total: bill[2] ?? '',
      paid: bill[3] ?? '',
      remaining: bill[4] ?? '',
    });
  }
  return bills;
}

function readLinedReminder(message: string): PaymentReminderSlip | null {
  const match = message.match(
    new RegExp(
      String.raw`^(.+)\nPayment reminder\n\nHello (.+)\n\nOutstanding: ₨ (${MONEY})\nDue: (.+)\n([\s\S]*)$`,
    ),
  );
  if (!match?.[5]) {
    return null;
  }
  return {
    businessName: match[1] ?? '',
    customerName: match[2] ?? '',
    outstanding: match[3] ?? '',
    dueOn: match[4] ?? '',
    bills: readLinedBills(match[5]),
    extraBills: extraBillCount(match[5]),
    note: closingNote(match[5]),
  };
}

function readLinedBills(text: string): PaymentReminderBill[] {
  const bills: PaymentReminderBill[] = [];
  const pattern = new RegExp(
    String.raw`Invoice (\d+)(?: · ([^\n]+))?\nTotal: ₨ (${MONEY})\nReceived: ₨ (${MONEY})\nRemaining: ₨ (${MONEY})`,
    'g',
  );
  for (const bill of text.matchAll(pattern)) {
    bills.push({
      invoiceNumber: bill[1] ?? '',
      issuedAt: bill[2] ?? null,
      total: bill[3] ?? '',
      paid: bill[4] ?? '',
      remaining: bill[5] ?? '',
    });
  }
  return bills;
}

function closingNote(text: string): string {
  const chunks = text
    .split(/\n\n/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  const last = chunks[chunks.length - 1] ?? '';
  if (
    last.length === 0 ||
    last.startsWith('Open bills') ||
    last.startsWith('Invoice ') ||
    /^\d+ more bills? (?:is|are) still open\.$/.test(last)
  ) {
    return DEFAULT_REMINDER_NOTE;
  }
  return last;
}

function extraBillCount(text: string): number {
  const extra = text.match(/(\d+) more bills? (?:is|are) still open\./);
  return extra?.[1] ? Number(extra[1]) : 0;
}
