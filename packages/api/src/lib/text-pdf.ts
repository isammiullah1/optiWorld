const PORTRAIT = {
  width: 612,
  height: 792,
  startY: 760,
  fontSize: 11,
  leading: 14,
  lineLimit: 110,
  pageSize: 42,
} as const;
const LANDSCAPE = {
  width: 792,
  height: 612,
  startY: 560,
  fontSize: 9,
  leading: 12,
  lineLimit: 150,
  pageSize: 36,
} as const;

export function pdfCells(values: readonly string[]): string {
  return values.join(' | ');
}

export function pdfWhen(value: string | null): string {
  if (!value) {
    return '';
  }
  return value
    .replace('T', ' ')
    .replace(/\.\d{3}Z$/, '')
    .slice(0, 16);
}

export function renderTextPdf(lines: readonly string[], landscape = false): Buffer {
  const layout = landscape ? LANDSCAPE : PORTRAIT;
  const pages: string[][] = [];
  for (let index = 0; index < lines.length; index += layout.pageSize) {
    pages.push(
      lines.slice(index, index + layout.pageSize).map((line) => line.slice(0, layout.lineLimit)),
    );
  }
  if (pages.length === 0) {
    pages.push(['OptiWorld']);
  }
  const streams = pages.map((page) => {
    const commands = [
      'BT',
      `/F1 ${layout.fontSize} Tf`,
      `40 ${layout.startY} Td`,
      `${layout.leading} TL`,
    ];
    page.forEach((line, index) => {
      const text = `(${pdfEscape(line)}) Tj`;
      commands.push(index === 0 ? text : `T* ${text}`);
    });
    commands.push('ET');
    return commands.join('\n');
  });
  return buildPdf(streams, layout.width, layout.height);
}

export type PdfTable = {
  heading?: string;
  columns: readonly string[];
  rows: readonly (readonly string[])[];
  widths?: readonly number[];
  empty?: string;
};

export function renderTablePdf(input: {
  title: string;
  landscape?: boolean;
  tables: readonly PdfTable[];
}): Buffer {
  const width = input.landscape ? 792 : 612;
  const height = input.landscape ? 612 : 792;
  const margin = 36;
  const fontSize = 9;
  const leading = 12;
  const usable = width - margin * 2;
  const pages: string[][] = [[]];
  let y = height - margin;

  const place = (block: number): boolean => {
    const page = pages[pages.length - 1];
    if (!page) {
      return false;
    }
    if (y - block < margin) {
      pages.push([]);
      y = height - margin;
      return false;
    }
    return true;
  };

  const drawTitle = (continued: boolean): void => {
    const page = pages[pages.length - 1];
    if (!page) {
      return;
    }
    const label = continued ? `${input.title} (continued)` : input.title;
    page.push(
      `BT /F1 14 Tf 0.102 0.118 0.180 rg 1 0 0 1 ${margin} ${y - 14} Tm (${pdfEscape(label)}) Tj ET`,
    );
    y -= 26;
  };

  drawTitle(false);

  for (const table of input.tables) {
    if (table.columns.length === 0) {
      continue;
    }
    const widths = columnWidths(table.widths, table.columns.length, usable);
    const headerLines = table.columns.map((column, index) =>
      wrapCell(column, widths[index] ?? usable, fontSize),
    );
    const headerHeight = rowHeight(headerLines, leading);
    if (!place(headerHeight + 36)) {
      drawTitle(true);
    }
    const pageForHeading = pages[pages.length - 1];
    if (table.heading && pageForHeading) {
      pageForHeading.push(
        `BT /F1 11 Tf 0.016 0.404 0.584 rg 1 0 0 1 ${margin} ${y - 11} Tm (${pdfEscape(table.heading)}) Tj ET`,
      );
      y -= 18;
    }
    const paintHeader = (): void => {
      const page = pages[pages.length - 1];
      if (!page) {
        return;
      }
      paintRow(page, margin, y - headerHeight, widths, headerLines, headerHeight, fontSize, true);
      y -= headerHeight;
    };
    paintHeader();
    if (table.rows.length === 0) {
      const message = [wrapCell(table.empty ?? 'No rows.', usable, fontSize)];
      const heightOfRow = rowHeight(message, leading);
      if (!place(heightOfRow)) {
        drawTitle(true);
        paintHeader();
      }
      const emptyPage = pages[pages.length - 1];
      if (emptyPage) {
        paintRow(
          emptyPage,
          margin,
          y - heightOfRow,
          [usable],
          message,
          heightOfRow,
          fontSize,
          false,
        );
        y -= heightOfRow;
      }
      y -= 16;
      continue;
    }
    table.rows.forEach((row, rowIndex) => {
      const lines = table.columns.map((_, index) =>
        wrapCell(row[index] ?? '', widths[index] ?? usable, fontSize),
      );
      const heightOfRow = rowHeight(lines, leading);
      if (!place(heightOfRow)) {
        drawTitle(true);
        paintHeader();
      }
      const page = pages[pages.length - 1];
      if (!page) {
        return;
      }
      paintRow(
        page,
        margin,
        y - heightOfRow,
        widths,
        lines,
        heightOfRow,
        fontSize,
        false,
        rowIndex % 2 === 1,
      );
      y -= heightOfRow;
    });
    y -= 16;
  }

  return buildPdf(
    pages.map((page) => page.join('\n')),
    width,
    height,
  );
}

