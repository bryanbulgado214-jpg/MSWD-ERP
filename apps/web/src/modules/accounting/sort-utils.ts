/**
 * Natural comparison for manually-typed document numbers (JEV/DV). Numbers are
 * read as numbers, not text, so "JEV-2026-9" sorts before "JEV-2026-10" and
 * "DV-2026-01-002" before "DV-2026-01-010" regardless of zero-padding. Splits
 * each string into digit / non-digit runs and compares run-by-run.
 */
export function compareDocNumber(a: string, b: string): number {
  const re = /(\d+|\D+)/g;
  const ax = (a ?? '').match(re) ?? [];
  const bx = (b ?? '').match(re) ?? [];
  const n = Math.min(ax.length, bx.length);
  for (let i = 0; i < n; i++) {
    const as = ax[i]!;
    const bs = bx[i]!;
    const aNum = /^\d/.test(as);
    const bNum = /^\d/.test(bs);
    if (aNum && bNum) {
      const d = Number(as) - Number(bs);
      if (d !== 0) return d;
    } else {
      const c = as.localeCompare(bs);
      if (c !== 0) return c;
    }
  }
  return ax.length - bx.length;
}

export type SortDir = 'asc' | 'desc';

/** The arrow shown on a sortable column header. */
export function sortArrow(active: boolean, dir: SortDir): string {
  if (!active) return '↕';
  return dir === 'asc' ? '↑' : '↓';
}
