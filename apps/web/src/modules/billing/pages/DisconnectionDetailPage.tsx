import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { BillingApiError, getDisconnectionOrder } from '../api';
import type { DisconnectionOrder } from '../types';
import BillingSubNav from './BillingSubNav';
import './billing.css';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; data: DisconnectionOrder };

function formatPeso(val: string | number) {
  const num = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(num)) return '--';
  return num.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
}

export default function DisconnectionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    if (!id) return;
    getDisconnectionOrder(id)
      .then((data) => setState({ status: 'loaded', data }))
      .catch((err) => setState({ status: 'error', message: err instanceof BillingApiError ? err.message : 'Failed.' }));
  }, [id]);

  if (state.status === 'loading') return <div className="bill-page"><BillingSubNav /><p>Loading...</p></div>;
  if (state.status === 'error') return <div className="bill-page"><BillingSubNav /><div className="bill-error">{state.message}</div></div>;

  const o = state.data;

  return (
    <div className="bill-page">
      <BillingSubNav />
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <Link to="/billing/disconnections" className="bill-btn" style={{ padding: '4px 10px', fontSize: '12px' }}>
          &larr; Back
        </Link>
        <h1 style={{ margin: 0 }}>Order {o.orderNumber}</h1>
        <span className={`bill-badge bill-badge--${o.status}`}>{o.status.replace('_', ' ')}</span>
      </div>

      <div className="bill-detail-grid">
        <div className="bill-detail-item">
          <span className="bill-detail-label">Consumer</span>
          <span className="bill-detail-value">
            <Link to={`/billing/consumers/${o.consumer.id}`} className="bill-table__link">
              {o.consumer.accountNumber} — {o.consumer.lastName}, {o.consumer.firstName}
            </Link>
          </span>
        </div>
        <div className="bill-detail-item">
          <span className="bill-detail-label">Address</span>
          <span className="bill-detail-value">{o.consumer.address}{o.consumer.barangay ? `, ${o.consumer.barangay}` : ''}</span>
        </div>
        <div className="bill-detail-item">
          <span className="bill-detail-label">Consumer Status</span>
          <span className="bill-detail-value">
            <span className={`bill-badge bill-badge--${o.consumer.status}`}>{o.consumer.status}</span>
          </span>
        </div>
        <div className="bill-detail-item">
          <span className="bill-detail-label">Total Arrears</span>
          <span className="bill-detail-value bill-text-mono" style={{ fontSize: '18px', fontWeight: 700, color: '#d92d20' }}>
            {formatPeso(o.totalArrears)}
          </span>
        </div>
        <div className="bill-detail-item">
          <span className="bill-detail-label">Notice Date</span>
          <span className="bill-detail-value">{new Date(o.noticeDate).toLocaleDateString()}</span>
        </div>
        <div className="bill-detail-item">
          <span className="bill-detail-label">Scheduled Disconnection</span>
          <span className="bill-detail-value">{new Date(o.scheduledDate).toLocaleDateString()}</span>
        </div>
      </div>

      <h3 className="bill-section-title">Timeline</h3>
      <div style={{ fontSize: '13px', lineHeight: 1.8 }}>
        <div>
          <strong>Notice Issued:</strong> {new Date(o.createdAt).toLocaleDateString()}
          {o.creator && <> by {o.creator.username}</>}
        </div>
        {o.servedDate && (
          <div>
            <strong>Served:</strong> {new Date(o.servedDate).toLocaleDateString()}
            {o.server && <> by {o.server.username}</>}
          </div>
        )}
        {o.disconnectedDate && (
          <div>
            <strong>Disconnected:</strong> {new Date(o.disconnectedDate).toLocaleDateString()}
            {o.disconnector && <> by {o.disconnector.username}</>}
          </div>
        )}
        {o.reconnectedDate && (
          <div>
            <strong>Reconnected:</strong> {new Date(o.reconnectedDate).toLocaleDateString()}
            {o.reconnector && <> by {o.reconnector.username}</>}
            {o.reconnectionFee && <> — Reconnection fee: {formatPeso(o.reconnectionFee)}</>}
          </div>
        )}
        {o.cancelledDate && (
          <div>
            <strong>Cancelled:</strong> {new Date(o.cancelledDate).toLocaleDateString()}
            {o.canceller && <> by {o.canceller.username}</>}
            {o.cancelReason && <> — {o.cancelReason}</>}
          </div>
        )}
      </div>

      {o.remarks && (
        <div style={{ marginTop: '16px' }}>
          <h3 className="bill-section-title">Remarks</h3>
          <p style={{ fontSize: '13px' }}>{o.remarks}</p>
        </div>
      )}
    </div>
  );
}
