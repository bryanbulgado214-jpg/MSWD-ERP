import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { formatPeso } from '../../budgeting/format-peso';
import { getPurchaseOrder } from '../api';
import type { PurchaseOrder } from '../types';
import './print-forms.css';

export function PrintPurchaseOrderPage() {
  const { id } = useParams<{ id: string }>();
  const [po, setPo] = useState<PurchaseOrder | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    getPurchaseOrder(id).then(setPo).catch((e) => setError(e.message));
  }, [id]);

  if (error) return <div style={{ padding: 32, color: '#b42318' }}>{error}</div>;
  if (!po) return <div style={{ padding: 32, color: '#667085' }}>Loading...</div>;

  const poDate = new Date(po.poDate).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className="gov-print-page">
      <div className="gov-print-sheet">
        <div className="gov-entity">METRO SIQUIJOR WATER DISTRICT</div>
        <div className="gov-subtitle">Siquijor, Siquijor</div>
        <div className="gov-title">PURCHASE ORDER</div>

        <div className="gov-info-grid">
          <div className="gov-info-row">
            <span className="gov-info-label">Supplier:</span>
            <span className="gov-info-value gov-info-value--bold">{po.supplier.name}</span>
          </div>
          <div className="gov-info-row">
            <span className="gov-info-label">P.O. No.:</span>
            <span className="gov-info-value gov-info-value--bold">{po.poNumber}</span>
          </div>
          <div className="gov-info-row">
            <span className="gov-info-label">Address:</span>
            <span className="gov-info-value">{po.supplier.address ?? ''}</span>
          </div>
          <div className="gov-info-row">
            <span className="gov-info-label">Date:</span>
            <span className="gov-info-value">{poDate}</span>
          </div>
          <div className="gov-info-row">
            <span className="gov-info-label">TIN:</span>
            <span className="gov-info-value">{po.supplier.tin ?? ''}</span>
          </div>
          <div className="gov-info-row">
            <span className="gov-info-label">Mode of Procurement:</span>
            <span className="gov-info-value">{po.modeOfProcurement ?? ''}</span>
          </div>
          <div className="gov-info-row">
            <span className="gov-info-label">PR No.:</span>
            <span className="gov-info-value">{po.purchaseRequest.prNumber}</span>
          </div>
          <div className="gov-info-row">
            <span className="gov-info-label">Award Notice No.:</span>
            <span className="gov-info-value">{po.awardNoticeNumber ?? ''}</span>
          </div>
        </div>

        <p style={{ fontSize: '11pt', marginBottom: 8 }}>
          Gentlemen: Please furnish this office the following articles subject to the terms and conditions contained herein:
        </p>

        <div className="gov-info-grid" style={{ marginBottom: 8 }}>
          <div className="gov-info-row">
            <span className="gov-info-label">Place of Delivery:</span>
            <span className="gov-info-value">MSWD Main Office</span>
          </div>
          <div className="gov-info-row">
            <span className="gov-info-label">Delivery Term:</span>
            <span className="gov-info-value">{po.deliveryTerms ?? ''}</span>
          </div>
          <div className="gov-info-row">
            <span className="gov-info-label">Date of Delivery:</span>
            <span className="gov-info-value">{po.awardDate ? new Date(po.awardDate).toLocaleDateString('en-PH') : ''}</span>
          </div>
          <div className="gov-info-row">
            <span className="gov-info-label">Payment Term:</span>
            <span className="gov-info-value">{po.paymentTerms ?? ''}</span>
          </div>
        </div>

        <table className="gov-table">
          <thead>
            <tr>
              <th style={{ width: '10%' }}>Item No.</th>
              <th style={{ width: '8%' }}>Unit</th>
              <th style={{ width: '42%' }}>Description</th>
              <th style={{ width: '10%' }}>Qty</th>
              <th style={{ width: '15%' }}>Unit Cost</th>
              <th style={{ width: '15%' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="gov-center">—</td>
              <td className="gov-center">—</td>
              <td>{po.purchaseRequest.title}</td>
              <td className="gov-center">—</td>
              <td className="gov-right gov-mono">—</td>
              <td className="gov-right gov-mono gov-bold">{formatPeso(po.contractAmount)}</td>
            </tr>
            {Array.from({ length: 12 }).map((_, i) => (
              <tr key={i}><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td></tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5} className="gov-right gov-bold" style={{ borderTop: '2px solid #000' }}>TOTAL AMOUNT</td>
              <td className="gov-right gov-mono gov-bold" style={{ borderTop: '2px solid #000' }}>{formatPeso(po.contractAmount)}</td>
            </tr>
          </tfoot>
        </table>

        {po.remarks && (
          <div className="gov-purpose">
            <span className="gov-purpose__label">Remarks: </span>
            {po.remarks}
          </div>
        )}

        <div className="gov-signatures">
          <div className="gov-sig-col">
            <div className="gov-sig-block">
              <div className="gov-sig-header">Conforme:</div>
              <div className="gov-sig-line"></div>
              <div className="gov-sig-name">{po.supplier.name.toUpperCase()}</div>
              <div className="gov-sig-title">Supplier</div>
            </div>
          </div>
          <div className="gov-sig-col">
            <div className="gov-sig-block">
              <div className="gov-sig-header">Very truly yours,</div>
              <div className="gov-sig-line"></div>
              <div className="gov-sig-name">{po.approver?.username?.toUpperCase() ?? ''}</div>
              <div className="gov-sig-title">General Manager</div>
              {po.approvedAt && <div className="gov-sig-date">Date: {new Date(po.approvedAt).toLocaleDateString('en-PH')}</div>}
            </div>
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
