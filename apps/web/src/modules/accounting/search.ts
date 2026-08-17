/**
 * Shared list-search helpers.
 *
 * Every register/list search box should match on amount as well as text, so a
 * user can find a row by typing "525", "525.00" or "1,234.56". The pattern is:
 * build a single lower-cased "haystack" string per row from its text fields plus
 * `amountSearchTokens(...)`, then test it with `matchesQuery(hay, q)`.
 */

/**
 * Renders each amount in the several forms a user might type, so a plain
 * substring match finds them all:
 *   525    -> "525 525.00 525.00"
 *   1234.5 -> "1234.5 1234.56 1,234.56"
 * Covers queries like "525", "525.00", "1234", "1234.56", "1,234" and "1,234.56".
 */
export function amountSearchTokens(...amounts: Array<number | string | null | undefined>): string {
  const parts: string[] = [];
  for (const raw of amounts) {
    const n = typeof raw === 'string' ? Number(raw) : raw;
    if (n == null || Number.isNaN(n)) continue;
    parts.push(String(n));
    parts.push(n.toFixed(2));
    parts.push(n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  }
  return parts.join(' ');
}

/** True when the (trimmed) query is empty or is a substring of the haystack. */
export function matchesQuery(hay: string, q: string): boolean {
  const needle = q.trim().toLowerCase();
  return !needle || hay.toLowerCase().includes(needle);
}
