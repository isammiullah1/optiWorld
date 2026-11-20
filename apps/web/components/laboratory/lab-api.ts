'use client';

import {
  LabBillSchema,
  LabBoardJobSchema,
  LabServiceSchema,
  LabBoardSchema,
  LabClientJobsSchema,
  LabClientRowSchema,
  LabRequestListsSchema,
  LabRetailerRequestSchema,
  LabInventoryItemSchema,
  LabIncomeSchema,
  LabJobActivitySchema,
  LabJobHistorySchema,
  LabTurnaroundSchema,
  RetailerSearchHitSchema,
  type RetailerSearchHit,
  type AdjustLabStockRequest,
  type CreateLabBoardJobRequest,
  type ItemPrescription,
  type JobStatus,
  type LabBill,
  type LabBoard,
  type LabServiceRow,
  type SaveLabServiceRequest,
  type UpdateLabBillRequest,
  type LabBoardJob,
  type LabClientJobs,
  type LabClientRow,
  type LabRequestLists,
  type LabIncome,
  type LabIncomeQuery,
  type LabInventoryItem,
  type LabJobActivity,
  type LabJobHistory,
  type LabTurnaround,
  type SaveLabInventoryRequest,
} from '@optiworld/shared';
import { z } from 'zod';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const BoardResponseSchema = z.object({ success: z.literal(true), data: LabBoardSchema });
const JobResponseSchema = z.object({ success: z.literal(true), data: LabBoardJobSchema });
const CreatedResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    id: z.string().uuid(),
    referenceNumber: z.string(),
    invoice: LabBillSchema.nullable(),
  }),
});
const UrgentResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({ isUrgent: z.boolean() }),
});
const NotesResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({ notes: z.string().nullable() }),
});
const NotifyResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({ sent: z.boolean(), message: z.string() }),
});

export async function loadLabBoard(
  token: string,
  filters: { q?: string; retailerOrgId?: string; from?: string; to?: string },
): Promise<LabBoard> {
  const params = new URLSearchParams();
  if (filters.q) {
    params.set('q', filters.q);
  }
  if (filters.retailerOrgId) {
    params.set('retailerOrgId', filters.retailerOrgId);
  }
  if (filters.from) {
    params.set('from', filters.from);
  }
  if (filters.to) {
    params.set('to', filters.to);
  }
  const query = params.toString();
  const payload = await request(
    token,
    `/api/v1/lab/jobs${query ? `?${query}` : ''}`,
    BoardResponseSchema,
  );
  return payload.data;
}

export async function loadLabBoardJob(token: string, jobId: string): Promise<LabBoardJob> {
  const payload = await request(token, `/api/v1/lab/jobs/${jobId}`, JobResponseSchema);
  return payload.data;
}

export async function reserveLabReference(token: string): Promise<string> {
  const payload = await request(
    token,
    '/api/v1/lab/jobs/next-reference',
    z.object({ success: z.literal(true), data: z.object({ referenceNumber: z.string() }) }),
  );
  return payload.data.referenceNumber;
}

export async function createLabBoardJob(
  token: string,
  input: CreateLabBoardJobRequest,
): Promise<{ id: string; referenceNumber: string; invoice: LabBill | null }> {
  const payload = await send(token, '/api/v1/lab/jobs', 'POST', input, CreatedResponseSchema);
  return payload.data;
}

export async function updateLabBoardStatus(
  token: string,
  jobId: string,
  status: JobStatus,
  note?: string,
): Promise<LabBoardJob> {
  const payload = await send(
    token,
    `/api/v1/lab-jobs/${jobId}/status`,
    'PATCH',
    { status, note: note ?? '' },
    JobResponseSchema,
  );
  return payload.data;
}

export async function updateLabBoardUrgent(
  token: string,
  jobId: string,
  isUrgent: boolean,
): Promise<boolean> {
  const payload = await send(
    token,
    `/api/v1/lab-jobs/${jobId}/urgent`,
    'PATCH',
    { isUrgent },
    UrgentResponseSchema,
  );
  return payload.data.isUrgent;
}

