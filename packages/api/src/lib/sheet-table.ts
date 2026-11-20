import type ExcelJS from 'exceljs';

import { reportTone } from './report-tones.js';

const BORDER = { style: 'thin' as const, color: { argb: 'FF8A92A4' } };

export function styleSheet(sheet: ExcelJS.Worksheet): void {
  const columns = Math.max(sheet.columnCount, sheet.columns.length ?? 0);
  const rows = sheet.rowCount;
  if (columns === 0 || rows === 0) {
    return;
  }
  sheet.views = [{ state: 'frozen', ySplit: 1, showGridLines: false }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: rows, column: columns },
  };
  const headers: string[] = [];
  for (let columnIndex = 1; columnIndex <= columns; columnIndex += 1) {
    headers.push(cellText(sheet.getRow(1).getCell(columnIndex).value));
  }
  const valueColumn = headers.findIndex((header) => header.trim().toLowerCase() === 'value');
  for (let rowIndex = 1; rowIndex <= rows; rowIndex += 1) {
    const row = sheet.getRow(rowIndex);
    row.height = rowIndex === 1 ? 22 : 18;
    const rowLabel = cellText(row.getCell(1).value);
    const amountText = valueColumn >= 0 ? cellText(row.getCell(valueColumn + 1).value) : rowLabel;
    for (let columnIndex = 1; columnIndex <= columns; columnIndex += 1) {
      const cell = row.getCell(columnIndex);
      cell.border = { top: BORDER, left: BORDER, bottom: BORDER, right: BORDER };
      cell.alignment = { vertical: 'middle', wrapText: true };
      if (rowIndex === 1) {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Calibri', size: 11 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF003153' } };
        continue;
      }
      const tone = reportTone({
        column: headers[columnIndex - 1] ?? '',
        value: cellText(cell.value),
        rowLabel,
        headers,
        amountText,
      });
      if (tone) {
        cell.font = { bold: true, color: { argb: tone.excelFont }, name: 'Calibri', size: 11 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: tone.excelFill } };
        continue;
      }
      cell.font = { color: { argb: 'FF1A1E2E' }, name: 'Calibri', size: 11 };
      if (rowIndex % 2 === 0) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F7FB' } };
      }
    }
  }
}

function cellText(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value instanceof Date) {
    return '';
  }
  if (value && typeof value === 'object' && 'text' in value && typeof value.text === 'string') {
    return value.text;
  }
  if (value && typeof value === 'object' && 'result' in value) {
    return cellText(value.result);
  }
  return '';
}
