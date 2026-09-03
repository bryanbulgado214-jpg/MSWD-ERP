/**
 * Helpers for accounting-format money inputs. Text inputs store what the user
 * typed; on blur we format to "1,234.56" (commas + 2 decimals); on focus we
 * strip the commas so the value is easy to edit; everywhere we parse we strip
 * commas first so the grouping never corrupts the number.
 */

/** Parse a possibly-formatted money string to a number (0 when blank/invalid). */
export function parseMoney(s: string): number {
  const n = parseFloat((s ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/** Format for display on blur: "1234.5" → "1,234.50"; "" stays "". */
export function formatAccounting(s: string): string {
  const raw = (s ?? '').replace(/,/g, '').trim();
  if (raw === '') return '';
  const n = Number(raw);
  if (!Number.isFinite(n)) return s; // leave an unparseable entry for the user to fix
  return n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Strip grouping commas so a formatted value is editable again on focus. */
export function unformatMoney(s: string): string {
  return (s ?? '').replace(/,/g, '');
}