export async function updateLabBoardNotes(
  token: string,
  jobId: string,
  notes: string,
): Promise<string | null> {
  const payload = await send(
    token,
    `/api/v1/lab-jobs/${jobId}/notes`,
    'PATCH',
    { notes },
    NotesResponseSchema,
  );
  return payload.data.notes;
}

export async function updateLabBoardPrescription(
  token: string,
  jobId: string,
  prescription: ItemPrescription,
): Promise<LabBoardJob> {
  const payload = await send(
    token,
    `/api/v1/lab-jobs/${jobId}/prescription`,
    'PATCH',
    { prescription },
    JobResponseSchema,
  );
  return payload.data;
}

export async function reopenLabJob(token: string, jobId: string, reason: string): Promise<string> {
  const payload = await send(
    token,
    `/api/v1/lab-jobs/${jobId}/reopen`,
    'POST',
    { reason },
    z.object({
      success: z.literal(true),
      data: z.object({ id: z.string().uuid(), message: z.string() }),
    }),
  );
  return payload.data.message;
}

export async function cancelLabBoardJob(
  token: string,
  jobId: string,
  reason: string,
): Promise<LabBoardJob> {
  const payload = await send(
    token,
    `/api/v1/lab-jobs/${jobId}/cancel`,
    'POST',
    { reason },
    JobResponseSchema,
  );
  return payload.data;
}

export async function acceptLabBoardJob(token: string, jobId: string): Promise<LabBoardJob> {
  const payload = await send(
    token,
    `/api/v1/lab-jobs/${jobId}/accept`,
    'POST',
    {},
    JobResponseSchema,
  );
  return payload.data;
}

export async function rejectLabBoardJob(
  token: string,
  jobId: string,
  reason: string,
): Promise<{ sent: boolean; message: string }> {
  const payload = await send(
    token,
    `/api/v1/lab-jobs/${jobId}/reject`,
    'POST',
    { reason },
    NotifyResponseSchema,
  );
  return payload.data;
}

export async function respondToLabShopRequest(
  token: string,
  jobId: string,
  action: 'ACCEPT' | 'DECLINE',
): Promise<LabBoardJob> {
  const payload = await send(
    token,
    `/api/v1/lab-jobs/${jobId}/shop-request`,
    'POST',
    { action },
    JobResponseSchema,
  );
  return payload.data;
}

export async function remindLabMaterial(
  token: string,
  jobId: string,
): Promise<{ sent: boolean; message: string }> {
  const payload = await send(
    token,
    `/api/v1/lab-jobs/${jobId}/material-reminder`,
    'POST',
    {},
    NotifyResponseSchema,
  );
  return payload.data;
}

export async function notifyLabRetailer(
  token: string,
  jobId: string,
): Promise<{ sent: boolean; message: string }> {
  const payload = await send(
    token,
    `/api/v1/lab-jobs/${jobId}/notify-retailer`,
    'POST',
    {},
    NotifyResponseSchema,
  );
  return payload.data;
}

const RetailerSearchResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(RetailerSearchHitSchema),
});
const RetailerConnectResponseSchema = z.object({
  success: z.literal(true),
  data: RetailerSearchHitSchema,
});
const InventoryResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(LabInventoryItemSchema),
});
const InventoryItemResponseSchema = z.object({
  success: z.literal(true),
  data: LabInventoryItemSchema,
});
const ClientsResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(LabClientRowSchema),
});
const RequestsResponseSchema = z.object({ success: z.literal(true), data: LabRequestListsSchema });
const RequestsActionSchema = z.object({ success: z.literal(true), data: LabRetailerRequestSchema });
const ClientJobsResponseSchema = z.object({ success: z.literal(true), data: LabClientJobsSchema });
const ActivityResponseSchema = z.object({ success: z.literal(true), data: LabJobActivitySchema });
const TurnaroundResponseSchema = z.object({ success: z.literal(true), data: LabTurnaroundSchema });
const HistoryResponseSchema = z.object({ success: z.literal(true), data: LabJobHistorySchema });

