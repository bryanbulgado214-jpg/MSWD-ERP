/**
 * Parse a list-search string as a money amount so registers can be searched by
 * amount as well as by text. Accepts the forms a user might type — "525",
 * "525.00", "1,234.56", "₱1,234.56" — and returns null when the string is not a
 * plain number (so a text query like "DV-525" stays a text-only search).
 */
export function parseAmountQuery(search: string): number | null {
  const cleaned = search.replace(/[₱,\s]/g, '');
  if (cleaned === '' || !/^-?\d*\.?\d+$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Turn a money search string into a Prisma Decimal filter. When the user typed
 * centavos ("1,234.56") we match that value exactly; when they typed whole pesos
 * ("1234") we match that peso regardless of centavos (1234.00–1234.99), so
 * searching "48562" still finds a ₱48,562.69 voucher. Returns null when the
 * string is not a number (so text queries stay text-only).
 */
export function amountQueryFilter(
  search: string,
): { equals: number } | { gte: number; lt: number } | null {
  const amount = parseAmountQuery(search);
  if (amount === null) return null;
  return /\./.test(search) ? { equals: amount } : { gte: amount, lt: amount + 1 };
}
