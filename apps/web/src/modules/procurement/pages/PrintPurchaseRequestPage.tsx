import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { formatPeso } from '../../budgeting/format-peso';
import { getPurchaseRequest, ProcurementApiError } from '../api';
import type { PurchaseRequest } from '../types';
import './print-pr.css';

export function PrintPurchaseRequestPage() {
  const { id } = useParams<{ id: string }>();
  const [pr, setPr] = useState<PurchaseRequest | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    getPurchaseRequest(id)
      .then((data) => setPr(data))
      .catch((err) =>
        setError(err instanceof ProcurementApiError ? err.message : 'Failed to load PR.'),
      );
  }, [id]);


  if (error) {
    return (
      <div className="print-error">
        <p>{error}</p>
        <button onClick={() => window.history.back()}>Go Back</button>
      </div>
    );
  }

  if (!pr) {
    return <div className="print-error"><p>Loading...</p></div>;
  }

  const rcName = pr.responsibilityCenter?.code
    ?? pr.budgetRelease?.budgetHeader?.responsibilityCenter?.code
    ?? '';
  const fundCluster = pr.fundSource?.name
    ?? pr.budgetRelease?.budgetHeader?.fundSource?.name
    ?? '';
  const officeName = pr.department?.name ?? '';

  const prDate = new Date(pr.createdAt).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const MAX_ROWS = 22;
  const itemRows = pr.items.length;
  const emptyRows = Math.max(0, MAX_ROWS - itemRows);

  return (
    <div className="pr-print-page">
      <div className="pr-print-sheet">
        {/* Appendix label */}
        <div className="pr-print-appendix">Appendix 60</div>

        {/* Title */}
        <h1 className="pr-print-title">PURCHASE REQUEST</h1>

        {/* Header fields */}
        <div className="pr-print-header">
          <div className="pr-print-header__row">
            <div className="pr-print-header__left">
              <span className="pr-print-label">Entity Name: </span>
              <span className="pr-print-value pr-print-value--bold">METRO SIQUIJOR WATER DISTRICT</span>
            </div>
            <div className="pr-print-header__right">
              <span className="pr-print-label">Fund Cluster: </span>
              <span className="pr-print-value pr-print-value--underline">
                {fundCluster || '____________________'}
              </span>
            </div>
          </div>

          <div className="pr-print-header__row">
            <div className="pr-print-header__left">
              <span className="pr-print-label">Office/Section: </span>
              <span className="pr-print-value pr-print-value--underline">
                {officeName || '____________________'}
              </span>
            </div>
            <div className="pr-print-header__right-split">
              <div>
                <span className="pr-print-label">PR No.: </span>
                <span className="pr-print-value pr-print-value--bold pr-print-value--underline">
                  {pr.prNumber}
                </span>
              </div>
              <div>
                <span className="pr-print-label">Date: </span>
                <span className="pr-print-value pr-print-value--underline">{prDate}</span>
              </div>
            </div>
          </div>

          <div className="pr-print-header__row">
            <div className="pr-print-header__left">&nbsp;</div>
            <div className="pr-print-header__right">
              <span className="pr-print-label">Responsibility Center Code: </span>
              <span className="pr-print-value pr-print-value--underline">
                {rcName || '___________'}
              </span>
            </div>
          </div>
        </div>

        {/* Items Table */}
        <table className="pr-print-table">
          <thead>
            <tr>
              <th className="pr-print-th" style={{ width: '12%' }}>Stock/<br />Property No.</th>
              <th className="pr-print-th" style={{ width: '8%' }}>Unit</th>
              <th className="pr-print-th" style={{ width: '36%' }}>Item Description</th>
              <th className="pr-print-th" style={{ width: '10%' }}>Quantity</th>
              <th className="pr-print-th" style={{ width: '15%' }}>Unit Cost</th>
              <th className="pr-print-th" style={{ width: '19%' }}>Total Cost</th>
            </tr>
          </thead>
          <tbody>
            {pr.items.map((item, idx) => (
              <tr key={item.id}>
                <td className="pr-print-td pr-print-td--center">{idx + 1}</td>
                <td className="pr-print-td pr-print-td--center">{item.unitOfMeasure}</td>
                <td className="pr-print-td">{item.description}</td>
                <td className="pr-print-td pr-print-td--center">
                  {parseFloat(item.quantity).toLocaleString()}
                </td>
                <td className="pr-print-td pr-print-td--right">{formatPeso(item.estimatedUnitCost)}</td>
                <td className="pr-print-td pr-print-td--right">{formatPeso(item.estimatedTotalCost)}</td>
              </tr>
            ))}
            {Array.from({ length: emptyRows }).map((_, idx) => (
              <tr key={`empty-${idx}`}>
                <td className="pr-print-td">&nbsp;</td>
                <td className="pr-print-td">&nbsp;</td>
                <td className="pr-print-td">&nbsp;</td>
                <td className="pr-print-td">&nbsp;</td>
                <td className="pr-print-td">&nbsp;</td>
                <td className="pr-print-td">&nbsp;</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="pr-print-td" colSpan={4}>&nbsp;</td>
              <td className="pr-print-td pr-print-td--right pr-print-td--bold">Total:</td>
              <td className="pr-print-td pr-print-td--right pr-print-td--bold">
                {formatPeso(pr.totalAmount)}
              </td>
            </tr>
          </tfoot>
        </table>

        {/* Purpose */}
        <div className="pr-print-purpose">
          <span className="pr-print-label">Purpose: </span>
          <span className="pr-print-value">
            {pr.purpose || pr.description || pr.title}
          </span>
        </div>

        {/* Signature Section */}
        <div className="pr-print-signatures">
          {/* Left column: Requested by */}
          <div className="pr-print-sig-col">
            <div className="pr-print-sig-block">
              <div className="pr-print-sig-header">Requested by:</div>
              <div className="pr-print-sig-row">
                <span className="pr-print-sig-label">Signature :</span>
                <span className="pr-print-sig-line">_________________________</span>
              </div>
              <div className="pr-print-sig-row">
                <span className="pr-print-sig-label">Printed Name :</span>
                <span className="pr-print-sig-name">
                  {pr.creator?.username?.toUpperCase() ?? ''}
                </span>
              </div>
              <div className="pr-print-sig-row">
                <span className="pr-print-sig-label">Designation :</span>
                <span className="pr-print-sig-desg">
                  {pr.department?.name ?? ''}
                </span>
              </div>
            </div>
          </div>

          {/* Right column: Approved by (Budget Officer + GM) */}
          <div className="pr-print-sig-col">
            <div className="pr-print-sig-block">
              <div className="pr-print-sig-header">Approved by:</div>
              <div className="pr-print-sig-row">
                <span className="pr-print-sig-line">___________________________</span>
              </div>
              <div className="pr-print-sig-row">
                <span className="pr-print-sig-name">
                  {pr.budgetCertifier?.username?.toUpperCase() ?? ''}
                </span>
              </div>
              <div className="pr-print-sig-row">
                <span className="pr-print-sig-desg">Budget Officer</span>
              </div>
            </div>

            <div className="pr-print-sig-block pr-print-sig-block--gm">
              <div className="pr-print-sig-row">
                <span className="pr-print-sig-line">___________________________</span>
              </div>
              <div className="pr-print-sig-row">
                <span className="pr-print-sig-name">
                  {pr.approver?.username?.toUpperCase() ?? ''}
                </span>
              </div>
              <div className="pr-print-sig-row">
                <span className="pr-print-sig-desg">General Manager</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Screen-only controls */}
      <div className="pr-print-controls">
        <button onClick={() => window.print()}>Print</button>
        <button onClick={() => window.history.back()}>Back</button>
      </div>
    </div>
  );
}
