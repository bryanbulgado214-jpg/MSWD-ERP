/**
 * Formats a fixed-precision decimal STRING (e.g. "800000.00", as the API
 * always sends money) into a PHP-formatted display string, WITHOUT ever
 * parsing it into a JS `number` first. `parseFloat`/`Number()` can lose
 * precision on large amounts — string-level manipulation cannot, since
 * every amount is already guaranteed exactly 2 decimal places by the
 * backend's numeric(18,2) columns.
 */
export function formatPeso(amountString: string | number): string {
  if (typeof amountString !== 'string') amountString = String(amountString);
  const isNegative = amountString.startsWith('-');
  const unsigned = isNegative ? amountString.slice(1) : amountString;
  const parts = unsigned.split('.');
  const wholePart = parts[0] ?? '0';
  const decimalPart = parts[1] ?? '00';

  const withThousandsSeparators = wholePart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  return `${isNegative ? '-' : ''}₱${withThousandsSeparators}.${decimalPart.padEnd(2, '0').slice(0, 2)}`;
}
