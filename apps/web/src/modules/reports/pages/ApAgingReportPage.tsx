import { useEffect, useState } from 'react';

import { getApAging } from '../../accounting/api';
import type { ApAgingResult } from '../../accounting/types';
import { formatPeso } from '../../budgeting/format-peso';

const BRACKET_LABEL: Record<string, string> = {
  current: 'Current',
  d31_60: '31–60 days',
  d61_90: '61–90 days',
  over90: 'Over 90 days',
};

export function ApAgingReportPage() {
  const [data, setData] = useState<ApAgingResult | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getApAging()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load.'));
  }, []);

  if (error) return <div className="reports-error">{error}</div>;
  if (!data) return <div className="reports-loading">Loading…</div>;

  return (
    <div>
      <h2>Accounts Payable Aging</h2>
      <p className="reports-subtitle">
        Outstanding payables (disbursement vouchers not yet paid by a released check), aged as of{' '}
        {data.asOf}. Total outstanding: <strong>{formatPeso(data.total)}</strong>.
      </p>

      <div className="reports-table-wrap" style={{ marginBottom: 20 }}>
        <table className="reports-table">
          <thead>
            <tr>
              <th>Age Bracket</th>
              <th style={{ textAlign: 'right' }}>Count</th>
              <th style={{ textAlign: 'right' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {data.brackets.map((b) => (
              <tr key={b.key}>
                <td>{b.label}</td>
                <td style={{ textAlign: 'right' }}>{b.count}</td>
                <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                  {formatPeso(b.total)}
                </td>
              </tr>
            ))}
            <tr style={{ fontWeight: 700, borderTop: '2px solid #d0d5dd' }}>
              <td>Total</td>
              <td style={{ textAlign: 'right' }}>{data.rows.length}</td>
              <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                {formatPeso(data.total)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {data.rows.length > 0 && (
        <>
          <h3 style={{ fontSize: 15 }}>Open payables</h3>
          <div className="reports-table-wrap">
            <table className="reports-table">
              <thead>
                <tr>
                  <th>DV #</th>
                  <th>Date</th>
                  <th>Payee</th>
                  <th style={{ textAlign: 'right' }}>Age (days)</th>
                  <th>Bracket</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.dvNumber}>
                    <td style={{ fontFamily: 'monospace' }}>{r.dvNumber}</td>
                    <td>{new Date(r.dvDate).toLocaleDateString('en-PH')}</td>
                    <td>{r.payee}</td>
                    <td style={{ textAlign: 'right' }}>{r.ageDays}</td>
                    <td>{BRACKET_LABEL[r.bracket] ?? r.bracket}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                      {formatPeso(r.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
