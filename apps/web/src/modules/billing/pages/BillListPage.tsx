import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { BillingApiError, getBillingPeriods, getBills } from '../api';
import type { BillingPeriod, BillListItem } from '../types';
import BillingSubNav from './BillingSubNav';
import './billing.css';

function formatPeso(val: string | number) {
  const num = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(num)) return '--';
  return num.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
}

export default function BillListPage() {
  const [periods, setPeriods] = useState<BillingPeriod[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState('');
  const [bills, setBills] = useState<BillListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getBillingPeriods().then(setPeriods).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedPeriodId) { setBills([]); return; }
    setLoading(true); setError('');
    getBills(`billingPeriodId=${selectedPeriodId}`)
      .then(setBills)
      .catch((err) => setError(err instanceof BillingApiError ? err.message : 'Failed.'))
      .finally(() => setLoading(false));
  }, [selectedPeriodId]);

  const totalAmount = bills.reduce((sum, b) => sum + parseFloat(b.totalAmount), 0);
  const totalPaid = bills.reduce((sum, b) => sum + parseFloat(b.amountPaid), 0);
  const totalBalance = bills.reduce((sum, b) => sum + parseFloat(b.balance), 0);

  return (
    <div className="bill-page">
      <BillingSubNav />
      <h1>Bills</h1>

      <div className="bill-toolbar">
        <select value={selectedPeriodId} onChange={(e) => setSelectedPeriodId(e.target.value)}>
          <option value="">Select Billing Period</option>
          {periods.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {!selectedPeriodId && <div className="bill-empty">Select a billing period to view bills.</div>}
      {loading && <p>Loading bills...</p>}
      {error && <div className="bill-error">{error}</div>}

      {!loading && selectedPeriodId && bills.length === 0 && !error && (
        <div className="bill-empty">No bills generated for this period.</div>
      )}

      {bills.length > 0 && (
        <>
          <div style={{ display: 'flex', gap: '24px', marginBottom: '12px', fontSize: '13px' }}>
            <span>Total: <strong>{formatPeso(totalAmount)}</strong></span>
            <span>Paid: <strong>{formatPeso(totalPaid)}</strong></span>
            <span>Balance: <strong style={{ color: totalBalance > 0 ? '#d92d20' : '#039855' }}>{formatPeso(totalBalance)}</strong></span>
            <span>Count: <strong>{bills.length}</strong></span>
          </div>
          <table className="bill-table">
            <thead>
              <tr>
                <th>Bill #</th>
                <th>Account #</th>
                <th>Consumer</th>
                <th>Consumption</th>
                <th>Total</th>
                <th>Paid</th>
                <th>Balance</th>
                <th>Due Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {bills.map((b) => (
                <tr key={b.id}>
                  <td>
                    <Link to={`/billing/bills/${b.id}`} className="bill-table__link">
                      {b.billNumber}
                    </Link>
                  </td>
                  <td className="bill-text-mono">{b.consumer.accountNumber}</td>
                  <td>{b.consumer.lastName}, {b.consumer.firstName}</td>
                  <td className="bill-text-mono">{b.consumption} cu.m.</td>
                  <td className="bill-text-mono">{formatPeso(b.totalAmount)}</td>
                  <td className="bill-text-mono">{formatPeso(b.amountPaid)}</td>
                  <td className="bill-text-mono" style={{ fontWeight: 600 }}>{formatPeso(b.balance)}</td>
                  <td>{new Date(b.dueDate).toLocaleDateString()}</td>
                  <td>
                    <span className={`bill-badge bill-badge--${b.status}`}>{b.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
