import { useEffect, useState } from 'react';

import { formatPeso } from '../../budgeting/format-peso';
import { getPpmpAcquisitions, type AcquisitionDocument } from '../api';

interface Props {
  ppmpItemId: string;
  itemCode: string;
  itemDescription: string;
  onClose: () => void;
}

function qty(v: string | null): string {
  return v ? parseFloat(v).toLocaleString('en-PH', { maximumFractionDigits: 2 }) : '—';
}

// A floating window that lists the documents (POs + their DVs) that recorded
// prior acquisitions of a PPMP item, for the "purchased to date" drill-down.
export function AcquisitionsModal({ ppmpItemId, itemCode, itemDescription, onClose }: Props) {
  const [docs, setDocs] = useState<AcquisitionDocument[] | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getPpmpAcquisitions(ppmpItemId)
      .then((r) => setDocs(r.documents))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load documents.'))
      .finally(() => setLoading(false));
  }, [ppmpItemId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div style={overlay} onMouseDown={onClose}>
      <div style={card} onMouseDown={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--mswd-navy)' }}>
              Purchased to Date — {itemCode}
            </div>
            <div style={{ fontSize: 12, color: '#667085' }}>{itemDescription}</div>
          </div>
          <button onClick={onClose} style={closeBtn} aria-label="Close">
            ×
          </button>
        </div>
        <div style={{ padding: '0 20px 18px', overflow: 'auto' }}>
          {loading ? (
            <div style={{ padding: 20, color: '#667085' }}>Loading documents…</div>
          ) : error ? (
            <div className="pr-error">{error}</div>
          ) : !docs || docs.length === 0 ? (
            <div style={{ padding: 20, color: '#667085' }}>
              No purchase documents recorded against this item yet.
            </div>
          ) : (
            <table className="pr-table" style={{ fontSize: 13 }}>
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Reference</th>
                  <th>Date</th>
                  <th style={{ textAlign: 'right' }}>Qty</th>
                  <th style={{ textAlign: 'right' }}>Unit Cost</th>
                  <th style={{ textAlign: 'right' }}>Total Amount</th>
                </tr>
              </thead>
              <tbody>
                {docs.map((d, i) => (
                  <tr key={`${d.reference}-${i}`}>
                    <td>
                      {d.type}
                      {d.relatedTo ? ` (for ${d.relatedTo})` : ''}
                    </td>
                    <td>
                      <strong>{d.reference}</strong>
                      {d.supplier ? ` · ${d.supplier}` : ''}
                    </td>
                    <td>{d.date ?? '—'}</td>
                    <td style={{ textAlign: 'right' }}>{qty(d.quantity)}</td>
                    <td style={{ textAlign: 'right' }}>{d.unitCost ? formatPeso(d.unitCost) : '—'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatPeso(d.totalAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p style={{ fontSize: 11, color: '#98a2b3', marginTop: 12 }}>
            Petty Cash Voucher purchases aren't attributable to a PPMP item in the current records,
            so they don't appear here.
          </p>
        </div>
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(16,24,40,0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 2000,
};
const card: React.CSSProperties = {
  background: '#fff',
  borderRadius: 12,
  width: 'min(820px, 94vw)',
  maxHeight: '86vh',
  display: 'flex',
  flexDirection: 'column',
  boxShadow: '0 24px 56px rgba(16,24,40,0.28)',
};
const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  padding: '18px 20px 12px',
};
const closeBtn: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  fontSize: 22,
  cursor: 'pointer',
  color: '#667085',
  lineHeight: 1,
};
