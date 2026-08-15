import { useEffect, useState } from 'react';

import { getAgingReport } from '../../billing/api';
import { formatPeso } from '../../budgeting/format-peso';

interface AgingResult {
  totalOutstanding: number;
  summary: Array<{ bracket: string; count: number; total: number }>;
  details?: Array<{
    accountNumber: string;
    consumer: string;
    balance: number;
    daysOverdue: number;
    bracket: string;
  }>;
}

const BRACKET_LABELS: Record<string, string> = {
  current: 'Current',
  '1-30': '1–30 days',
  '31-60': '31–60 days',
  '61-90': '61–90 days',
  '90+': 'Over 90 days',
};

export function ArAgingReportPage() {
  const [data, setData] = useState<AgingResult | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getAgingReport()
      .then((d) => setData(d as AgingResult))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load.'));
  }, []);

  if (error) return <div className="reports-error">{error}</div>;
  if (!data) return <div className="reports-loading">Loading…</div>;

  return (
    <div>
      <h2>Aging of Receivables</h2>
      <p className="reports-subtitle">
        Outstanding water-bill receivables by age bracket. Total outstanding:{' '}
        <strong>{formatPeso(data.totalOutstanding)}</strong>
      </p>
      <div className="reports-table-wrap">
        <table className="reports-table">
          <thead>
            <tr>
              <th>Age Bracket</th>
              <th style={{ textAlign: 'right' }}>Accounts</th>
              <th style={{ textAlign: 'right' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {data.summary.map((b) => (
              <tr key={b.bracket}>
                <td>{BRACKET_LABELS[b.bracket] ?? b.bracket}</td>
                <td style={{ textAlign: 'right' }}>{b.count}</td>
                <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                  {formatPeso(b.total)}
                </td>
              </tr>
            ))}
            <tr style={{ fontWeight: 700, borderTop: '2px solid #d0d5dd' }}>
              <td>Total</td>
              <td style={{ textAlign: 'right' }}>
                {data.summary.reduce((s, b) => s + b.count, 0)}
              </td>
              <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                {formatPeso(data.totalOutstanding)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
