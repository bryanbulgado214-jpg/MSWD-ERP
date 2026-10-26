import { useEffect, useState } from 'react';

import { JevPeekModal } from '../../accounting/pages/JevPeekModal';
import { getUtilizationBreakdown, type UtilizationBreakdown } from '../api';
import { formatPeso } from '../format-peso';

function fmtDate(s: string): string {
  return s ? new Date(s).toLocaleDateString('en-PH', { dateStyle: 'medium' }) : '';
}

export function UtilizationBreakdownModal({
  lineId,
  lineName,
  startDate,
  endDate,
  onClose,
}: {
  lineId: string;
  lineName: string;
  startDate?: string;
  endDate?: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<UtilizationBreakdown | null>(null);
  const [error, setError] = useState('');
  const [peekJevId, setPeekJevId] = useState<string | null>(null);

  useEffect(() => {
    getUtilizationBreakdown(lineId, startDate, endDate)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load breakdown.'));
  }, [lineId, startDate, endDate]);

  // Escape closes the peek first, then this modal.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      if (peekJevId) setPeekJevId(null);
      else onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [peekJevId, onClose]);

  return (
    <div
      onMouseDown={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(16,24,40,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 16,
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: 12,
          width: '100%',
          maxWidth: 760,
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 48px rgba(16,24,40,0.24)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '14px 20px',
            borderBottom: '1px solid #eaecf0',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: 16, color: 'var(--mswd-navy, #0a2540)' }}>
              Entries — {lineName}
            </h3>
            {data && (
              <div style={{ fontSize: 12, color: '#667085', marginTop: 2 }}>
                {fmtDate(data.period.startDate)} – {fmtDate(data.period.endDate)} ·{' '}
                {data.rows.length} {data.rows.length === 1 ? 'entry' : 'entries'}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#667085' }}
            title="Close"
          >
            &times;
          </button>
        </div>

        <div style={{ overflowY: 'auto', padding: '8px 20px 16px' }}>
          {error && <div style={{ color: '#b42318', padding: '12px 0' }}>{error}</div>}
          {!error && !data && <div style={{ padding: '16px 0', color: '#667085' }}>Loading…</div>}
          {data && data.rows.length === 0 && (
            <div style={{ padding: '16px 0', color: '#667085' }}>
              No entries in this period for the accounts mapped to this line.
            </div>
          )}
          {data && data.rows.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#667085', borderBottom: '1px solid #eaecf0' }}>
                  <th style={{ padding: '8px 6px' }}>DV / Voucher No.</th>
                  <th style={{ padding: '8px 6px' }}>Date</th>
                  <th style={{ padding: '8px 6px' }}>Particulars</th>
                  <th style={{ padding: '8px 6px' }}>Account</th>
                  <th style={{ padding: '8px 6px', textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r, i) => (
                  <tr key={`${r.jevId}-${i}`} style={{ borderBottom: '1px solid #f2f4f7' }}>
                    <td style={{ padding: '8px 6px' }}>
                      <button
                        type="button"
                        onClick={() => setPeekJevId(r.jevId)}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          color: '#175cd3',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                        title="Open voucher"
                      >
                        {r.jevNumber}
                      </button>
                    </td>
                    <td style={{ padding: '8px 6px', whiteSpace: 'nowrap' }}>{fmtDate(r.jevDate)}</td>
                    <td style={{ padding: '8px 6px' }}>{r.particulars}</td>
                    <td style={{ padding: '8px 6px' }}>
                      <span style={{ color: '#667085' }}>{r.accountCode}</span> {r.accountName}
                    </td>
                    <td style={{ padding: '8px 6px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {formatPeso(r.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid #d0d5dd', fontWeight: 700 }}>
                  <td style={{ padding: '10px 6px' }} colSpan={4}>
                    Total
                  </td>
                  <td style={{ padding: '10px 6px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {formatPeso(data.total)}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>

      {peekJevId && <JevPeekModal jevId={peekJevId} onClose={() => setPeekJevId(null)} />}
    </div>
  );
}
