import type ExcelJS from 'exceljs';

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
  for (let rowIndex = 1; rowIndex <= rows; rowIndex += 1) {
    const row = sheet.getRow(rowIndex);
    row.height = rowIndex === 1 ? 22 : 18;
    for (let columnIndex = 1; columnIndex <= columns; columnIndex += 1) {
      const cell = row.getCell(columnIndex);
      cell.border = { top: BORDER, left: BORDER, bottom: BORDER, right: BORDER };
      cell.alignment = { vertical: 'middle', wrapText: true };
      if (rowIndex === 1) {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Calibri', size: 11 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF003153' } };
      } else if (rowIndex % 2 === 0) {
        cell.font = { color: { argb: 'FF1A1E2E' }, name: 'Calibri', size: 11 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F7FB' } };
      } else {
        cell.font = { color: { argb: 'FF1A1E2E' }, name: 'Calibri', size: 11 };
      }
    }
  }
}
