import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { BillingApiError, getBill } from '../api';
import type { Bill } from '../types';
import BillingSubNav from './BillingSubNav';
import './billing.css';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; data: Bill };

function formatPeso(val: string | number) {
  const num = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(num)) return '--';
  return num.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
}

export default function BillDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    if (!id) return;
    getBill(id)
      .then((data) => setState({ status: 'loaded', data }))
      .catch((err) => setState({ status: 'error', message: err instanceof BillingApiError ? err.message : 'Failed.' }));
  }, [id]);

  if (state.status === 'loading') return <div className="bill-page"><BillingSubNav /><p>Loading...</p></div>;
  if (state.status === 'error') return <div className="bill-page"><BillingSubNav /><div className="bill-error">{state.message}</div></div>;

  const bill = state.data;

  return (
    <div className="bill-page">
      <BillingSubNav />
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <Link to="/billing/bills" className="bill-btn" style={{ padding: '4px 10px', fontSize: '12px' }}>
          &larr; Back
        </Link>
        <h1 style={{ margin: 0 }}>Bill {bill.billNumber}</h1>
        <span className={`bill-badge bill-badge--${bill.status}`}>{bill.status}</span>
      </div>

      <div className="bill-detail-grid">
        <div className="bill-detail-item">
          <span className="bill-detail-label">Consumer</span>
          <span className="bill-detail-value">
            <Link to={`/billing/consumers/${bill.consumer.id}`} className="bill-table__link">
              {bill.consumer.accountNumber} — {bill.consumer.lastName}, {bill.consumer.firstName}
              {bill.consumer.middleName ? ` ${bill.consumer.middleName.charAt(0)}.` : ''}
            </Link>
          </span>
        </div>
        <div className="bill-detail-item">
          <span className="bill-detail-label">Address</span>
          <span className="bill-detail-value">{bill.consumer.address}{bill.consumer.barangay ? `, ${bill.consumer.barangay}` : ''}</span>
        </div>
        <div className="bill-detail-item">
          <span className="bill-detail-label">Type</span>
          <span className="bill-detail-value">
            <span className={`bill-badge bill-badge--${bill.consumer.consumerType}`}>{bill.consumer.consumerType}</span>
          </span>
        </div>
        <div className="bill-detail-item">
          <span className="bill-detail-label">Billing Period</span>
          <span className="bill-detail-value">{bill.billingPeriod.name}</span>
        </div>
        <div className="bill-detail-item">
          <span className="bill-detail-label">Due Date</span>
          <span className="bill-detail-value">{new Date(bill.dueDate).toLocaleDateString()}</span>
        </div>
        <div className="bill-detail-item">
          <span className="bill-detail-label">Penalty Date</span>
          <span className="bill-detail-value">{new Date(bill.penaltyDate).toLocaleDateString()}</span>
        </div>
      </div>

      {bill.meterReading && (
        <div style={{ marginTop: '20px' }}>
          <h3 className="bill-section-title">Meter Reading</h3>
          <div className="bill-detail-grid">
            <div className="bill-detail-item">
              <span className="bill-detail-label">Reading Date</span>
              <span className="bill-detail-value">{new Date(bill.meterReading.readingDate).toLocaleDateString()}</span>
            </div>
            <div className="bill-detail-item">
              <span className="bill-detail-label">Previous</span>
              <span className="bill-detail-value bill-text-mono">{bill.meterReading.previousReading}</span>
            </div>
            <div className="bill-detail-item">
              <span className="bill-detail-label">Current</span>
              <span className="bill-detail-value bill-text-mono">{bill.meterReading.currentReading}</span>
            </div>
            <div className="bill-detail-item">
              <span className="bill-detail-label">Consumption</span>
              <span className="bill-detail-value bill-text-mono" style={{ fontWeight: 700 }}>{bill.consumption} cu.m.</span>
            </div>
          </div>
        </div>
      )}

      <div style={{ marginTop: '20px' }}>
        <h3 className="bill-section-title">Charges</h3>
        <table className="bill-table" style={{ maxWidth: '500px' }}>
          <thead>
            <tr><th>Description</th><th style={{ textAlign: 'right' }}>Amount</th></tr>
          </thead>
          <tbody>
            {bill.charges.map((c) => (
              <tr key={c.id}>
                <td>{c.description}</td>
                <td className="bill-text-mono" style={{ textAlign: 'right', color: parseFloat(c.amount) < 0 ? '#039855' : undefined }}>
                  {formatPeso(c.amount)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 700, borderTop: '2px solid #d0d5dd' }}>
              <td>Total</td>
              <td className="bill-text-mono" style={{ textAlign: 'right' }}>{formatPeso(bill.totalAmount)}</td>
            </tr>
            {parseFloat(bill.amountPaid) > 0 && (
              <tr>
                <td>Amount Paid</td>
                <td className="bill-text-mono" style={{ textAlign: 'right', color: '#039855' }}>{formatPeso(bill.amountPaid)}</td>
              </tr>
            )}
            <tr style={{ fontWeight: 700 }}>
              <td>Balance</td>
              <td className="bill-text-mono" style={{ textAlign: 'right', color: parseFloat(bill.balance) > 0 ? '#d92d20' : '#039855' }}>
                {formatPeso(bill.balance)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {bill.notes && (
        <div style={{ marginTop: '16px' }}>
          <h3 className="bill-section-title">Notes</h3>
          <p style={{ fontSize: '13px' }}>{bill.notes}</p>
        </div>
      )}
    </div>
  );
}
