import { useRef, useState } from 'react';

import {
  getPostableAccounts,
  importOpeningBalances,
  previewOpeningBalances,
  type OpeningBalancePreview,
  type OpeningBalancePreviewRow,
} from '../api';

function peso(n: number): string {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(n);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const STATUS_LABEL: Record<OpeningBalancePreviewRow['status'], string> = {
  ok: 'OK',
  unmatched: 'Not in COA',
  header: 'Summary account',
  inactive: 'Inactive',
  duplicate: 'Duplicate',
  invalid: 'Invalid amount',
};

const overlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(16,24,40,0.55)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
  zIndex: 1000,
};
const card: React.CSSProperties = {
  background: '#fff',
  borderRadius: 12,
  width: 'min(920px, 100%)',
  maxHeight: '90vh',
  display: 'flex',
  flexDirection: 'column',
  boxShadow: '0 20px 48px rgba(16,24,40,0.28)',
};

/**
 * Upload a beginning-balances CSV (chart of accounts + Debit/Credit), validate it
 * against the COA, then post a single balanced opening-balance journal voucher.
 * Any account code that does not match the chart of accounts blocks the import.
 */
export function OpeningBalanceUploadModal({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: (message: string) => void;
}) {
  const [fileName, setFileName] = useState('');
  const [csv, setCsv] = useState('');
  const [asOfDate, setAsOfDate] = useState(todayIso());
  const [preview, setPreview] = useState<OpeningBalancePreview | null>(null);
  const [busy, setBusy] = useState<'preview' | 'import' | 'template' | null>(null);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setError('');
    setPreview(null);
    setFileName(f.name);
    const text = await f.text();
    setCsv(text);
    setBusy('preview');
    try {
      setPreview(await previewOpeningBalances(text));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read the file.');
    } finally {
      setBusy(null);
    }
  }

  async function downloadTemplate() {
    setBusy('template');
    setError('');
    try {
      const accts = await getPostableAccounts();
      const header = 'Account Code,Account Name,Debit,Credit';
      const lines = accts.map((a) => `${a.accountCode},"${a.name.replace(/"/g, '""')}",0.00,0.00`);
      const blob = new Blob([[header, ...lines].join('\r\n')], {
        type: 'text/csv;charset=utf-8;',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'beginning-balances-template.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('Could not build the template.');
    } finally {
      setBusy(null);
    }
  }

  async function doImport() {
    if (!preview?.canImport || !asOfDate) return;
    setBusy('import');
    setError('');
    try {
      const r = await importOpeningBalances(csv, asOfDate);
      onImported(`Posted ${r.jevNumber} — ${r.lineCount} account(s), total ${peso(r.totalDebit)}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed.');
    } finally {
      setBusy(null);
    }
  }

  const okRows = preview?.rows.filter((r) => r.status === 'ok').length ?? 0;
  const problemRows = preview?.rows.filter((r) => r.status !== 'ok') ?? [];

  return (
    <div style={overlay} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div style={card}>
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #eaecf0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <h2 style={{ margin: 0, fontSize: 18 }}>Upload beginning balances</h2>
          <button className="acct-btn acct-btn--sm" onClick={onClose} type="button">
            ✕
          </button>
        </div>

        <div style={{ padding: '16px 20px', overflowY: 'auto' }}>
          <p style={{ color: '#475467', fontSize: 13, marginTop: 0 }}>
            The CSV must contain your chart of accounts with a beginning balance in the{' '}
            <strong>Debit</strong> or <strong>Credit</strong> column. Columns:{' '}
            <code>Account Code, Account Name, Debit, Credit</code>. Every account code must match
            the chart of accounts, and total debits must equal total credits.
          </p>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label
              style={{
                display: 'flex',
                flexDirection: 'column',
                fontSize: 12,
                fontWeight: 600,
                color: '#344054',
              }}
            >
              As-of date
              <input
                type="date"
                value={asOfDate}
                onChange={(e) => setAsOfDate(e.target.value)}
                style={{
                  marginTop: 4,
                  padding: '6px 8px',
                  border: '1px solid #d0d5dd',
                  borderRadius: 6,
                }}
              />
            </label>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              onChange={onFile}
              style={{ display: 'none' }}
            />
            <button
              type="button"
              className="acct-btn acct-btn--sm"
              onClick={() => fileRef.current?.click()}
              disabled={busy !== null}
            >
              {busy === 'preview' ? 'Reading…' : '📄 Choose CSV file'}
            </button>
            <button
              type="button"
              className="acct-btn acct-btn--sm"
              onClick={downloadTemplate}
              disabled={busy !== null}
            >
              {busy === 'template' ? 'Building…' : '⭳ Download template'}
            </button>
            {fileName && <span style={{ fontSize: 13, color: '#475467' }}>{fileName}</span>}
          </div>

          {error && (
            <div className="acct-error" style={{ marginTop: 14 }}>
              {error}
            </div>
          )}

          {preview && (
            <div style={{ marginTop: 16 }}>
              {preview.existingOpeningJev && (
                <div
                  style={{
                    background: '#fffaeb',
                    border: '1px solid #fec84b',
                    color: '#93370d',
                    borderRadius: 8,
                    padding: '8px 12px',
                    fontSize: 13,
                    marginBottom: 12,
                  }}
                >
                  A beginning-balance voucher already exists ({preview.existingOpeningJev.jevNumber}
                  ). Importing will post an additional entry — reverse the old one first if this is
                  a correction.
                </div>
              )}

              {preview.errors.length > 0 && (
                <div className="acct-error" style={{ marginBottom: 12 }}>
                  <strong>Cannot import yet:</strong>
                  <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                    {preview.errors.map((msg, i) => (
                      <li key={i}>{msg}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div
                style={{
                  display: 'flex',
                  gap: 20,
                  fontSize: 13,
                  marginBottom: 10,
                  flexWrap: 'wrap',
                }}
              >
                <span>
                  Accounts with a balance: <strong>{okRows}</strong>
                </span>
                <span>
                  Total debit: <strong>{peso(preview.totalDebit)}</strong>
                </span>
                <span>
                  Total credit: <strong>{peso(preview.totalCredit)}</strong>
                </span>
                <span style={{ color: preview.balanced ? '#067647' : '#b42318', fontWeight: 700 }}>
                  {preview.balanced
                    ? 'Balanced ✓'
                    : `Off by ${peso(Math.abs(preview.totalDebit - preview.totalCredit))}`}
                </span>
              </div>

              {problemRows.length > 0 && (
                <div
                  style={{
                    maxHeight: '34vh',
                    overflowY: 'auto',
                    border: '1px solid #eaecf0',
                    borderRadius: 8,
                  }}
                >
                  <table className="acct-table" style={{ margin: 0 }}>
                    <thead>
                      <tr>
                        <th>Line</th>
                        <th>Account Code</th>
                        <th>Name (in file)</th>
                        <th className="acct-text-right">Debit</th>
                        <th className="acct-text-right">Credit</th>
                        <th>Problem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {problemRows.map((r) => (
                        <tr key={r.line} style={{ background: '#fef3f2' }}>
                          <td>{r.line}</td>
                          <td className="acct-text-mono">{r.accountCode}</td>
                          <td>{r.csvName || r.matchedName || '—'}</td>
                          <td className="acct-text-right acct-text-mono">
                            {r.debit ? peso(r.debit) : '—'}
                          </td>
                          <td className="acct-text-right acct-text-mono">
                            {r.credit ? peso(r.credit) : '—'}
                          </td>
                          <td style={{ color: '#b42318', fontSize: 12 }}>
                            {STATUS_LABEL[r.status]}
                            {r.message ? ` — ${r.message}` : ''}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {problemRows.length === 0 && preview.canImport && (
                <div style={{ color: '#067647', fontSize: 13 }}>
                  All {okRows} account(s) matched the chart of accounts and the entry balances.
                </div>
              )}
            </div>
          )}
        </div>

        <div
          style={{
            padding: '14px 20px',
            borderTop: '1px solid #eaecf0',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 10,
          }}
        >
          <button
            className="acct-btn acct-btn--sm"
            onClick={onClose}
            type="button"
            disabled={busy === 'import'}
          >
            Cancel
          </button>
          <button
            className="acct-btn acct-btn--sm acct-btn--primary"
            onClick={doImport}
            type="button"
            disabled={!preview?.canImport || !asOfDate || busy !== null}
          >
            {busy === 'import' ? 'Posting…' : 'Post beginning balances'}
          </button>
        </div>
      </div>
    </div>
  );
}
