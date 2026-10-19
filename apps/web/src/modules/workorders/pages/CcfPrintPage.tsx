import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { useAuth } from '../../../app/auth';
import { getCcf } from '../api';
import { CCF_CATEGORY_LABELS, CCF_STATUS_LABELS, type Ccf, type CcfStatus } from '../types';

function fmtDateTime(s: string | null): string {
  return s ? new Date(s).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : '';
}
function fmtDate(s: string | null): string {
  return s ? new Date(s).toLocaleDateString('en-PH', { dateStyle: 'medium' }) : '';
}

// The paper form's status choices use our four CCF statuses.
const STATUS_ORDER: CcfStatus[] = ['pending', 'in_progress', 'resolved', 'closed'];

export default function CcfPrintPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { organization } = useAuth();
  const [ccf, setCcf] = useState<Ccf | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    getCcf(id).then(setCcf).catch((e) => setError(e.message));
  }, [id]);

  if (error) return <div style={{ padding: 24 }}>{error}</div>;
  if (!ccf) return <div style={{ padding: 24 }}>Loading…</div>;

  const workOrderNos = (ccf.workOrders ?? []).map((w) => w.woNumber).join(', ');
  const actionText = [ccf.actionTaken, ccf.remarks].filter(Boolean).join('\n');

  return (
    <div className="ccfp">
      <style>{`
        .ccfp { background: #fff; }
        .ccfp-sheet { width: 8.5in; min-height: 11in; margin: 0 auto; padding: 0.6in 0.7in; font-family: 'Times New Roman', Times, serif; color: #000; font-size: 12pt; }
        .ccfp-head { text-align: center; line-height: 1.3; margin-bottom: 6px; }
        .ccfp-head .org { font-size: 14pt; font-weight: bold; text-transform: uppercase; }
        .ccfp-head .addr { font-size: 10pt; }
        .ccfp-title { text-align: center; font-size: 13pt; font-weight: bold; margin: 12px 0 10px; text-transform: uppercase; }
        .ccfp-box { border: 1px solid #000; }
        .ccfp-row { display: flex; border-bottom: 1px solid #000; }
        .ccfp-row:last-child { border-bottom: none; }
        .ccfp-cell { flex: 1; padding: 5px 8px; font-size: 11pt; border-right: 1px solid #000; }
        .ccfp-cell:last-child { border-right: none; }
        .ccfp-cell .l { font-weight: bold; }
        .ccfp-cell .v { display: inline-block; min-width: 40px; }
        .ccfp-block { padding: 5px 8px; border-bottom: 1px solid #000; font-size: 11pt; }
        .ccfp-block:last-child { border-bottom: none; }
        .ccfp-block .l { font-weight: bold; display: block; margin-bottom: 4px; }
        .ccfp-block .fill { min-height: 46px; white-space: pre-wrap; }
        .ccfp-status { display: flex; gap: 22px; flex-wrap: wrap; margin-top: 4px; }
        .ccfp-status label { font-size: 11pt; }
        .ccfp-sigs { display: flex; justify-content: space-between; gap: 40px; margin-top: 44px; }
        .ccfp-sig { flex: 1; text-align: center; font-size: 11pt; }
        .ccfp-sig .line { border-top: 1px solid #000; margin-top: 40px; padding-top: 3px; font-weight: bold; }
        .ccfp-sig .role { font-size: 10pt; }
        .ccfp-sig .date { font-size: 10pt; margin-top: 6px; text-align: left; }
        .ccfp-controls { display: flex; justify-content: center; gap: 10px; padding: 16px; }
        @media print {
          .ccfp-controls { display: none; }
          .ccfp-sheet { margin: 0; }
        }
      `}</style>

      <div className="ccfp-sheet">
        <div className="ccfp-head">
          <div className="org">{organization?.name ?? 'Water District'}</div>
          {organization?.address && <div className="addr">{organization.address}</div>}
        </div>
        <div className="ccfp-title">Customer Feedback &amp; Resolution Register (CFRR)</div>

        <div className="ccfp-box">
          <div className="ccfp-row">
            <div className="ccfp-cell"><span className="l">Series No.:</span> <span className="v">{ccf.referenceNumber}</span></div>
            <div className="ccfp-cell"><span className="l">Date Received:</span> <span className="v">{fmtDateTime(ccf.receivedAt)}</span></div>
          </div>
          <div className="ccfp-row">
            <div className="ccfp-cell"><span className="l">Name of Complainant:</span> <span className="v">{ccf.customerName}</span></div>
            <div className="ccfp-cell"><span className="l">Account No.:</span> <span className="v">{ccf.accountNumber || ''}</span></div>
          </div>
          <div className="ccfp-row">
            <div className="ccfp-cell"><span className="l">Work Order No.:</span> <span className="v">{workOrderNos}</span></div>
            <div className="ccfp-cell"><span className="l">Contact Number:</span> <span className="v"></span></div>
          </div>

          <div className="ccfp-block">
            <span className="l">Details / Nature of Complaint / Concern &nbsp;({CCF_CATEGORY_LABELS[ccf.category]})</span>
            <div className="fill">{ccf.nature}{ccf.requestedAction ? `\n\nRequested action: ${ccf.requestedAction}` : ''}</div>
          </div>

          <div className="ccfp-block">
            <span className="l">Assigned Personnel:</span>
            <div className="fill" style={{ minHeight: 22 }}></div>
          </div>

          <div className="ccfp-block">
            <span className="l">Status</span>
            <div className="ccfp-status">
              {STATUS_ORDER.map((s) => (
                <label key={s}>
                  {ccf.status === s ? '☑' : '☐'} {CCF_STATUS_LABELS[s]}
                </label>
              ))}
            </div>
          </div>

          <div className="ccfp-block">
            <span className="l">Remarks / Action Taken:</span>
            <div className="fill">{actionText}</div>
          </div>

          <div className="ccfp-row">
            <div className="ccfp-cell"><span className="l">Target Resolution Date:</span> <span className="v">{fmtDate(ccf.targetResolutionDate)}</span></div>
            <div className="ccfp-cell"><span className="l">Date Resolved:</span> <span className="v">{fmtDateTime(ccf.resolvedAt)}</span></div>
          </div>
        </div>

        <div className="ccfp-sigs">
          <div className="ccfp-sig">
            <div className="line">&nbsp;</div>
            <div className="role">Recorded by</div>
            <div className="date">Date: ____________________</div>
          </div>
          <div className="ccfp-sig">
            <div className="line">&nbsp;</div>
            <div className="role">Verified by</div>
            <div className="date">Date: ____________________</div>
          </div>
        </div>
      </div>

      <div className="ccfp-controls">
        <button onClick={() => navigate(`/work-orders/ccf/${id}`)} className="wo-btn">&larr; Back</button>
        <button onClick={() => window.print()} className="wo-btn wo-btn--primary">Print</button>
      </div>
    </div>
  );
}
