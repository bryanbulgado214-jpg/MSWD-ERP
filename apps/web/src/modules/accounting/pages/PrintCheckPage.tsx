import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { AccountingApiError, getCheck } from '../api';
import type { CheckDetail } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// PRE-PRINTED DBP CHECK — data-only overlay.
//
// The physical DBP check (8" × 3", fed top-edge first) already has the bank
// name, "PAY TO THE ORDER OF", the ₱ box, the date grid and the signature line
// printed on it. So we print ONLY the fill-in data, positioned to land in the
// blanks. Everything is placed on an 8in × 3in page with absolute coordinates.
//
// CALIBRATION: the positions below are in INCHES from the top-left of the check.
// Print onto plain paper, hold it against a real check to a window, and nudge
// these numbers until each value sits in its blank. Only these constants and
// FONT need tuning — nothing else.
// ─────────────────────────────────────────────────────────────────────────────
const POS = {
  // Date grid (top-right): month, day, year sit in separate box clusters.
  dateMonth: { left: 5.42, top: 0.72 },
  dateDay: { left: 5.98, top: 0.72 },
  dateYear: { left: 6.52, top: 0.72 },
  dateDigitSpacing: 0.16, // gap between the digits so they fall inside the boxes
  // Payee, on the "PAY TO THE ORDER OF" line.
  payee: { left: 1.55, top: 0.98 },
  // Amount in figures, in the ₱ box (top-right). Right-edge to align near the box end.
  amountRight: 7.55,
  amountTop: 0.98,
  // Amount in words, on the "PESOS" line.
  words: { left: 1.35, top: 1.32 },
};
// Bigger + bold so the dot-matrix strikes darker and the text is easy to read.
const FONT = { family: "'Courier New', monospace", size: 14, dateSize: 15 };

const IN = (n: number) => `${n}in`;

function convertToWords(num: number): string {
  const ones = [
    '',
    'One',
    'Two',
    'Three',
    'Four',
    'Five',
    'Six',
    'Seven',
    'Eight',
    'Nine',
    'Ten',
    'Eleven',
    'Twelve',
    'Thirteen',
    'Fourteen',
    'Fifteen',
    'Sixteen',
    'Seventeen',
    'Eighteen',
    'Nineteen',
  ];
  const tens = [
    '',
    '',
    'Twenty',
    'Thirty',
    'Forty',
    'Fifty',
    'Sixty',
    'Seventy',
    'Eighty',
    'Ninety',
  ];
  if (num === 0) return 'Zero';
  if (num < 20) return ones[num]!;
  if (num < 100) return tens[Math.floor(num / 10)]! + (num % 10 ? ' ' + ones[num % 10]! : '');
  if (num < 1000)
    return (
      ones[Math.floor(num / 100)]! + ' Hundred' + (num % 100 ? ' ' + convertToWords(num % 100) : '')
    );
  if (num < 1_000_000)
    return (
      convertToWords(Math.floor(num / 1000)) +
      ' Thousand' +
      (num % 1000 ? ' ' + convertToWords(num % 1000) : '')
    );
  if (num < 1_000_000_000)
    return (
      convertToWords(Math.floor(num / 1_000_000)) +
      ' Million' +
      (num % 1_000_000 ? ' ' + convertToWords(num % 1_000_000) : '')
    );
  return (
    convertToWords(Math.floor(num / 1_000_000_000)) +
    ' Billion' +
    (num % 1_000_000_000 ? ' ' + convertToWords(num % 1_000_000_000) : '')
  );
}

/** Check-style amount in words: "ONE THOUSAND THREE HUNDRED PESOS & 50/100 ONLY". */
function checkAmountWords(n: number): string {
  const whole = Math.floor(Math.abs(n));
  const cents = Math.round((Math.abs(n) - whole) * 100);
  const base = `${convertToWords(whole)} PESOS`.toUpperCase();
  return cents > 0 ? `${base} & ${String(cents).padStart(2, '0')}/100 ONLY` : `${base} ONLY`;
}