export async function searchLabRetailers(
  token: string,
  query: string,
): Promise<RetailerSearchHit[]> {
  const payload = await request(
    token,
    `/api/v1/lab/retailers/search?q=${encodeURIComponent(query)}`,
    RetailerSearchResponseSchema,
  );
  return payload.data;
}

export async function connectLabRetailer(token: string, retailerOrgId: string): Promise<void> {
  await send(
    token,
    '/api/v1/lab/retailers/connect',
    'POST',
    { retailerOrgId },
    RetailerConnectResponseSchema,
  );
}

export async function loadLabInventory(token: string): Promise<LabInventoryItem[]> {
  const payload = await request(token, '/api/v1/lab/inventory', InventoryResponseSchema);
  return payload.data;
}

export async function saveLabInventory(
  token: string,
  input: SaveLabInventoryRequest,
  itemId?: string,
): Promise<LabInventoryItem> {
  const payload = await send(
    token,
    itemId ? `/api/v1/lab/inventory/${itemId}` : '/api/v1/lab/inventory',
    itemId ? 'PATCH' : 'POST',
    input,
    InventoryItemResponseSchema,
  );
  return payload.data;
}

export async function adjustLabInventory(
  token: string,
  itemId: string,
  input: AdjustLabStockRequest,
): Promise<LabInventoryItem> {
  const payload = await send(
    token,
    `/api/v1/lab/inventory/${itemId}/adjust`,
    'POST',
    input,
    InventoryItemResponseSchema,
  );
  return payload.data;
}

export async function loadLabRequests(token: string): Promise<LabRequestLists> {
  const payload = await request(token, '/api/v1/lab/connections', RequestsResponseSchema);
  return payload.data;
}

export async function acceptLabRequest(token: string, requestId: string): Promise<void> {
  await send(
    token,
    `/api/v1/lab/connections/${requestId}/approve`,
    'PATCH',
    {},
    RequestsActionSchema,
  );
}

export async function declineLabRequest(token: string, requestId: string): Promise<void> {
  await send(
    token,
    `/api/v1/lab/connections/${requestId}/decline`,
    'PATCH',
    {},
    RequestsActionSchema,
  );
}

export async function cancelLabRequest(token: string, requestId: string): Promise<void> {
  await send(
    token,
    `/api/v1/lab/connections/${requestId}/cancel`,
    'PATCH',
    {},
    RequestsActionSchema,
  );
}

export async function loadLabClients(token: string): Promise<LabClientRow[]> {
  const payload = await request(token, '/api/v1/lab/clients', ClientsResponseSchema);
  return payload.data;
}

export async function loadLabClientJobs(token: string, clientId: string): Promise<LabClientJobs> {
  const payload = await request(
    token,
    `/api/v1/lab/clients/${clientId}/jobs`,
    ClientJobsResponseSchema,
  );
  return payload.data;
}

const IncomeResponseSchema = z.object({ success: z.literal(true), data: LabIncomeSchema });

export async function loadLabIncome(token: string, query: LabIncomeQuery): Promise<LabIncome> {
  const params = new URLSearchParams({ from: query.from, to: query.to });
  if (query.party) {
    params.set('party', query.party);
  }
  if (query.service) {
    params.set('service', query.service);
  }
  if (query.billStatus) {
    params.set('billStatus', query.billStatus);
  }
  if (query.status) {
    params.set('status', query.status);
  }
  if (query.urgent) {
    params.set('urgent', query.urgent);
  }
  if (query.finishedBy) {
    params.set('finishedBy', query.finishedBy);
  }
  const payload = await request(
    token,
    `/api/v1/lab/income?${params.toString()}`,
    IncomeResponseSchema,
  );
  return payload.data;
}

