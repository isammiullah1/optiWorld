import { prisma } from '@optiworld/db';
import { isMarkedDoneNote, type JobStatus, type RecordActivity } from '@optiworld/shared';

const INVOICE_KIND: Record<string, RecordActivity['kind']> = {
  POS_INVOICE_CREATED: 'PREPARED',
  OFFLINE_INVOICE_SYNCED: 'PREPARED',
  OFFLINE_INVOICE_REPLACED: 'PREPARED',
  INVOICE_CREDIT_CLEARED: 'UPDATED',
  INVOICE_PRESCRIPTION_UPDATED: 'UPDATED',
  INVOICE_SENT_TO_LAB: 'UPDATED',
  INVOICE_LAB_UNSENT: 'UPDATED',
  INVOICE_LAB_CANCELLED: 'UPDATED',
  OFFLINE_INVOICE_REVIEWED: 'UPDATED',
  INVOICE_CANCELLED: 'CANCELLED',
  INVOICE_REMOVED: 'DELETED',
};

export async function invoiceActivity(
  orgId: string,
  invoiceId: string,
  lines: readonly string[] = [],
): Promise<RecordActivity[]> {
  const grouped = await invoiceActivityMap(orgId, [invoiceId], new Map([[invoiceId, lines]]));
  return grouped.get(invoiceId) ?? [];
}

export async function invoiceActivityMap(
  orgId: string,
  invoiceIds: readonly string[],
  linesByInvoice: ReadonlyMap<string, readonly string[]> = new Map(),
): Promise<Map<string, RecordActivity[]>> {
  const grouped = new Map<string, RecordActivity[]>();
  if (invoiceIds.length === 0) {
    return grouped;
  }
  const rows = await prisma.auditLog.findMany({
    where: {
      orgId,
      entityType: 'Invoice',
      entityId: { in: [...invoiceIds] },
      action: { in: Object.keys(INVOICE_KIND) },
    },
    orderBy: { createdAt: 'asc' },
    select: {
      entityId: true,
      action: true,
      createdAt: true,
      metadata: true,
      user: { select: { name: true } },
    },
  });
  const labNames = await laboratoryNames(rows.map((row) => readRecord(row.metadata).labOrgId));
  for (const row of rows) {
    const kind = INVOICE_KIND[row.action];
    if (!kind) {
      continue;
    }
    const current = grouped.get(row.entityId) ?? [];
    const details = invoiceDetails(row.action, readRecord(row.metadata), labNames);
    if (kind === 'PREPARED') {
      for (const line of linesByInvoice.get(row.entityId) ?? []) {
        details.push(`Added ${line}.`);
      }
    }
    current.push({
      kind,
      at: row.createdAt.toISOString(),
      userName: row.user?.name ?? null,
      details: details.map((text) => ({ text })),
    });
    grouped.set(row.entityId, current);
  }
  return grouped;
}

export function orderLine(name: string, quantity: number, price: string | null): string {
  if (!price) {
    return `${name} × ${quantity} · Price on request`;
  }
  const amount = Number(price);
  const shown = Number.isFinite(amount)
    ? amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : price;
  return `${name} × ${quantity} · ₨ ${shown}`;
}

const SHOP_ACTION = /^The retailer (cancelled|updated) this pending order\.$/;

export function speakShopAction(
  content: string,
  actor: { isViewer: boolean; name: string; shopName: string },
): string {
  const match = SHOP_ACTION.exec(content);
  const verb = match?.[1];
  if (!verb) {
    return content;
  }
  return actor.isViewer
    ? `You ${verb} this pending order.`
    : `${actor.name} from ${actor.shopName} ${verb} this pending order.`;
}

export function orderActivity(
  messages: readonly {
    content: string;
    spoken?: string;
    createdAt: Date;
    senderName: string | null;
  }[],
  lines: readonly string[] = [],
): RecordActivity[] {
  return messages.flatMap((message) => {
    const kind = orderKind(message.content);
    if (!kind) {
      return [];
    }
    const text = message.spoken ?? message.content;
    return [
      {
        kind,
        at: message.createdAt.toISOString(),
        userName: message.senderName,
        details: [kind === 'PREPARED' ? { text, lines: [...lines] } : { text }],
      },
    ];
  });
}

const LAB_STEP: Record<JobStatus, string> = {
  SUBMITTED: 'Submitted',
  CONFIRMED: 'Confirmed',
  RECEIVED: 'Received',
  CUTTING: 'Processing',
  FITTING: 'Processing',
  QC: 'Processing',
  READY: 'Ready',
  DISPATCHED: 'Dispatched',
  REJECTED: 'Rejected',
  OUTSOURCED: 'Outsourced',
  CANCELLED: 'Cancelled',
};

export function labActivity(
  history: readonly {
    status: JobStatus;
    changedAt: Date;
    userName: string | null;
    notes: string | null;
    byShop?: boolean;
  }[],
): RecordActivity[] {
  return history.map((entry, index) => ({
    kind: entry.status === 'CANCELLED' ? 'CANCELLED' : index === 0 ? 'PREPARED' : 'UPDATED',
    at: entry.changedAt.toISOString(),
    userName: entry.userName,
    details: [{ text: labDetail(entry.status, index === 0, entry.byShop === true, entry.notes) }],
  }));
}

