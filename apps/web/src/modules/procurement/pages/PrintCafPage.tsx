import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { GovLetterhead } from '../../../app/GovLetterhead';
import { formatPeso } from '../../budgeting/format-peso';
import { getCaf } from '../api';
import type { Caf } from '../types';
import './print-forms.css';

export function PrintCafPage() {
  const { id } = useParams<{ id: string }>();
  const [caf, setCaf] = useState<Caf | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    getCaf(id)
      .then(setCaf)
      .catch((e) => setError(e.message));
  }, [id]);

  if (error) return <div style={{ padding: 32, color: '#b42318' }}>{error}</div>;
  if (!caf) return <div style={{ padding: 32, color: '#667085' }}>Loading...</div>;

  const certDate = caf.certificationDate
    ? new Date(caf.certificationDate).toLocaleDateString('en-PH', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : new Date(caf.createdAt).toLocaleDateString('en-PH', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

  return (
    <div className="gov-print-page">
      <div className="gov-print-sheet">
        <GovLetterhead />
        <div className="gov-title">CERTIFICATION OF AVAILABILITY OF FUNDS</div>

        <div className="gov-info-grid">
          <div className="gov-info-row">
            <span className="gov-info-label">CAF No.:</span>
            <span className="gov-info-value gov-info-value--bold">{caf.cafNumber}</span>
          </div>
          <div className="gov-info-row">
            <span className="gov-info-label">Date:</span>
            <span className="gov-info-value">{certDate}</span>
          </div>
          <div className="gov-info-row">
            <span className="gov-info-label">PR No.:</span>
            <span className="gov-info-value">{caf.purchaseRequest.prNumber}</span>
          </div>
          <div className="gov-info-row">
            <span className="gov-info-label">PR Title:</span>
            <span className="gov-info-value">{caf.purchaseRequest.title}</span>
          </div>
          {caf.purchaseOrder && (
            <div className="gov-info-row">
              <span className="gov-info-label">PO No.:</span>
              <span className="gov-info-value">{caf.purchaseOrder.poNumber}</span>
            </div>
          )}
          <div className="gov-info-row">
            <span className="gov-info-label">Fund Source:</span>
            <span className="gov-info-value">
              {caf.fundSource.name} ({caf.fundSource.code})
            </span>
          </div>
          <div className="gov-info-row">
            <span className="gov-info-label">Responsibility Center:</span>
            <span className="gov-info-value">
              {caf.responsibilityCenter.name} ({caf.responsibilityCenter.code})
            </span>
          </div>
          <div className="gov-info-row">
            <span className="gov-info-label">Fiscal Year:</span>
            <span className="gov-info-value">{caf.fiscalYear.name}</span>
          </div>
        </div>

        <div className="gov-cert-box">
          <div className="gov-cert-box__title">CERTIFICATION</div>
          <div className="gov-cert-box__text">
            This is to certify that funds in the amount of{' '}
            <strong>{formatPeso(caf.certifiedAmount)}</strong> are available for the purpose stated
            in Purchase Request No. <strong>{caf.purchaseRequest.prNumber}</strong>
            {caf.purchaseOrder ? ` / Purchase Order No. ${caf.purchaseOrder.poNumber}` : ''},
            chargeable against the appropriation/allotment indicated below:
          </div>

          <table className="gov-table">
            <thead>
              <tr>
                <th>Account Code</th>
                <th>Particulars</th>
                <th>Available Before</th>
                <th>Certified Amount</th>
                <th>Available After</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="gov-center">
                  {caf.accountCode ?? caf.budgetLine?.accountCode ?? '—'}
                </td>
                <td>{caf.purchaseRequest.title}</td>
                <td className="gov-right gov-mono">{formatPeso(caf.availableBefore)}</td>
                <td className="gov-right gov-mono gov-bold">{formatPeso(caf.certifiedAmount)}</td>
                <td className="gov-right gov-mono">{formatPeso(caf.availableAfter)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="gov-signatures">
          <div className="gov-sig-col">
            <div className="gov-sig-block">
              <div className="gov-sig-header">Certified Correct:</div>
              <div className="gov-sig-line"></div>
              <div className="gov-sig-name">{caf.certifier?.username?.toUpperCase() ?? ''}</div>
              <div className="gov-sig-title">Budget Officer</div>
              {caf.certifiedAt && (
                <div className="gov-sig-date">
                  Date: {new Date(caf.certifiedAt).toLocaleDateString('en-PH')}
                </div>
              )}
            </div>
          </div>
          <div className="gov-sig-col">
            <div className="gov-sig-block">
              <div className="gov-sig-header">Approved by:</div>
              <div className="gov-sig-line"></div>
              <div className="gov-sig-name"></div>
              <div className="gov-sig-title">General Manager</div>
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
