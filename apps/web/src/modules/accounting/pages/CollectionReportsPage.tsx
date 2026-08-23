import { useCallback, useEffect, useState } from 'react';

import { AccountingApiError, getCollectionReport } from '../api';
import type { CollectionReport, ReportColumn } from '../types';

import { AccountingSubNav } from './AccountingSubNav';
import './accounting.css';

const REPORTS: Array<{ kind: string; label: string }> = [
  { kind: 'daily-summary', label: 'Daily Collection Summary' },
  { kind: 'register', label: 'Collection Register' },
  { kind: 'deposits', label: 'Deposit Register' },
  { kind: 'posting', label: 'Posting Register' },
  { kind: 'undeposited', label: 'Undeposited Collections' },
  { kind: 'by-method', label: 'By Payment Method' },
  { kind: 'by-type', label: 'By Type' },
  { kind: 'cashier-accountability', label: 'Cashier Accountability' },
  { kind: 'exceptions', label: 'Voided & Reversed' },
];

function fmtMoney(v: unknown) {
  const n = typeof v === 'string' ? parseFloat(v) : (v as number);
  return (n || 0).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
}
function fmtCell(v: unknown, col: ReportColumn) {
  if (v == null || v === '') return '';
  if (col.kind === 'money') return fmtMoney(v);
  if (col.kind === 'date') return new Date(v as string).toLocaleDateString('en-PH');
  return String(v);
}

function toCsv(report: CollectionReport): string {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const header = report.columns.map((c) => esc(c.label)).join(',');
  const lines = report.rows.map((r) =>
    report.columns
      .map((c) => {
        let v = r[c.key];
        if (c.kind === 'date' && v) v = new Date(v as string).toLocaleDateString('en-PH');
        return esc(String(v ?? ''));
      })
      .join(','),
  );
  if (report.totals) {
    lines.push(
      report.columns
        .map((c, i) => esc(i === 0 ? 'TOTAL' : (report.totals?.[c.key]?.toFixed(2) ?? '')))
        .join(','),
    );
  }
  return [header, ...lines].join('\r\n');
}

export default function CollectionReportsPage() {
  const [kind, setKind] = useState('daily-summary');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [report, setReport] = useState<CollectionReport | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setReport(await getCollectionReport(kind, from || undefined, to || undefined));
    } catch (e) {
      setError(e instanceof AccountingApiError ? e.message : 'Failed to load report.');
    } finally {
      setLoading(false);
    }
  }, [kind, from, to]);

  useEffect(() => {
    load();
  }, [load]);

  function exportCsv() {
    if (!report) return;
    const blob = new Blob([toCsv(report)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${kind}${from ? '_' + from : ''}${to ? '_' + to : ''}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="acct-page">
      <AccountingSubNav />
      <h1>Collection Reports</h1>

      <div
        className="acct-toolbar"
        style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}
      >
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {REPORTS.map((r) => (
            <button
              key={r.kind}
              type="button"
              className={`acct-btn${kind === r.kind ? ' acct-btn--primary' : ''}`}
              onClick={() => setKind(r.kind)}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <label style={{ fontSize: 12, color: '#475467' }}>
            From
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              style={{ display: 'block' }}
            />
          </label>
          <label style={{ fontSize: 12, color: '#475467' }}>
            To
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              style={{ display: 'block' }}
            />
          </label>
          <button type="button" className="acct-btn" onClick={exportCsv} disabled={!report}>
            Export CSV
          </button>
          <button
            type="button"
            className="acct-btn"
            onClick={() => window.print()}
            disabled={!report}
          >
            Print
          </button>
        </div>
      </div>

      {error && <div className="acct-error">{error}</div>}
      {loading && <p>Loading…</p>}

      {report && !loading && (
        <>
          <h3 className="acct-section-title">{report.title}</h3>
          {report.rows.length === 0 ? (
            <div className="acct-empty">No data for this range.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="acct-table">
                <thead>
                  <tr>
                    {report.columns.map((c) => (
                      <th
                        key={c.key}
                        style={c.align === 'right' ? { textAlign: 'right' } : undefined}
                      >
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((r, i) => (
                    <tr key={i}>
                      {report.columns.map((c) => (
                        <td
                          key={c.key}
                          className={
                            c.kind === 'money' || c.kind === 'number' ? 'acct-mono' : undefined
                          }
                          style={c.align === 'right' ? { textAlign: 'right' } : undefined}
                        >
                          {fmtCell(r[c.key], c)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                {report.totals && (
                  <tfoot>
                    <tr style={{ fontWeight: 700 }}>
                      {report.columns.map((c, i) => {
                        const total = report.totals?.[c.key];
                        return (
                          <td
                            key={c.key}
                            className={total != null ? 'acct-mono' : undefined}
                            style={c.align === 'right' ? { textAlign: 'right' } : undefined}
                          >
                            {i === 0
                              ? 'TOTAL'
                              : total != null
                                ? c.kind === 'money'
                                  ? fmtMoney(total)
                                  : total.toLocaleString('en-PH')
                                : ''}
                          </td>
                        );
                      })}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
          <p style={{ fontSize: 12, color: '#98a2b3', marginTop: 8 }}>
            {report.rows.length} row(s).
          </p>
        </>
      )}
    </div>
  );
}
