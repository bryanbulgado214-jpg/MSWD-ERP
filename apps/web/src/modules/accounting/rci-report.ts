import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';

import type { RciReport } from './api';

/**
 * COA Report of Checks Issued (Appendix 35). Two downloadable outputs — CSV and
 * PDF — both following the prescribed column layout and certification block.
 */

const money = (n: number) =>
  new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const shortDate = (d: string) => (d ? new Date(d).toLocaleDateString('en-PH') : '');

const COLUMNS = [
  'Check Date',
  'Check Serial No.',
  'DV/Payroll No.',
  'ORS/BURS No.',
  'Responsibility Center Code',
  'Payee',
  'UACS Object Code',
  'Nature of Payment',
  'Amount',
];

const CERTIFICATION =
  'I hereby certify on my official oath that this Report of Checks Issued is a full and true ' +
  'statement of all checks issued by me during the period stated above, and that these checks ' +
  'were actually issued by me in payment for obligations as indicated in the corresponding columns.';

function rowCells(report: RciReport) {
  return report.rows.map((r) => [
    shortDate(r.checkDate),
    r.checkSerialNo,
    r.dvNumber,
    r.orsNumber,
    r.rcCode,
    r.payee,
    r.uacsObjectCode,
    r.natureOfPayment,
    money(r.amount),
  ]);
}

// ── CSV ──
function csvEsc(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}
export function downloadRciCsv(report: RciReport): void {
  const lines: string[][] = [
    ['REPORT OF CHECKS ISSUED', '', '', '', '', '', '', '', 'Appendix 35'],
    [`Period Covered:`, report.periodCovered],
    [`Entity Name:`, report.entityName],
    [`Fund Cluster:`, report.fundCluster, '', '', '', '', '', 'Report No.:', ''],
    [`Bank Name/Account No.:`, report.bankLabel, '', '', '', '', '', 'Sheet No.:', ''],
    [],
    COLUMNS,
    ...rowCells(report),
    ['', '', '', '', '', '', '', 'TOTAL', money(report.total)],
    [],
    ['CERTIFICATION'],
    [CERTIFICATION],
    [],
    ['', '', '', 'Name and Signature of Disbursing Officer/Cashier'],
    ['', '', '', 'Official Designation', '', '', 'Date'],
  ];
  const csv = lines.map((row) => row.map((c) => csvEsc(c ?? '')).join(',')).join('\r\n') + '\r\n';
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, `RCI-${report.month}.csv`);
}

// ── PDF ──
export function downloadRciPdf(report: RciReport): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const left = 32;
  const right = W - 32;

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(9);
  doc.text('Appendix 35', right, 30, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('REPORT OF CHECKS ISSUED', W / 2, 40, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  let y = 60;
  doc.text(`Period Covered: ${report.periodCovered}`, left, y);
  doc.text('Report No.: ____________', right, y, { align: 'right' });
  y += 14;
  doc.text(`Entity Name: ${report.entityName || '____________________'}`, left, y);
  doc.text('Sheet No.: ____________', right, y, { align: 'right' });
  y += 14;
  doc.text(`Fund Cluster: ${report.fundCluster || '____________________'}`, left, y);
  y += 14;
  doc.text(`Bank Name/Account No.: ${report.bankLabel}`, left, y);
  y += 8;

  autoTable(doc, {
    head: [COLUMNS],
    body: rowCells(report),
    foot: [['', '', '', '', '', '', '', 'TOTAL', money(report.total)]],
    startY: y + 6,
    styles: {
      fontSize: 7.5,
      cellPadding: 3,
      overflow: 'linebreak',
      lineColor: [120, 120, 120],
      lineWidth: 0.4,
    },
    headStyles: { fillColor: [11, 58, 103], textColor: 255, fontStyle: 'bold', halign: 'center' },
    footStyles: { fillColor: [240, 243, 247], textColor: 20, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 60 },
      1: { cellWidth: 66 },
      2: { cellWidth: 70 },
      3: { cellWidth: 66 },
      4: { halign: 'center', cellWidth: 62 },
      6: { cellWidth: 72 },
      8: { halign: 'right', cellWidth: 78 },
    },
    margin: { left, right: 32 },
  });

  const endY =
    (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 40;
  let cy = endY + 24;
  if (cy > doc.internal.pageSize.getHeight() - 90) {
    doc.addPage();
    cy = 48;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('C E R T I F I C A T I O N', left, cy);
  cy += 14;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const wrapped = doc.splitTextToSize(CERTIFICATION, right - left);
  doc.text(wrapped, left, cy);
  cy += wrapped.length * 12 + 34;

  doc.line(left, cy, left + 280, cy);
  cy += 12;
  doc.setFontSize(8.5);
  doc.text('Name and Signature of Disbursing Officer/Cashier', left, cy);
  cy += 26;
  doc.line(left, cy, left + 200, cy);
  doc.line(left + 240, cy, left + 380, cy);
  cy += 12;
  doc.text('Official Designation', left, cy);
  doc.text('Date', left + 240, cy);

  doc.save(`RCI-${report.month}.pdf`);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
