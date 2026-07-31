import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { formatPeso } from '../../budgeting/format-peso';
import { getOrs } from '../api';
import type { Ors } from '../types';
import './print-forms.css';

export function PrintOrsPage() {
  const { id } = useParams<{ id: string }>();
  const [ors, setOrs] = useState<Ors | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    getOrs(id).then(setOrs).catch((e) => setError(e.message));
  }, [id]);

  if (error) return <div style={{ padding: 32, color: '#b42318' }}>{error}</div>;
  if (!ors) return <div style={{ padding: 32, color: '#667085' }}>Loading...</div>;

  const orsDate = new Date(ors.orsDate).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className="gov-print-page">
      <div className="gov-print-sheet">
        <div className="gov-appendix">Appendix 40</div>
        <div className="gov-entity">METRO SIQUIJOR WATER DISTRICT</div>
        <div className="gov-subtitle">Siquijor, Siquijor</div>
        <div className="gov-title">OBLIGATION REQUEST AND STATUS</div>

        <div className="gov-info-grid">
          <div className="gov-info-row">
            <span className="gov-info-label">ORS No.:</span>
            <span className="gov-info-value gov-info-value--bold">{ors.orsNumber}</span>
          </div>
          <div className="gov-info-row">
            <span className="gov-info-label">Date:</span>
            <span className="gov-info-value">{orsDate}</span>
          </div>
          <div className="gov-info-row">
            <span className="gov-info-label">PR No.:</span>
            <span className="gov-info-value">{ors.purchaseRequest.prNumber}</span>
          </div>
          <div className="gov-info-row">
            <span className="gov-info-label">Payee:</span>
            <span className="gov-info-value">{ors.purchaseOrder?.supplier?.name ?? ''}</span>
          </div>
          {ors.purchaseOrder && (
            <div className="gov-info-row">
              <span className="gov-info-label">PO No.:</span>
              <span className="gov-info-value">{ors.purchaseOrder.poNumber}</span>
            </div>
          )}
          <div className="gov-info-row">
            <span className="gov-info-label">CAF No.:</span>
            <span className="gov-info-value">{ors.caf.cafNumber}</span>
          </div>
        </div>

        <div className="gov-purpose">
          <span className="gov-purpose__label">Particulars: </span>
          {ors.purchaseRequest.title}
        </div>

        <table className="gov-table">
          <thead>
            <tr>
              <th>Account Code</th>
              <th>Particulars</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="gov-center">{ors.accountCode ?? '—'}</td>
              <td>{ors.purchaseRequest.title}</td>
              <td className="gov-right gov-mono gov-bold">{formatPeso(ors.originalAmount)}</td>
            </tr>
            {Array.from({ length: 5 }).map((_, i) => (
              <tr key={i}><td>&nbsp;</td><td></td><td></td></tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2} className="gov-right gov-bold">TOTAL</td>
              <td className="gov-right gov-mono gov-bold" style={{ borderTop: '2px solid #000' }}>{formatPeso(ors.originalAmount)}</td>
            </tr>
          </tfoot>
        </table>

        <h3 style={{ fontSize: '12pt', fontWeight: 700, margin: '20px 0 8px' }}>Obligation Status</h3>
        <table className="gov-table">
          <thead>
            <tr>
              <th>Original Amount</th>
              <th>Adjustments</th>
              <th>Adjusted Amount</th>
              <th>Cumulative Paid</th>
              <th>Remaining Unpaid</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="gov-right gov-mono">{formatPeso(ors.originalAmount)}</td>
              <td className="gov-right gov-mono">{formatPeso(ors.adjustmentAmount)}</td>
              <td className="gov-right gov-mono gov-bold">{formatPeso(ors.adjustedAmount)}</td>
              <td className="gov-right gov-mono">{formatPeso(ors.cumulativePaid)}</td>
              <td className="gov-right gov-mono gov-bold">{formatPeso(ors.remainingUnpaid)}</td>
            </tr>
          </tbody>
        </table>

        <div className="gov-signatures">
          <div className="gov-sig-col">
            <div className="gov-sig-block">
              <div className="gov-sig-header">Certified:</div>
              <div className="gov-sig-row" style={{ fontSize: '10pt', marginBottom: 8 }}>
                Charges to appropriation/allotment is necessary, lawful, and under my direct supervision.
              </div>
              <div className="gov-sig-line"></div>
              <div className="gov-sig-name"></div>
              <div className="gov-sig-title">Head, Requesting Office/Authorized Representative</div>
              {ors.requestingOfficeCertifiedAt && (
                <div className="gov-sig-date">Date: {new Date(ors.requestingOfficeCertifiedAt).toLocaleDateString('en-PH')}</div>
              )}
            </div>
          </div>
          <div className="gov-sig-col">
            <div className="gov-sig-block">
              <div className="gov-sig-header">Certified:</div>
              <div className="gov-sig-row" style={{ fontSize: '10pt', marginBottom: 8 }}>
                Allotment available and obligated for the purpose/adjustment indicated above.
              </div>
              <div className="gov-sig-line"></div>
              <div className="gov-sig-name"></div>
              <div className="gov-sig-title">Budget Officer / Head of Budget Division/Unit</div>
              {ors.budgetCertifiedAt && (
                <div className="gov-sig-date">Date: {new Date(ors.budgetCertifiedAt).toLocaleDateString('en-PH')}</div>
              )}
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