export function historyAction(status: JobStatus, byShop: boolean, notes?: string | null): string {
  if (isMarkedDoneNote(notes)) {
    return 'Marked done by';
  }
  if (notes?.startsWith('Reopened.')) {
    return 'Reopened by';
  }
  if (status === 'CANCELLED') {
    return 'Cancelled by';
  }
  if (status === 'REJECTED') {
    return 'Rejected by';
  }
  if (status === 'OUTSOURCED') {
    return 'Outsourced by';
  }
  if (status === 'SUBMITTED') {
    return 'Submitted by';
  }
  if (status === 'CONFIRMED') {
    return 'Confirmed by';
  }
  if (status === 'RECEIVED') {
    return byShop ? 'Submitted by' : 'Received by';
  }
  const verb: Record<'CUTTING' | 'FITTING' | 'QC' | 'READY' | 'DISPATCHED', string> = {
    CUTTING: 'Processing started by',
    FITTING: 'Processing started by',
    QC: 'Processing started by',
    READY: 'Marked ready by',
    DISPATCHED: 'Dispatched by',
  };
  return verb[status];
}

function labDetail(
  status: JobStatus,
  first: boolean,
  byShop: boolean,
  notes: string | null,
): string {
  if (isMarkedDoneNote(notes)) {
    return 'Marked the job done.';
  }
  if (notes?.startsWith('Reopened.')) {
    const reason = notes.replace(/^Reopened\.\s*/, '').trim();
    return reason.length > 0 ? `Reopened the job. ${reason}` : 'Reopened the job.';
  }
  const step = LAB_STEP[status];
  const action =
    status === 'CANCELLED'
      ? 'Cancelled the job.'
      : status === 'REJECTED'
        ? 'Rejected the job.'
        : status === 'OUTSOURCED'
          ? 'The shop will finish this sale outside the laboratory.'
          : status === 'SUBMITTED'
            ? 'Submitted the job.'
            : status === 'CONFIRMED'
              ? 'Confirmed the job.'
              : status === 'RECEIVED' && byShop
                ? 'Submitted the job.'
                : status === 'RECEIVED'
                  ? 'Marked the material received.'
                  : first
                    ? 'Received the job.'
                    : `Moved the job to ${step}.`;
  return notes && notes.trim().length > 0 ? `${action} ${notes.trim()}` : action;
}

async function laboratoryNames(ids: readonly unknown[]): Promise<Map<string, string>> {
  const labIds = [
    ...new Set(ids.filter((id): id is string => typeof id === 'string' && id.length > 0)),
  ];
  if (labIds.length === 0) {
    return new Map();
  }
  const labs = await prisma.organisation.findMany({
    where: { id: { in: labIds } },
    select: { id: true, name: true },
  });
  return new Map(labs.map((lab) => [lab.id, lab.name]));
}

function invoiceDetails(
  action: string,
  metadata: Record<string, unknown>,
  labNames: ReadonlyMap<string, string>,
): string[] {
  const stored = stringList(metadata.details);
  if (stored.length > 0) {
    return stored;
  }
  const number = typeof metadata.invoiceNumber === 'number' ? ` #${metadata.invoiceNumber}` : '';
  const reason =
    typeof metadata.reason === 'string' && metadata.reason.trim().length > 0
      ? ` ${metadata.reason.trim()}`
      : '';
  if (action === 'POS_INVOICE_CREATED') {
    return [`Created invoice${number}.`];
  }
  if (action === 'OFFLINE_INVOICE_SYNCED') {
    return [`Synced this offline bill as invoice${number}.`];
  }
  if (action === 'OFFLINE_INVOICE_REPLACED') {
    return [`Replaced invoice${number} with the copy from the shop device.`];
  }
  if (action === 'INVOICE_CREDIT_CLEARED') {
    const amount = typeof metadata.amount === 'string' ? metadata.amount : null;
    const outstanding = typeof metadata.outstanding === 'string' ? metadata.outstanding : null;
    return [
      amount
        ? `Recorded ₨ ${amount} received.${outstanding ? ` Remaining ₨ ${outstanding}.` : ''}`
        : 'Recorded a payment on this bill.',
    ];
  }
  if (action === 'INVOICE_PRESCRIPTION_UPDATED') {
    return ['Updated the prescription. The earlier reading was not recorded.'];
  }
  if (action === 'INVOICE_SENT_TO_LAB') {
    const labId = typeof metadata.labOrgId === 'string' ? metadata.labOrgId : '';
    const lab = labNames.get(labId);
    return [lab ? `Sent the prescription to ${lab}.` : 'Sent the prescription to the laboratory.'];
  }
  if (action === 'INVOICE_LAB_UNSENT') {
    const references = stringList(metadata.references);
    return [
      references.length > 0
        ? `Took ${references.join(', ')} back before the laboratory started work.`
        : 'Took the laboratory job back before work started.',
    ];
  }
  if (action === 'INVOICE_LAB_CANCELLED') {
    return [`Cancelled the laboratory job.${reason}`];
  }
  if (action === 'OFFLINE_INVOICE_REVIEWED') {
    return ['Marked the offline bill as reviewed.'];
  }
  if (action === 'INVOICE_CANCELLED') {
    return [`Cancelled this bill.${reason}`];
  }
  if (action === 'INVOICE_REMOVED') {
    return [`Removed invoice${number}.`];
  }
  return ['No further detail was recorded.'];
}

function readRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function orderKind(content: string): RecordActivity['kind'] | null {
  if (content.startsWith('New order from ')) {
    return 'PREPARED';
  }
  if (
    content.includes('cancelled this pending order') ||
    content.startsWith('Cancellation accepted.')
  ) {
    return 'CANCELLED';
  }
  if (
    content.includes('updated this pending order') ||
    content === 'Order confirmed · locked' ||
    content === 'Order dispatched.' ||
    content === 'Order delivered.' ||
    content.startsWith('Order amendment accepted:')
  ) {
    return 'UPDATED';
  }
  return null;
}
