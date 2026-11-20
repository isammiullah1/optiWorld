export type ReportTone = {
  excelFill: string;
  excelFont: string;
  pdfFill: string;
  pdfFont: string;
};

const TEAL: ReportTone = {
  excelFill: 'FFE7F3F4',
  excelFont: 'FF367588',
  pdfFill: '0.906 0.953 0.957',
  pdfFont: '0.212 0.459 0.533',
};
const AMBER: ReportTone = {
  excelFill: 'FFFEF3E2',
  excelFont: 'FFD97C10',
  pdfFill: '0.996 0.953 0.886',
  pdfFont: '0.851 0.486 0.063',
};
const RED: ReportTone = {
  excelFill: 'FFFDEAEA',
  excelFont: 'FFC93535',
  pdfFill: '0.992 0.918 0.918',
  pdfFont: '0.788 0.208 0.208',
};
const BLUE: ReportTone = {
  excelFill: 'FFE5F2F7',
  excelFont: 'FF016795',
  pdfFill: '0.898 0.949 0.969',
  pdfFont: '0.004 0.404 0.584',
};

export function reportTone(input: {
  column: string;
  value: string;
  rowLabel: string;
  headers: readonly string[];
  amountText?: string;
}): ReportTone | null {
  const column = input.column.trim().toLowerCase();
  const value = input.value.trim();
  const label = input.rowLabel.trim().toLowerCase();
  const headers = input.headers.map((header) => header.trim().toLowerCase());
  if (column === 'item' || column === 'value') {
    return summaryTone(label, input.amountText ?? value);
  }
  const status = statusTone(column, value.toLowerCase());
  if (status) {
    return status;
  }
  const amount = parseAmount(value);
  if (column.includes('profit') || column.includes('margin')) {
    return amount !== null && amount < 0 ? RED : TEAL;
  }
  if (column.includes('cost')) {
    return AMBER;
  }
  if (column.includes('discount') && amount !== null && amount > 0) {
    return AMBER;
  }
  if (column.includes('lab')) {
    return AMBER;
  }
  if (column.includes('return') && amount !== null && amount > 0) {
    return RED;
  }
  if (column.includes('sale') || column.includes('revenue')) {
    return BLUE;
  }
  if (column === 'cash') {
    return TEAL;
  }
  if (column.includes('credit') || column === 'outstanding') {
    return amount !== null && amount > 0 ? AMBER : null;
  }
  if (/90\+|61-90|61–90/.test(column)) {
    return amount !== null && amount > 0 ? RED : null;
  }
  if (/31-60|31–60/.test(column)) {
    return amount !== null && amount > 0 ? AMBER : null;
  }
  if (column === 'total') {
    if (isAgingSheet(headers)) {
      return amount !== null && amount > 0 ? AMBER : null;
    }
    if (isSalesSheet(headers)) {
      return BLUE;
    }
  }
  if (column === 'sold' && amount !== null && amount > 0) {
    return TEAL;
  }
  if (column === 'added' && amount !== null && amount > 0) {
    return BLUE;
  }
  if (column === 'closing' && amount === 0) {
    return RED;
  }
  return null;
}

function summaryTone(label: string, amountText: string): ReportTone | null {
  const amount = parseAmount(amountText);
  if (label.includes('profit')) {
    return amount !== null && amount < 0 ? RED : TEAL;
  }
  if (label.includes('cost') || label.includes('lab expense')) {
    return AMBER;
  }
  if (label.includes('sale') || label === 'revenue') {
    return BLUE;
  }
  if (label.includes('average bill') || label.includes('average value')) {
    return BLUE;
  }
  if (label.includes('cash')) {
    return TEAL;
  }
  if (label.includes('credit') || label.includes('outstanding')) {
    return AMBER;
  }
  if (label.includes('low stock') && amount !== null && amount > 0) {
    return AMBER;
  }
  return null;
}

function statusTone(column: string, value: string): ReportTone | null {
  if (column === 'urgent') {
    return value === 'yes' ? RED : null;
  }
  if (column !== 'status' && column !== 'risk' && column !== 'payment') {
    return null;
  }
  if (
    value === 'paid' ||
    value === 'cash' ||
    value === 'ready' ||
    value === 'completed' ||
    value === 'dispatched' ||
    value === 'delivered' ||
    value === 'current'
  ) {
    return TEAL;
  }
  if (
    value === 'confirmed' ||
    value === 'active' ||
    value === 'received' ||
    value === 'processing' ||
    value === 'issued' ||
    value === 'card'
  ) {
    return BLUE;
  }
  if (
    value === 'pending' ||
    value === 'open' ||
    value === 'waiting' ||
    value === 'submitted' ||
    value === 'watch' ||
    value === 'outsourced' ||
    value === 'credit' ||
    value === '31-60 days'
  ) {
    return AMBER;
  }
  if (
    value === 'rejected' ||
    value === 'void' ||
    value === 'cancelled' ||
    value === 'canceled' ||
    value === 'removed' ||
    value === 'overdue' ||
    value === 'severe' ||
    value === 'critical'
  ) {
    return RED;
  }
  return null;
}

function isAgingSheet(headers: readonly string[]): boolean {
  return headers.some((header) => /outstanding|90\+|31-60|61-90|risk/.test(header));
}

function isSalesSheet(headers: readonly string[]): boolean {
  return headers.some(
    (header) => header === 'payment' || header === 'invoice' || header.includes('profit'),
  );
}

function parseAmount(value: string): number | null {
  const cleaned = value.replace(/,/g, '').trim();
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) {
    return null;
  }
  const amount = Number(cleaned);
  return Number.isFinite(amount) ? amount : null;
}
