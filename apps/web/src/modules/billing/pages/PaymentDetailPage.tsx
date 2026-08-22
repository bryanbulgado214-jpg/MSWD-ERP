import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { BillingApiError, getPayment } from '../api';
import type { Payment } from '../types';

import BillingSubNav from './BillingSubNav';
import './billing.css';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; data: Payment };

function formatPeso(val: string | number) {
  const num = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(num)) return '--';
  return num.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
}

export default function PaymentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    if (!id) return;
    getPayment(id)
      .then((data) => setState({ status: 'loaded', data }))
      .catch((err) =>
        setState({
          status: 'error',
          message: err instanceof BillingApiError ? err.message : 'Failed.',
        }),
      );
  }, [id]);

  if (state.status === 'loading')
    return (
      <div className="bill-page">
        <BillingSubNav />
        <p>Loading...</p>
      </div>
    );
  if (state.status === 'error')
    return (
      <div className="bill-page">
        <BillingSubNav />
        <div className="bill-error">{state.message}</div>
      </div>
    );

  const p = state.data;

  return (
    <div className="bill-page">
      <BillingSubNav />
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <Link
          to="/billing/payments"
          className="bill-btn"
          style={{ padding: '4px 10px', fontSize: '12px' }}
        >
          &larr; Back
        </Link>
        <h1 style={{ margin: 0 }}>Payment {p.orNumber}</h1>
        <span className={`bill-badge bill-badge--${p.status}`}>{p.status}</span>
        <Link
          to={`/billing/print/or/${p.id}`}
          className="bill-btn bill-btn--secondary"
          style={{ marginLeft: 'auto', fontSize: '12px', padding: '6px 14px' }}
        >
          Print OR
        </Link>
      </div>

      {p.status === 'voided' && p.voidReason && (
        <div className="bill-error" style={{ marginBottom: '16px' }}>
          <strong>Voided:</strong> {p.voidReason}
          {p.voidedAt && <> — {new Date(p.voidedAt).toLocaleString()}</>}
          {p.voider && <> by {p.voider.username}</>}
        </div>
      )}

      <div className="bill-detail-grid">
        <div className="bill-detail-item">
          <span className="bill-detail-label">Consumer</span>
          <span className="bill-detail-value">
            <Link to={`/billing/consumers/${p.consumer.id}`} className="bill-table__link">
              {p.consumer.accountNumber} — {p.consumer.lastName}, {p.consumer.firstName}
            </Link>
          </span>
        </div>
        <div className="bill-detail-item">
          <span className="bill-detail-label">Address</span>
          <span className="bill-detail-value">
            {p.consumer.address}
            {p.consumer.barangay ? `, ${p.consumer.barangay}` : ''}
          </span>
        </div>
        <div className="bill-detail-item">
          <span className="bill-detail-label">Payment Date</span>
          <span className="bill-detail-value">{new Date(p.paymentDate).toLocaleDateString()}</span>
        </div>
        <div className="bill-detail-item">
          <span className="bill-detail-label">Total Amount</span>
          <span
            className="bill-detail-value bill-text-mono"
            style={{ fontSize: '18px', fontWeight: 700, color: '#039855' }}
          >
            {formatPeso(p.totalAmount)}
          </span>
        </div>
        <div className="bill-detail-item">
          <span className="bill-detail-label">Payment Method</span>
          <span className="bill-detail-value" style={{ textTransform: 'capitalize' }}>
            {p.paymentMethod.replace('_', ' ')}
          </span>
        </div>
        {p.checkNumber && (
          <div className="bill-detail-item">
            <span className="bill-detail-label">Check #</span>
            <span className="bill-detail-value bill-text-mono">{p.checkNumber}</span>
          </div>
        )}
        {p.checkDate && (
          <div className="bill-detail-item">
            <span className="bill-detail-label">Check Date</span>
            <span className="bill-detail-value">{new Date(p.checkDate).toLocaleDateString()}</span>
          </div>
        )}
        {p.bankName && (
          <div className="bill-detail-item">
            <span className="bill-detail-label">Bank</span>
            <span className="bill-detail-value">{p.bankName}</span>
          </div>
        )}
        {p.referenceNumber && (
          <div className="bill-detail-item">
            <span className="bill-detail-label">Reference #</span>
            <span className="bill-detail-value bill-text-mono">{p.referenceNumber}</span>
          </div>
        )}
        <div className="bill-detail-item">
          <span className="bill-detail-label">Cashier</span>
          <span className="bill-detail-value">{p.cashier?.username ?? '—'}</span>
        </div>
      </div>

      <h3 className="bill-section-title">Bill Allocations</h3>
      <table className="bill-table" style={{ maxWidth: '600px' }}>
        <thead>
          <tr>
            <th>Bill #</th>
            <th>Period</th>
            <th style={{ textAlign: 'right' }}>Applied</th>
          </tr>
        </thead>
        <tbody>
          {p.allocations.map((a) => (
            <tr key={a.id}>
              <td>
                {a.bill ? (
                  <Link
                    to={`/billing/bills/${a.bill.id}`}
                    className="bill-table__link bill-text-mono"
                  >
                    {a.bill.billNumber}
                  </Link>
                ) : (
                  (a.collectionTypeName ?? 'Collection')
                )}
              </td>
              <td>{a.bill?.billingPeriod?.name ?? '—'}</td>
              <td className="bill-text-mono" style={{ textAlign: 'right' }}>
                {formatPeso(a.amountApplied)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ fontWeight: 700, borderTop: '2px solid #d0d5dd' }}>
            <td colSpan={2}>Total</td>
            <td className="bill-text-mono" style={{ textAlign: 'right' }}>
              {formatPeso(p.totalAmount)}
            </td>
          </tr>
        </tfoot>
      </table>

      {p.remarks && (
        <div style={{ marginTop: '16px' }}>
          <h3 className="bill-section-title">Remarks</h3>
          <p style={{ fontSize: '13px' }}>{p.remarks}</p>
        </div>
      )}

      <div style={{ marginTop: '24px', fontSize: '12px', color: '#98a2b3' }}>
        Created: {new Date(p.createdAt).toLocaleString()}
        {p.creator && <> by {p.creator.username}</>}
      </div>
    </div>
  );
}
