// Flexible bank-statement CSV parser for the reconciliation import. It sniffs
// the Date / Description / Amount (or Debit/Credit) / Reference columns from the
// header row, so it works with whatever layout a bank exports — no fixed format.

export interface ParsedTxn {
  date: string; // YYYY-MM-DD
  description: string;
  amount: number; // signed: + deposit/credit, − withdrawal/debit
  reference?: string;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function toIsoDate(raw: string): string | null {
  const s = (raw ?? '').trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // M/D/Y or D/M/Y (assume US M/D/Y — the common PH bank export) with - or /
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (m) {
    let [, a, b, y] = m;
    if (y.length === 2) y = `20${y}`;
    return `${y}-${a.padStart(2, '0')}-${b.padStart(2, '0')}`;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function num(raw: string): number {
  const n = parseFloat((raw ?? '').replace(/[^0-9.-]/g, ''));
  return isNaN(n) ? 0 : n;
}

export function parseBankCsv(text: string): { rows: ParsedTxn[]; error?: string } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return { rows: [], error: 'The CSV needs a header row and at least one transaction.' };
  }
  const header = splitCsvLine(lines[0]!).map((h) => h.toLowerCase());
  const find = (...pats: RegExp[]) => header.findIndex((h) => pats.some((p) => p.test(h)));

  const iDate = find(/date/);
  const iDesc = find(/desc|particular|detail|narration|memo|payee/);
  const iAmount = header.findIndex((h) => /amount|value/.test(h));
  const iDebit = find(/debit|withdrawal|dr\b/);
  const iCredit = find(/credit|deposit|cr\b/);
  const iRef = find(/ref|cheque|check|number|no\.?$/);

  if (iDate < 0) return { rows: [], error: 'Could not find a Date column in the CSV.' };
  if (iAmount < 0 && iDebit < 0 && iCredit < 0) {
    return { rows: [], error: 'Could not find an Amount (or Debit/Credit) column.' };
  }

  const rows: ParsedTxn[] = [];
  for (const line of lines.slice(1)) {
    const cols = splitCsvLine(line);
    const date = toIsoDate(cols[iDate] ?? '');
    if (!date) continue;
    let amount: number;
    if (iAmount >= 0) amount = num(cols[iAmount] ?? '');
    else amount = (iCredit >= 0 ? num(cols[iCredit]!) : 0) - (iDebit >= 0 ? num(cols[iDebit]!) : 0);
    if (!amount) continue;
    rows.push({
      date,
      description: (iDesc >= 0 ? cols[iDesc] : '')?.trim() || 'Bank transaction',
      amount,
      ...(iRef >= 0 && cols[iRef] ? { reference: cols[iRef] } : {}),
    });
  }
  return { rows };
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
