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
});

export type SendPaymentReminderRequest = z.infer<typeof SendPaymentReminderSchema>;

export const SendRemindersSchema = z.object({
  customerIds: z.array(z.string().uuid()).max(200).optional(),
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

export function paymentReminderMessage(input: {
  customerName: string;
  businessName: string;
  outstanding: string;
  dueOn: string;
  bills?: ReadonlyArray<{ invoiceNumber: number; total: string; paid: string; remaining: string }>;
}): string {
  const bills = input.bills ?? [];
  const listed = bills
    .slice(0, 6)
    .map(
      (bill) =>
        `Invoice ${bill.invoiceNumber}: total ₨ ${bill.total}, received ₨ ${bill.paid}, remaining ₨ ${bill.remaining}.`,
    );
  const extra = bills.length > 6 ? ` ${bills.length - 6} more bills are still open.` : '';
  const billText = listed.length > 0 ? ` Open bills: ${listed.join(' ')}${extra}` : '';
  return `Hello ${input.customerName}, this is a payment reminder from ${input.businessName}. Your outstanding balance is ₨ ${input.outstanding}, due on ${input.dueOn}.${billText} Please clear it at the shop.`;
}