export async function downloadLabIncome(
  token: string,
  query: LabIncomeQuery & { format: 'xlsx' | 'pdf' },
): Promise<void> {
  const params = new URLSearchParams({ from: query.from, to: query.to, format: query.format });
  if (query.party) {
    params.set('party', query.party);
  }
  if (query.service) {
    params.set('service', query.service);
  }
  if (query.billStatus) {
    params.set('billStatus', query.billStatus);
  }
  if (query.status) {
    params.set('status', query.status);
  }
  if (query.urgent) {
    params.set('urgent', query.urgent);
  }
  if (query.finishedBy) {
    params.set('finishedBy', query.finishedBy);
  }
  const response = await fetch(`${API_BASE}/api/v1/lab/income/export?${params.toString()}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    throw new Error(messageFrom(payload) ?? 'The workbook could not be downloaded');
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = query.format === 'pdf' ? 'lab-income.pdf' : 'lab-income.xlsx';
  link.click();
  URL.revokeObjectURL(url);
}

export async function loadLabJobActivity(
  token: string,
  from: string,
  to: string,
): Promise<LabJobActivity> {
  const payload = await request(
    token,
    `/api/v1/lab/reports/job-activity?from=${from}&to=${to}`,
    ActivityResponseSchema,
  );
  return payload.data;
}

export async function loadLabTurnaround(
  token: string,
  from: string,
  to: string,
): Promise<LabTurnaround> {
  const payload = await request(
    token,
    `/api/v1/lab/reports/turnaround?from=${from}&to=${to}`,
    TurnaroundResponseSchema,
  );
  return payload.data;
}

export async function loadLabJobHistory(
  token: string,
  filters: { q?: string; status?: JobStatus | ''; from?: string; to?: string },
): Promise<LabJobHistory> {
  const params = new URLSearchParams();
  if (filters.q) {
    params.set('q', filters.q);
  }
  if (filters.status) {
    params.set('status', filters.status);
  }
  if (filters.from) {
    params.set('from', filters.from);
  }
  if (filters.to) {
    params.set('to', filters.to);
  }
  const query = params.toString();
  const payload = await request(
    token,
    `/api/v1/lab/reports/job-history${query ? `?${query}` : ''}`,
    HistoryResponseSchema,
  );
  return payload.data;
}

export async function downloadLabJobHistory(
  token: string,
  filters: {
    q?: string;
    status?: JobStatus | '';
    from?: string;
    to?: string;
    format: 'xlsx' | 'pdf';
  },
): Promise<void> {
  const params = new URLSearchParams();
  if (filters.q) {
    params.set('q', filters.q);
  }
  if (filters.status) {
    params.set('status', filters.status);
  }
  if (filters.from) {
    params.set('from', filters.from);
  }
  if (filters.to) {
    params.set('to', filters.to);
  }
  params.set('format', filters.format);
  const response = await fetch(
    `${API_BASE}/api/v1/lab/reports/job-history/export?${params.toString()}`,
    {
      headers: { authorization: `Bearer ${token}` },
    },
  );
  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    throw new Error(messageFrom(payload) ?? 'The workbook could not be downloaded');
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filters.format === 'pdf' ? 'job-history.pdf' : 'job-history.xlsx';
  link.click();
  URL.revokeObjectURL(url);
}

export async function loadOwnLabServices(token: string): Promise<LabServiceRow[]> {
  const payload = await request(
    token,
    '/api/v1/lab/services',
    z.object({ success: z.literal(true), data: z.array(LabServiceSchema) }),
  );
  return payload.data;
}

export async function saveOwnLabService(
  token: string,
  serviceId: string | null,
  input: SaveLabServiceRequest,
): Promise<LabServiceRow> {
  const payload = await send(
    token,
    serviceId ? `/api/v1/lab/services/${serviceId}` : '/api/v1/lab/services',
    serviceId ? 'PATCH' : 'POST',
    input,
    z.object({ success: z.literal(true), data: LabServiceSchema }),
  );
  return payload.data;
}

export async function loadLaboratoryBills(
  token: string,
  query: { labClientId?: string; from?: string; to?: string },
): Promise<LabBill[]> {
  const params = new URLSearchParams();
  if (query.labClientId) {
    params.set('labClientId', query.labClientId);
  }
  if (query.from) {
    params.set('from', query.from);
  }
  if (query.to) {
    params.set('to', query.to);
  }
  const payload = await request(
    token,
    `/api/v1/lab/bills?${params.toString()}`,
    z.object({ success: z.literal(true), data: z.array(LabBillSchema) }),
  );
  return payload.data;
}

export async function issueLabBill(token: string, billId: string): Promise<LabBill> {
  const payload = await send(
    token,
    `/api/v1/lab/bills/${billId}/issue`,
    'POST',
    {},
    z.object({ success: z.literal(true), data: LabBillSchema }),
  );
  return payload.data;
}

export async function collectWalkInBalance(token: string, billId: string): Promise<LabBill> {
  const payload = await send(
    token,
    `/api/v1/lab/bills/${billId}/collect`,
    'POST',
    {},
    z.object({ success: z.literal(true), data: LabBillSchema }),
  );
  return payload.data;
}

export async function clearLabBill(token: string, billId: string): Promise<LabBill> {
  const payload = await send(
    token,
    `/api/v1/lab/bills/${billId}/clear`,
    'POST',
    {},
    z.object({ success: z.literal(true), data: LabBillSchema }),
  );
  return payload.data;
}

export async function addLabBillLine(
  token: string,
  billId: string,
  labServiceId: string,
  quantity: number,
): Promise<LabBill> {
  const payload = await send(
    token,
    `/api/v1/lab/bills/${billId}/lines`,
    'POST',
    { labServiceId, quantity },
    z.object({ success: z.literal(true), data: LabBillSchema }),
  );
  return payload.data;
}

export async function adjustLabBill(
  token: string,
  billId: string,
  note: string,
  amount: string,
): Promise<LabBill> {
  const payload = await send(
    token,
    `/api/v1/lab/bills/${billId}/adjustments`,
    'POST',
    { note, amount },
    z.object({ success: z.literal(true), data: LabBillSchema }),
  );
  return payload.data;
}

export async function updateLabBill(
  token: string,
  billId: string,
  input: UpdateLabBillRequest,
): Promise<LabBill> {
  const payload = await send(
    token,
    `/api/v1/lab/bills/${billId}`,
    'PATCH',
    input,
    z.object({ success: z.literal(true), data: LabBillSchema }),
  );
  return payload.data;
}

export async function downloadLaboratoryBills(
  token: string,
  format: 'xlsx' | 'pdf',
  query: { from?: string; to?: string; labClientId?: string },
): Promise<void> {
  const params = new URLSearchParams({ format });
  if (query.from) {
    params.set('from', query.from);
  }
  if (query.to) {
    params.set('to', query.to);
  }
  if (query.labClientId) {
    params.set('labClientId', query.labClientId);
  }
  const response = await fetch(`${API_BASE}/api/v1/lab/bills/export?${params.toString()}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error('The lab income sheet could not be downloaded');
  }
  await saveLabDownload(response, `lab-income.${format}`);
}

async function saveLabDownload(response: Response, filename: string): Promise<void> {
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

async function request<T>(token: string, path: string, schema: z.ZodType<T>): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  return read(response, schema);
}

async function send<T>(
  token: string,
  path: string,
  method: 'POST' | 'PATCH',
  body: unknown,
  schema: z.ZodType<T>,
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return read(response, schema);
}

async function read<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
  const json: unknown = await response.json();
  const parsed = schema.safeParse(json);
  if (!response.ok || !parsed.success) {
    const message = messageFrom(json);
    throw new Error(message ?? 'The laboratory request failed');
  }
  return parsed.data;
}

function messageFrom(json: unknown): string | null {
  if (!json || typeof json !== 'object' || !('error' in json)) {
    return null;
  }
  const error = json.error;
  if (
    !error ||
    typeof error !== 'object' ||
    !('message' in error) ||
    typeof error.message !== 'string'
  ) {
    return null;
  }
  return error.message;
}