export function PrintCheckPage() {
  const { id } = useParams<{ id: string }>();
  const [check, setCheck] = useState<CheckDetail | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    getCheck(id)
      .then(setCheck)
      .catch((e) => setError(e instanceof AccountingApiError ? e.message : 'Failed to load.'));
  }, [id]);

  if (error) return <div style={{ padding: 32, color: '#b42318' }}>{error}</div>;
  if (!check) return <div style={{ padding: 32, color: '#667085' }}>Loading...</div>;

  // Use the calendar date as stored (avoid timezone shifting the day).
  const iso = new Date(check.checkDate).toISOString().slice(0, 10);
  const [yyyy, mm, dd] = iso.split('-') as [string, string, string];
  const amountFigures = Number(check.amount).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const words = checkAmountWords(Number(check.amount));

  const fieldBase: React.CSSProperties = {
    position: 'absolute',
    fontFamily: FONT.family,
    fontSize: FONT.size,
    fontWeight: 700,
    // Pure black (not the app's dark-grey text) so the dot-matrix prints it solid.
    color: '#000',
    whiteSpace: 'nowrap',
  };
  const dateField: React.CSSProperties = {
    ...fieldBase,
    fontSize: FONT.dateSize,
    letterSpacing: IN(POS.dateDigitSpacing),
  };

  return (
    <>
      <style>{`
        .chk-screen { background: #eef0f3; min-height: 100vh; padding: 24px; display: flex;
          flex-direction: column; align-items: center; gap: 14px; }
        .chk-sheet { position: relative; width: 8in; height: 3in; background: #fff;
          color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact;
          box-shadow: 0 2px 10px rgba(16,24,40,.18); }
        .chk-guide { position: absolute; inset: 0; pointer-events: none; }
        .chk-guide .lbl { position: absolute; font: 8px system-ui, sans-serif; color: #b42318;
          letter-spacing: .04em; text-transform: uppercase; }
        .chk-guide .box { position: absolute; border: 1px dashed #f0a9a0; }
        .chk-controls { display: flex; gap: 10px; }
        .chk-controls button { padding: 8px 18px; border: 1px solid #d0d5dd; border-radius: 6px;
          background: #fff; cursor: pointer; font-size: 14px; }
        .chk-controls button.primary { background: var(--mswd-navy,#0a2a66); color: #fff; border: none; }
        .chk-note { font-size: 12px; color: #667085; max-width: 8in; text-align: center; }
        @media print {
          @page { size: 8in 3in; margin: 0; }
          html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
          body * { visibility: hidden !important; }
          .chk-sheet, .chk-sheet * { visibility: visible !important; }
          .chk-sheet { position: absolute; left: 0; top: 0; box-shadow: none; }
          .chk-screen { padding: 0; background: #fff; }
          .chk-guide, .chk-controls, .chk-note { display: none !important; }
        }
      `}</style>

      <div className="chk-screen">
        <div className="chk-sheet">
          {/* On-screen guides only — never printed. */}
          <div className="chk-guide">
            <span
              className="lbl"
              style={{ left: IN(POS.dateMonth.left), top: IN(POS.dateMonth.top - 0.22) }}
            >
              Date (MM DD YYYY)
            </span>
            <span
              className="lbl"
              style={{ left: IN(POS.payee.left), top: IN(POS.payee.top - 0.2) }}
            >
              Payee
            </span>
            <span
              className="lbl"
              style={{ left: IN(POS.amountRight - 1.1), top: IN(POS.amountTop - 0.2) }}
            >
              Amount
            </span>
            <span
              className="lbl"
              style={{ left: IN(POS.words.left), top: IN(POS.words.top - 0.2) }}
            >
              Amount in words
            </span>
          </div>

          {/* The only things that print: the fill-in data. */}
          <div style={{ ...dateField, left: IN(POS.dateMonth.left), top: IN(POS.dateMonth.top) }}>
            {mm}
          </div>
          <div style={{ ...dateField, left: IN(POS.dateDay.left), top: IN(POS.dateDay.top) }}>
            {dd}
          </div>
          <div style={{ ...dateField, left: IN(POS.dateYear.left), top: IN(POS.dateYear.top) }}>
            {yyyy}
          </div>

          <div
            style={{
              ...fieldBase,
              left: IN(POS.payee.left),
              top: IN(POS.payee.top),
              fontWeight: 700,
            }}
          >
            {check.payeeName}
          </div>
          <div
            style={{
              ...fieldBase,
              right: IN(8 - POS.amountRight),
              top: IN(POS.amountTop),
              fontWeight: 700,
            }}
          >
            {amountFigures}
          </div>
          <div style={{ ...fieldBase, left: IN(POS.words.left), top: IN(POS.words.top) }}>
            {words}
          </div>
        </div>

        <div className="chk-note">
          Load the DBP check into the printer (8&quot; × 3&quot;, top edge first). Only the data
          above prints — the bank details, boxes and labels are already on the check. Do a test
          print on plain paper first and align it to a real check before printing for real.
        </div>
        <div className="chk-controls">
          <button className="primary" onClick={() => window.print()}>
            Print
          </button>
          <button onClick={() => window.history.back()}>Back</button>
        </div>
      </div>
    </>
  );
}
