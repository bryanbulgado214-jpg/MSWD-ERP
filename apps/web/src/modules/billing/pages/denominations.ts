// Philippine peso denominations for a teller cash-count sheet (bills + coins).
export const PESO_DENOMINATIONS = [1000, 500, 200, 100, 50, 20, 10, 5, 1, 0.25];

export type CashCount = Record<string, number>;

export function denomLabel(d: number): string {
  return d < 1 ? `${Math.round(d * 100)}¢` : `₱${d.toLocaleString('en-PH')}`;
}

/** Total value of a denomination → quantity map, summed in centavos for safety. */
export function cashCountTotal(count: CashCount | null | undefined): number {
  if (!count) return 0;
  const cents = PESO_DENOMINATIONS.reduce(
    (s, d) => s + Math.round(d * 100) * (Number(count[String(d)]) || 0),
    0,
  );
  return cents / 100;
}

/** Whether a cash-count map has any non-zero quantity. */
export function hasCashCount(count: CashCount | null | undefined): boolean {
  if (!count) return false;
  return PESO_DENOMINATIONS.some((d) => (Number(count[String(d)]) || 0) > 0);
}
