/**
 * Build a Prisma date filter (`{ gte, lte }`) from the `dateFrom` / `dateTo`
 * query strings used by the JEV and DV registers. Each is an inclusive
 * calendar day in the form `YYYY-MM-DD`: `dateFrom` opens the range at the
 * start of that day and `dateTo` closes it at the end of that day, both in UTC
 * to match how document dates are stored. Malformed or empty values are
 * ignored; returns null when neither bound is usable.
 */
export function dateRangeFilter(
  dateFrom?: string,
  dateTo?: string,
): { gte?: Date; lte?: Date } | null {
  const isDay = (s?: string): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const range: { gte?: Date; lte?: Date } = {};
  if (isDay(dateFrom)) {
    const d = new Date(`${dateFrom}T00:00:00.000Z`);
    if (!Number.isNaN(d.getTime())) range.gte = d;
  }
  if (isDay(dateTo)) {
    const d = new Date(`${dateTo}T23:59:59.999Z`);
    if (!Number.isNaN(d.getTime())) range.lte = d;
  }
  return range.gte || range.lte ? range : null;
}
