import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { AccountingApiError, getCheck } from '../api';
import { checkAmountWords, normalizeCheckLayout } from '../check-layout';
import { CheckFace } from '../CheckFace';
import type { CheckDetail } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// PRE-PRINTED DBP CHECK — data-only overlay.
//
// The physical DBP check (8" × 3", fed top-edge first) already has the bank
// name, "PAY TO THE ORDER OF", the ₱ box, the date grid and the signature line
// printed on it. So we print ONLY the fill-in data, positioned to land in the
// blanks. Positions and font sizes come from this bank account's saved layout
// (calibrated on the Check Alignment screen); an un-calibrated account uses the
// measured defaults. See check-layout.ts.
// ─────────────────────────────────────────────────────────────────────────────

export function PrintCheckPage() {
  const { id } = useParams<{ id: string }>();
  const [check, setCheck] = useState<CheckDetail | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    getCheck(id)
      .then(setCheck)
      .catch((e) => setError(e instanceof AccountingApiError ? e.message : 'Failed to load.'));
  }, [id]);

  if (error) return <div style={{ padding: 32, color: '#b42318' }}>{error}</div>;
  if (!check) return <div style={{ padding: 32, color: '#667085' }}>Loading...</div>;

  const layout = normalizeCheckLayout(check.bankAccount.checkLayout);

  // Use the calendar date as stored (avoid timezone shifting the day).
  const iso = new Date(check.checkDate).toISOString().slice(0, 10);
  const [yyyy, mm, dd] = iso.split('-') as [string, string, string];
  const amountFigures = Number(check.amount).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const words = checkAmountWords(Number(check.amount));
  const { width: sheetW, height: sheetH } = layout.sheet;

  return (
    <>
      <style>{`
        .chk-screen { background: #eef0f3; min-height: 100vh; padding: 24px; display: flex;
          flex-direction: column; align-items: center; gap: 14px; }
        .chk-sheet { position: relative; width: ${sheetW}in; height: ${sheetH}in; background: #fff;
          color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact;
          box-shadow: 0 2px 10px rgba(16,24,40,.18); }
        .chk-controls { display: flex; gap: 10px; }
        .chk-controls button, .chk-controls a { padding: 8px 18px; border: 1px solid #d0d5dd;
          border-radius: 6px; background: #fff; cursor: pointer; font-size: 14px; color: #1f2937;
          text-decoration: none; display: inline-block; }
        .chk-controls button.primary { background: var(--mswd-navy,#0a2a66); color: #fff; border: none; }
        .chk-note { font-size: 12px; color: #667085; max-width: 8in; text-align: center; }
        @media print {
          @page { size: ${sheetW}in ${sheetH}in; margin: 0; }
          html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
          body * { visibility: hidden !important; }
          .chk-sheet, .chk-sheet * { visibility: visible !important; }
          .chk-sheet { position: absolute; left: 0; top: 0; box-shadow: none; }
          .chk-screen { padding: 0; background: #fff; }
          .chk-controls, .chk-note { display: none !important; }
        }
      `}</style>

      <div className="chk-screen">
        <div className="chk-sheet">
          <CheckFace
            layout={layout}
            data={{ dateDigits: `${mm}${dd}${yyyy}`, payee: check.payeeName, amountFigures, words }}
          />
        </div>

        <div className="chk-note">
          Load the DBP check into the printer ({sheetW}&quot; × {sheetH}&quot;, top edge first).
          Only the data above prints — the bank details, boxes and labels are already on the check.
          If anything lands off its line, open{' '}
          <Link to={`/accounting/checks/alignment?bankAccountId=${check.bankAccount.id}`}>
            Check Alignment
          </Link>{' '}
          to nudge it into place.
        </div>
        <div className="chk-controls">
          <button className="primary" onClick={() => window.print()}>
            Print
          </button>
          <Link to={`/accounting/checks/alignment?bankAccountId=${check.bankAccount.id}`}>
            Adjust alignment
          </Link>
          <button onClick={() => window.history.back()}>Back</button>
        </div>
      </div>
    </>
  );
}
