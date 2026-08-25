import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { GovLetterhead } from '../../../app/GovLetterhead';
import { CashierCollectionApiError, getReport, type CashierReport } from '../cashierCollectionApi';
import '../../procurement/pages/print-forms.css';

function peso(v: number) {
  return (v || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/** Cashier's Collection Summary — the printable end page of the daily report. */
export default function CashierCollectionPrintPage() {
  const { id } = useParams<{ id: string }>();
  const [report, setReport] = useState<CashierReport | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    getReport(id)
      .then(setReport)
      .catch((e) =>
        setError(e instanceof CashierCollectionApiError ? e.message : 'Failed to load.'),
      );
  }, [id]);

  if (error) return <div style={{ padding: 32, color: '#b42318' }}>{error}</div>;
  if (!report) return <div style={{ padding: 32, color: '#667085' }}>Loading…</div>;

  const cell: React.CSSProperties = {
    border: '1px solid #000',
    padding: '4px 8px',
    fontSize: '9pt',
  };
  const num: React.CSSProperties = {
    ...cell,
    textAlign: 'right',
    fontVariantNumeric: 'tabular-nums',
  };
  const th: React.CSSProperties = {
    ...cell,
    fontWeight: 700,
    textAlign: 'center',
    background: '#f0f0f0',
  };

  return (
    <div className="gov-print-page">
      <div className="gov-print-sheet" style={{ fontFamily: "'Arial','Helvetica',sans-serif" }}>
        <div style={{ textAlign: 'center', marginBottom: 8 }}>
          <GovLetterhead entityStyle={{ fontSize: 13 }} subStyle={{ fontSize: 9 }} />
          <div style={{ fontSize: '13pt', fontWeight: 700, letterSpacing: 2, marginTop: 6 }}>
            CASHIER&apos;S COLLECTION SUMMARY
          </div>
          <div style={{ fontSize: '10pt', marginTop: 2 }}>{fmtDate(report.reportDate)}</div>
          <div style={{ fontSize: '8.5pt', color: '#444' }}>
            {report.reportNumber}
            {report.journalEntry ? ` · JEV ${report.journalEntry.jevNumber}` : ''}
          </div>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 6 }}>
          <thead>
            <tr>
              <th style={th}>OR / DCR Series</th>
              <th style={th}>Teller / Collector</th>
              <th style={th}>Area</th>
              <th style={th}>Nature of Collection</th>
              <th style={th}>Checks</th>
              <th style={th}>Amount Collected</th>
            </tr>
          </thead>
          <tbody>
            {report.entries.map((e) => (
              <tr key={e.id}>
                <td style={cell}>{e.orSeries}</td>
                <td style={cell}>{e.collectorName}</td>
                <td style={cell}>{e.collectionAreaName ?? '—'}</td>
                <td style={cell}>
                  {e.glLines.map((l, i) => (
                    <div key={i}>
                      {l.collectionTypeLabel}
                      {l.description ? `: ${l.description}` : ''}
                      {e.glLines.length > 1 ? ` (${peso(l.amount)})` : ''}
                    </div>
                  ))}
                </td>
                <td style={num}>{e.checksTotal ? peso(e.checksTotal) : '—'}</td>
                <td style={num}>{peso(e.amount)}</td>
              </tr>
            ))}
            {report.entries.length === 0 && (
              <tr>
                <td style={{ ...cell, textAlign: 'center', color: '#888' }} colSpan={6}>
                  No collections recorded.
                </td>
              </tr>
            )}
            <tr>
              <td style={{ ...th, textAlign: 'right' }} colSpan={4}>
                TOTAL
              </td>
              <td style={{ ...num, fontWeight: 700 }}>
                {report.combinedChecksTotal ? peso(report.combinedChecksTotal) : '—'}
              </td>
              <td style={{ ...num, fontWeight: 700 }}>{peso(report.totalAmount)}</td>
            </tr>
          </tbody>
        </table>

        {/* Remittance verification: cash + checks = total collection vs declared */}
        <table style={{ borderCollapse: 'collapse', marginTop: 10, minWidth: 320 }}>
          <tbody>
            <tr>
              <td style={cell}>Total cash counted</td>
              <td style={num}>{peso(report.combinedCashCountTotal)}</td>
            </tr>
            <tr>
              <td style={cell}>Add: checks received</td>
              <td style={num}>{peso(report.combinedChecksTotal)}</td>
            </tr>
            <tr>
              <td style={{ ...cell, fontWeight: 700 }}>Total collection counted</td>
              <td style={{ ...num, fontWeight: 700 }}>{peso(report.overallCountedTotal)}</td>
            </tr>
            <tr>
              <td style={cell}>Total collections (declared)</td>
              <td style={num}>{peso(report.totalAmount)}</td>
            </tr>
            <tr>
              <td style={{ ...cell, fontWeight: 700 }}>Short / (over)</td>
              <td style={{ ...num, fontWeight: 700 }}>
                {Math.abs(report.overallVariance) < 0.005
                  ? '— (balanced)'
                  : report.overallVariance > 0
                    ? `(${peso(report.overallVariance)}) over`
                    : `${peso(-report.overallVariance)} short`}
              </td>
            </tr>
          </tbody>
        </table>

        {/* Combined cash count */}
        <div style={{ marginTop: 14, fontSize: '9pt', fontWeight: 700 }}>Cash Count (final)</div>
        <table style={{ borderCollapse: 'collapse', marginTop: 4 }}>
          <thead>
            <tr>
              <th style={th}>Denomination</th>
              <th style={th}>Qty</th>
              <th style={th}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {report.denominations
              .filter((d) => (Number(report.combinedCashCount[String(d)]) || 0) > 0)
              .map((d) => {
                const q = Number(report.combinedCashCount[String(d)]) || 0;
                return (
                  <tr key={d}>
                    <td style={cell}>
                      {d < 1 ? `${Math.round(d * 100)}¢` : `₱${d.toLocaleString('en-PH')}`}
                    </td>
                    <td style={num}>{q}</td>
                    <td style={num}>{peso((Math.round(d * 100) * q) / 100)}</td>
                  </tr>
                );
              })}
            {(Number(report.combinedCashCount.other) || 0) > 0 && (
              <tr>
                <td style={cell}>Other coins</td>
                <td style={num}>—</td>
                <td style={num}>{peso(Number(report.combinedCashCount.other) || 0)}</td>
              </tr>
            )}
            <tr>
              <td style={{ ...th, textAlign: 'right' }} colSpan={2}>
                TOTAL CASH COUNTED
              </td>
              <td style={{ ...num, fontWeight: 700 }}>{peso(report.combinedCashCountTotal)}</td>
            </tr>
          </tbody>
        </table>

        <div style={{ marginTop: 40, display: 'flex', gap: 40, fontSize: '9pt' }}>
          <div style={{ flex: 1 }}>
            <div style={{ borderTop: '1px solid #000', paddingTop: 3, fontWeight: 700 }}>
              {report.cashierName.toUpperCase()}
            </div>
            <div>Prepared by — Cashier</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ borderTop: '1px solid #000', paddingTop: 3 }}>&nbsp;</div>
            <div>Reviewed by — Accounting</div>
          </div>
        </div>

        <div className="gov-print-footer">
          <div style={{ fontSize: 8, color: '#98a2b3' }}>
            Printed: {new Date().toLocaleString('en-PH')} | {report.reportNumber}
          </div>
        </div>
      </div>

      <div className="gov-print-controls">
        <button onClick={() => window.print()}>Print</button>
        <button onClick={() => window.history.back()}>Back</button>
      </div>
    </div>
  );
}
