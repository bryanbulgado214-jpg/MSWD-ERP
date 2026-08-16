import { jsPDF } from 'jspdf';

import type { MatchView } from './api';

/**
 * Monthly bank reconciliation statement, in the classic adjusted-balance
 * format used by Sage Intacct / QuickBooks:
 *
 *   Balance per bank statement
 *     + Deposits in transit           (book debits not yet on the bank)
 *     − Outstanding checks            (book credits not yet on the bank)
 *   = Adjusted bank balance
 *
 *   Balance per books (GL cash)
 *     + Credit memos not yet booked   (bank credits not yet recorded)
 *     − Bank charges / debit memos    (bank debits not yet recorded)
 *   = Adjusted book balance
 *
 *   Difference  → must be 0.00 for the reconciliation to tie out.
 *
 * The reconciling items are exactly the still-unmatched lines on each side.
 */

const money = (n: number) =>
  new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    Math.abs(n),
  );
// Negative amounts render in accounting parentheses.
const signed = (n: number) => (n < 0 ? `(${money(n)})` : money(n));

export function downloadBankReconPdf(view: MatchView): void {
  const { recon, bank, book, summary } = view;

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const left = 48;
  const right = W - 48;
  let y = 58;

  const ensure = (space: number) => {
    if (y + space > H - 52) {
      doc.addPage();
      y = 58;
    }
  };
  const centered = (text: string, size: number, bold: boolean) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.text(text, W / 2, y, { align: 'center' });
    y += size + 5;
  };
  const rule = (color = 200) => {
    doc.setDrawColor(color);
    doc.line(left, y, right, y);
    y += 12;
  };
  const row = (
    label: string,
    amount?: string,
    opts: { bold?: boolean; size?: number; indent?: number; color?: number } = {},
  ) => {
    const size = opts.size ?? 9.5;
    ensure(size + 6);
    doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.setTextColor(opts.color ?? 25);
    doc.text(label, left + (opts.indent ?? 0), y);
    if (amount !== undefined) doc.text(amount, right, y, { align: 'right' });
    doc.setTextColor(25);
    y += size + 6;
  };

  // ── Header ──
  centered(recon.organizationName, 13, true);
  centered('Bank Reconciliation Statement', 11, true);
  centered(recon.bankAccount.label, 9.5, false);
  const dateStr = new Date(recon.reconciliationDate).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  centered(`${recon.periodName} — as of ${dateStr}`, 9.5, false);
  y += 2;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text('All amounts in Philippine Peso (PHP)', W / 2, y, { align: 'center' });
  doc.setTextColor(25);
  y += 18;

  // Reconciling items = the unmatched lines on each side.
  const dit = book.filter((b) => !b.matched && b.amount > 0); // deposits in transit
  const outstanding = book.filter((b) => !b.matched && b.amount < 0); // outstanding checks
  const creditMemos = bank.filter((b) => !b.matched && b.amount > 0); // unrecorded credits
  const debitMemos = bank.filter((b) => !b.matched && b.amount < 0); // charges / debit memos

  const sum = (arr: { amount: number }[]) => arr.reduce((s, x) => s + x.amount, 0);
  const bankItems = (arr: MatchView['bank']) =>
    arr.forEach((it) => {
      const d = new Date(it.transactionDate).toLocaleDateString('en-PH');
      const desc = `${it.description}${it.referenceNumber ? ` (${it.referenceNumber})` : ''}`;
      row(`${d}  ${desc}`.slice(0, 74), signed(it.amount), { size: 8.5, indent: 22, color: 90 });
    });
  const bookItems = (arr: MatchView['book']) =>
    arr.forEach((it) => {
      const d = new Date(it.jevDate).toLocaleDateString('en-PH');
      row(`${d}  ${it.jevNumber} · ${it.description}`.slice(0, 74), signed(it.amount), {
        size: 8.5,
        indent: 22,
        color: 90,
      });
    });
  const none = () => row('— none —', undefined, { size: 8.5, indent: 22, color: 150 });

  // ── Bank side ──
  row('BALANCE PER BANK STATEMENT', money(recon.bankBalance), { bold: true });
  row('Add: Deposits in transit', undefined, { indent: 8 });
  if (dit.length) bookItems(dit);
  else none();
  row('Total deposits in transit', signed(sum(dit)), { indent: 8, size: 9 });
  row('Less: Outstanding checks', undefined, { indent: 8 });
  if (outstanding.length) bookItems(outstanding);
  else none();
  row('Total outstanding checks', signed(sum(outstanding)), { indent: 8, size: 9 });
  y += 2;
  rule();
  row('ADJUSTED BANK BALANCE', money(summary.adjustedBank), { bold: true });
  y += 12;

  // ── Book side ──
  row('BALANCE PER BOOKS (GL cash)', money(recon.bookBalance), { bold: true });
  row('Add: Credit memos not yet booked', undefined, { indent: 8 });
  if (creditMemos.length) bankItems(creditMemos);
  else none();
  row('Total credit memos', signed(sum(creditMemos)), { indent: 8, size: 9 });
  row('Less: Bank charges / debit memos not yet booked', undefined, { indent: 8 });
  if (debitMemos.length) bankItems(debitMemos);
  else none();
  row('Total bank charges / debit memos', signed(sum(debitMemos)), { indent: 8, size: 9 });
  y += 2;
  rule();
  row('ADJUSTED BOOK BALANCE', money(summary.adjustedBook), { bold: true });
  y += 12;

  // ── Difference ──
  rule(120);
  const reconciled = Math.abs(summary.difference) < 0.005;
  row('DIFFERENCE', signed(summary.difference), { bold: true, color: reconciled ? 6 : 180 });
  row(
    reconciled
      ? 'RECONCILED — adjusted balances agree.'
      : `OUT OF BALANCE by ${money(summary.difference)} — not yet reconciled.`,
    undefined,
    { size: 9, color: reconciled ? 6 : 180 },
  );

  // ── Footer ──
  y += 14;
  ensure(30);
  const clearedBank = bank.filter((b) => b.matched).length;
  const clearedBook = book.filter((b) => b.matched).length;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(110);
  doc.text(
    `Cleared this period: ${clearedBank} bank line(s) matched to ${clearedBook} book entr${
      clearedBook === 1 ? 'y' : 'ies'
    }.`,
    left,
    y,
  );
  doc.text(`Status: ${recon.status.replace(/_/g, ' ')}`, right, y, { align: 'right' });

  doc.setFont('helvetica', 'italic');
  doc.setTextColor(150);
  doc.text('Generated by AquaBooks', right, H - 24, { align: 'right' });

  const safePeriod = recon.periodName.replace(/[^\w]+/g, '-');
  doc.save(`Bank-Reconciliation-${safePeriod}.pdf`);
}
