import { useEffect, useState } from 'react';

import { getDisbursements } from '../../accounting/api';
import type { DisbursementSummary } from '../../accounting/types';
import { formatPeso } from '../../budgeting/format-peso';

const TYPE_LABELS: Record<string, string> = {
  procurement: 'Procurement',
  travel: 'Travel',
  reimbursement: 'Reimbursement',
  payroll: 'Payroll',
  utility: 'Utility',
  other: 'Other',
};

export function ApRegisterReportPage() {
  const [rows, setRows] = useState<DisbursementSummary[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getDisbursements()
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load.'));
  }, []);

  if (error) return <div className="reports-error">{error}</div>;
  if (!rows) return <div className="reports-loading">Loading…</div>;

  const total = rows.reduce((s, r) => s + parseFloat(r.netAmount), 0);

  return (
    <div>
      <h2>Accounts Payable Register</h2>
      <p className="reports-subtitle">
        All disbursement vouchers (payables). Total: <strong>{formatPeso(total)}</strong> across{' '}
        {rows.length} vouchers.
      </p>
      <div className="reports-table-wrap">
        <table className="reports-table">
          <thead>
            <tr>
              <th>DV #</th>
              <th>Date</th>
              <th>Type</th>
              <th>Payee</th>
              <th style={{ textAlign: 'right' }}>Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={{ fontFamily: 'monospace' }}>{r.dvNumber}</td>
                <td>{new Date(r.dvDate).toLocaleDateString('en-PH')}</td>
                <td>{TYPE_LABELS[r.dvType] ?? r.dvType}</td>
                <td>{r.supplier?.name ?? r.payeeName ?? '—'}</td>
                <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                  {formatPeso(r.netAmount)}
                </td>
                <td>{r.status.replace(/_/g, ' ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
