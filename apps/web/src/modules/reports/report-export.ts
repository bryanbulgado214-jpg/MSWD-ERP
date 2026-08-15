import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import * as XLSX from 'xlsx';

/**
 * Client-side report export. Reads the tables the report already rendered, so a
 * single implementation covers every table-based report:
 *   • Excel  → a real .xlsx (SheetJS)
 *   • PDF    → a real .pdf  (jsPDF + autoTable)
 * Title/period lines are lifted from the report's own header when present.
 */

export interface ExportMeta {
  filename: string; // base name, no extension
  organizationName: string;
  reportLabel: string;
  dateStr: string;
}

function collectTables(container: HTMLElement | null): HTMLTableElement[] {
  if (!container) return [];
  return Array.from(container.querySelectorAll('table')) as HTMLTableElement[];
}

/** Header lines: the formatted statement header if present, else org + report. */
function titleLines(container: HTMLElement, meta: ExportMeta): string[] {
  const doc = container.querySelector('.fs-doc');
  const head = doc?.firstElementChild as HTMLElement | undefined;
  if (head) {
    const lines = head.innerText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    if (lines.length) return lines;
  }
  return [meta.organizationName, meta.reportLabel, `As of ${meta.dateStr}`];
}

/** Columns that are mostly numeric (right-aligned in the PDF). */
function numericColumns(table: HTMLTableElement): Set<number> {
  const rows = Array.from(table.querySelectorAll('tbody tr'));
  const colCount = Math.max(0, ...rows.map((r) => r.children.length));
  const numericLike = (s: string) => {
    const t = s.replace(/[₱$,()\s%]/g, '').replace(/^-/, '');
    return t !== '' && !Number.isNaN(Number(t));
  };
  const set = new Set<number>();
  for (let c = 0; c < colCount; c++) {
    let num = 0;
    let tot = 0;
    for (const r of rows) {
      const cell = r.children[c] as HTMLElement | undefined;
      if (!cell) continue;
      const txt = cell.textContent?.trim() ?? '';
      if (txt === '' || txt === '—') continue;
      tot++;
      if (numericLike(txt)) num++;
    }
    if (tot > 0 && num / tot > 0.6) set.add(c);
  }
  return set;
}

export function exportReportExcel(container: HTMLElement | null, meta: ExportMeta): void {
  const tables = collectTables(container);
  if (tables.length === 0) {
    window.alert('This report has no tabular data to export.');
    return;
  }
  const lines = titleLines(container!, meta);
  const wb = XLSX.utils.book_new();
  tables.forEach((t, i) => {
    const ws = XLSX.utils.aoa_to_sheet([...lines.map((l) => [l]), []]);
    XLSX.utils.sheet_add_dom(ws, t, { origin: -1 });
    const name = tables.length > 1 ? `Table ${i + 1}` : 'Report';
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  });
  XLSX.writeFile(wb, `${meta.filename}.xlsx`);
}

export function exportReportPdf(container: HTMLElement | null, meta: ExportMeta): void {
  const tables = collectTables(container);
  if (tables.length === 0) {
    window.alert('This report has no tabular data to export.');
    return;
  }
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const lines = titleLines(container!, meta);

  let y = 34;
  lines.forEach((line, i) => {
    doc.setFont('helvetica', i === 0 ? 'bold' : 'normal');
    doc.setFontSize(i === 0 ? 12 : i === 1 ? 10 : 9);
    doc.text(line, pageWidth / 2, y, { align: 'center' });
    y += i === 0 ? 15 : 12;
  });

  let startY = y + 6;
  tables.forEach((t) => {
    const numeric = numericColumns(t);
    const columnStyles: Record<number, { halign: 'right' }> = {};
    numeric.forEach((c) => (columnStyles[c] = { halign: 'right' }));
    autoTable(doc, {
      html: t,
      startY,
      styles: { fontSize: 7, cellPadding: 2, overflow: 'linebreak' },
      headStyles: { fillColor: [11, 58, 103], textColor: 255, fontStyle: 'bold' },
      bodyStyles: { textColor: 30 },
      alternateRowStyles: { fillColor: [247, 249, 252] },
      columnStyles,
      margin: { left: 24, right: 24 },
    });
    const last = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
    startY = (last?.finalY ?? startY) + 18;
  });

  const stamp = `Generated ${meta.dateStr} · AquaBooks`;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7);
  doc.setTextColor(150);
  doc.text(stamp, pageWidth - 24, doc.internal.pageSize.getHeight() - 12, { align: 'right' });

  doc.save(`${meta.filename}.pdf`);
}