export function spreadsheetType(filename: string): string {
  return filename.endsWith('.pdf')
    ? 'application/pdf'
    : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
}

function buildPdf(streams: readonly string[], width: number, height: number): Buffer {
  const pages = streams.length > 0 ? streams : ['BT /F1 11 Tf 40 760 Td (OptiWorld) Tj ET'];
  const objects: string[] = [];
  const pageIds: number[] = [];
  const fontId = 3 + pages.length * 2;
  let nextId = 3;
  for (const stream of pages) {
    const contentId = nextId;
    nextId += 1;
    const pageId = nextId;
    nextId += 1;
    objects.push(
      `${contentId} 0 obj\n<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream\nendobj\n`,
    );
    objects.push(
      `${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>\nendobj\n`,
    );
    pageIds.push(pageId);
  }
  const catalog = `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`;
  const pageTree = `2 0 obj\n<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] >>\nendobj\n`;
  const font = `${fontId} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`;
  const header = '%PDF-1.4\n';
  const chunks = [catalog, pageTree, ...objects, font];
  const positions = [0];
  let cursor = Buffer.byteLength(header);
  for (const chunk of chunks) {
    positions.push(cursor);
    cursor += Buffer.byteLength(chunk);
  }
  const xrefLines = ['xref', `0 ${positions.length}`, '0000000000 65535 f '];
  for (const position of positions.slice(1)) {
    xrefLines.push(`${String(position).padStart(10, '0')} 00000 n `);
  }
  const trailer = `trailer\n<< /Size ${positions.length} /Root 1 0 R >>\nstartxref\n${cursor}\n%%EOF`;
  return Buffer.from(`${header}${chunks.join('')}${xrefLines.join('\n')}\n${trailer}`);
}

function columnWidths(
  weights: readonly number[] | undefined,
  count: number,
  total: number,
): number[] {
  const raw =
    weights && weights.length === count ? [...weights] : Array.from({ length: count }, () => 1);
  const sum = raw.reduce((totalWeight, weight) => totalWeight + weight, 0) || 1;
  return raw.map((weight) => (total * weight) / sum);
}

function wrapCell(value: string, width: number, fontSize: number): string[] {
  const maxChars = Math.max(4, Math.floor((width - 8) / (fontSize * 0.5)));
  const text = value
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length === 0) {
    return [''];
  }
  const lines: string[] = [];
  let current = '';
  for (const word of text.split(' ')) {
    const piece = word.length > maxChars ? `${word.slice(0, Math.max(1, maxChars - 3))}...` : word;
    const next = current.length === 0 ? piece : `${current} ${piece}`;
    if (next.length <= maxChars) {
      current = next;
      continue;
    }
    if (current.length > 0) {
      lines.push(current);
    }
    current = piece;
    if (lines.length === 2) {
      break;
    }
  }
  if (lines.length < 3 && current.length > 0) {
    lines.push(
      current.length > maxChars ? `${current.slice(0, Math.max(1, maxChars - 3))}...` : current,
    );
  }
  return lines.slice(0, 3);
}

function rowHeight(lines: readonly string[][], leading: number): number {
  const count = lines.reduce((tallest, cell) => Math.max(tallest, cell.length), 1);
  return 8 + count * leading;
}

function paintRow(
  page: string[],
  x: number,
  y: number,
  widths: readonly number[],
  lines: readonly string[][],
  height: number,
  fontSize: number,
  header: boolean,
  zebra = false,
): void {
  let cursor = x;
  lines.forEach((cell, index) => {
    const width = widths[index] ?? 0;
    const fill = header ? '0 0.192 0.325' : zebra ? '0.961 0.969 0.984' : '1 1 1';
    const color = header ? '1 1 1' : '0.102 0.118 0.180';
    page.push(`${fill} rg ${cursor} ${y} ${width} ${height} re f`);
    page.push(`0.541 0.573 0.643 RG 0.8 w ${cursor} ${y} ${width} ${height} re S`);
    page.push('BT', `/F1 ${fontSize} Tf`, `${color} rg`);
    cell.forEach((line, lineIndex) => {
      const baseline = y + height - 4 - fontSize - lineIndex * (fontSize + 3);
      page.push(`1 0 0 1 ${cursor + 4} ${baseline.toFixed(2)} Tm (${pdfEscape(line)}) Tj`);
    });
    page.push('ET');
    cursor += width;
  });
}

function pdfEscape(value: string): string {
  return value
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}
