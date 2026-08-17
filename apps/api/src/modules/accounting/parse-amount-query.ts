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
