// ─────────────────────────────────────────────────────────────────────────────
// CHECK-PRINTING LAYOUT
//
// A pre-printed DBP check (8" × 3", fed top-edge first) already carries the bank
// name, "PAY TO THE ORDER OF", the ₱ box, the date grid and the signature line.
// We overlay ONLY the fill-in data, positioned in INCHES from the check's
// top-left so each value lands in its blank.
//
// Different printers feed the stock a hair differently, so each bank account
// stores its own calibrated layout (set by the cashier from the Check Alignment
// screen). When an account has never been calibrated, DEFAULT_CHECK_LAYOUT — the
// measured DBP positions — is used. Both the print page and the alignment screen
// read the same layout through here, so what you calibrate is what prints.
// ─────────────────────────────────────────────────────────────────────────────

export interface CheckLayout {
  /** Date grid (top-right): 8 digits (MM DD YYYY) spread evenly between
   * `gridLeft` (left edge of the first box) and `gridRight` (right edge of the
   * last box); `top` is the vertical centre of the digits. */
  date: { top: number; gridLeft: number; gridRight: number };
  /** Payee, left-anchored on the "PAY TO THE ORDER OF" line. */
  payee: { left: number; top: number };
  /** Amount in figures, right-anchored inside the ₱ box (top-right). */
  amount: { right: number; top: number };
  /** Amount in words, left-anchored on the "PESOS" line. */
  words: { left: number; top: number };
  /** Print sizes in px (the sheet renders at real inches, 96px = 1in). */
  font: { payeeSize: number; wordsSize: number; amountSize: number; dateSize: number };
}

/** The measured DBP check positions — the starting point before any calibration. */
export const DEFAULT_CHECK_LAYOUT: CheckLayout = {
  date: { top: 0.69, gridLeft: 5.91, gridRight: 7.8 },
  payee: { left: 1.55, top: 0.9 },
  amount: { right: 7.55, top: 0.98 },
  words: { left: 1.35, top: 1.28 },
  font: { payeeSize: 17, wordsSize: 17, amountSize: 17, dateSize: 15 },
};

/** The overall check face, in inches. */
export const CHECK_WIDTH_IN = 8;
export const CHECK_HEIGHT_IN = 3;

/**
 * Coerce whatever is stored on the bank account (a loose JSON blob, possibly
 * null or partial) into a complete CheckLayout, falling back to the default for
 * anything missing. This keeps the print page and the alignment screen robust to
 * a layout saved by an older version that lacked a field.
 */
export function normalizeCheckLayout(raw: unknown): CheckLayout {
  const d = DEFAULT_CHECK_LAYOUT;
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Record<string, any>;
  const num = (v: unknown, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  return {
    date: {
      top: num(r.date?.top, d.date.top),
      gridLeft: num(r.date?.gridLeft, d.date.gridLeft),
      gridRight: num(r.date?.gridRight, d.date.gridRight),
    },
    payee: {
      left: num(r.payee?.left, d.payee.left),
      top: num(r.payee?.top, d.payee.top),
    },
    amount: {
      right: num(r.amount?.right, d.amount.right),
      top: num(r.amount?.top, d.amount.top),
    },
    words: {
      left: num(r.words?.left, d.words.left),
      top: num(r.words?.top, d.words.top),
    },
    font: {
      payeeSize: num(r.font?.payeeSize, d.font.payeeSize),
      wordsSize: num(r.font?.wordsSize, d.font.wordsSize),
      amountSize: num(r.font?.amountSize, d.font.amountSize),
      dateSize: num(r.font?.dateSize, d.font.dateSize),
    },
  };
}

/** The horizontal centre (inches) of each of the 8 date digit cells. */
export function dateCellCenters(layout: CheckLayout): number[] {
  const { gridLeft, gridRight } = layout.date;
  const cellW = (gridRight - gridLeft) / 8;
  return [0, 1, 2, 3, 4, 5, 6, 7].map((i) => gridLeft + (i + 0.5) * cellW);
}

// ── Amount in words (shared by the print page and the alignment sample) ──

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
export function checkAmountWords(n: number): string {
  const whole = Math.floor(Math.abs(n));
  const cents = Math.round((Math.abs(n) - whole) * 100);
  const base = `${convertToWords(whole)} PESOS`.toUpperCase();
  return cents > 0 ? `${base} & ${String(cents).padStart(2, '0')}/100 ONLY` : `${base} ONLY`;
}
