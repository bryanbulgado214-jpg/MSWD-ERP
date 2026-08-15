import { useEffect, useMemo, useState } from 'react';

import { getDisbursements } from '../../accounting/api';
import type { DisbursementSummary } from '../../accounting/types';
import { formatPeso } from '../../budgeting/format-peso';

const payeeOf = (d: DisbursementSummary) => d.supplier?.name ?? d.payeeName ?? '—';
const SETTLED = new Set(['released', 'cleared', 'paid']);

/** AP Subsidiary Ledger — disbursement vouchers grouped by payee/supplier. */
export function ApSubsidiaryLedgerPage() {
  const [dvs, setDvs] = useState<DisbursementSummary[] | null>(null);
  const [error, setError] = useState('');
  const [payee, setPayee] = useState('all');

  useEffect(() => {
    getDisbursements()
      .then(setDvs)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load disbursements.'));
  }, []);

  const payees = useMemo(() => [...new Set((dvs ?? []).map(payeeOf))].sort(), [dvs]);
  const rows = (dvs ?? []).filter((d) => payee === 'all' || payeeOf(d) === payee);
  const total = rows.reduce((s, d) => s + Number(d.netAmount), 0);

  return (
    <div>
      <h2>AP Subsidiary Ledger</h2>
      <p className="reports-subtitle">
        Disbursement vouchers by payee / supplier. Choose a payee to see their voucher ledger and
        outstanding balance.
      </p>

      <div className="reports-filters">
        <label htmlFor="apsl-payee">Payee / Supplier</label>
        <select
          id="apsl-payee"
          value={payee}
          onChange={(e) => setPayee(e.target.value)}
          style={{ minWidth: 260 }}
        >
          <option value="all">All payees</option>
          {payees.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      {error && <div className="reports-error">{error}</div>}
      {!dvs && !error && <div className="reports-loading">Loading…</div>}
      {dvs && rows.length === 0 && (
        <div className="reports-empty">No disbursement vouchers found.</div>
      )}
      {dvs && rows.length > 0 && (
        <div className="reports-table-wrap">
          <table className="reports-table">
            <thead>
              <tr>
                <th>DV #</th>
                <th>Date</th>
                {payee === 'all' && <th>Payee / Supplier</th>}
                <th>Particulars</th>
                <th>Type</th>
                <th className="num">Gross</th>
                <th className="num">Net</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id}>
                  <td className="code">{d.dvNumber}</td>
                  <td>{new Date(d.dvDate).toLocaleDateString('en-PH')}</td>
                  {payee === 'all' && <td>{payeeOf(d)}</td>}
                  <td>{d.particulars}</td>
                  <td style={{ textTransform: 'capitalize' }}>{d.dvType?.replace(/_/g, ' ')}</td>
                  <td className="num">{formatPeso(d.grossAmount)}</td>
                  <td className="num">{formatPeso(d.netAmount)}</td>
                  <td>
                    <span className={`reports-badge reports-badge--${d.status}`}>
                      {d.status.replace(/_/g, ' ')}
                    </span>
                    {!SETTLED.has(d.status) && (
                      <span style={{ color: '#b54708', marginLeft: 6, fontSize: 11 }}>unpaid</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={payee === 'all' ? 6 : 5}>
                  Total net · {rows.length} {rows.length === 1 ? 'voucher' : 'vouchers'}
                  {payee !== 'all' && ` — ${payee}`}
                </td>
                <td className="num">{formatPeso(total)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
