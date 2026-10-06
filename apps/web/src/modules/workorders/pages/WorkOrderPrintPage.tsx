import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { useAuth } from '../../../app/auth';
import { getWorkOrder } from '../api';
import {
  WO_NATURE_LABELS,
  WO_PRIORITY_LABELS,
  WO_TYPE_LABELS,
  type WorkOrder,
  type WorkOrderType,
} from '../types';

function fmt(s: string | null): string {
  return s ? new Date(s).toLocaleString() : '';
}
function fmtDate(s: string | null): string {
  return s ? new Date(s).toLocaleDateString() : '';
}

export default function WorkOrderPrintPage() {
  const { id } = useParams<{ id: string }>();
  const { organization } = useAuth();
  const [wo, setWo] = useState<WorkOrder | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    getWorkOrder(id).then(setWo).catch((e) => setError(e.message));
  }, [id]);

  if (error) return <div style={{ padding: 24 }}>{error}</div>;
  if (!wo) return <div style={{ padding: 24 }}>Loading…</div>;

  const members = wo.members ?? [];
  const leaderName = wo.teamLeader?.name ?? members.find((m) => m.isLeader)?.personnel?.name ?? '';
  const customer =
    wo.customerName ||
    (wo.consumer ? `${wo.consumer.firstName} ${wo.consumer.lastName} (${wo.consumer.accountNumber})` : '');

  return (
    <div className="wop">
      <style>{`
        .wop { background: #fff; }
        .wop-sheet { width: 8.5in; min-height: 11in; margin: 0 auto; padding: 0.6in 0.7in; font-family: 'Times New Roman', Times, serif; color: #000; font-size: 12pt; }
        .wop-head { text-align: center; line-height: 1.3; margin-bottom: 10px; }
        .wop-head .org { font-size: 13pt; font-weight: bold; text-transform: uppercase; }
        .wop-head .addr { font-size: 10pt; }
        .wop-title { text-align: center; font-size: 14pt; font-weight: bold; letter-spacing: 2px; margin: 14px 0 4px; }
        .wop-no { text-align: center; font-size: 11pt; margin-bottom: 14px; }
        .wop-row { display: flex; gap: 16px; margin-bottom: 4px; }
        .wop-f { flex: 1; display: flex; gap: 6px; font-size: 11pt; }
        .wop-f .l { font-weight: bold; white-space: nowrap; }
        .wop-f .v { flex: 1; border-bottom: 1px solid #000; min-height: 16px; }
        .wop-sec { margin-top: 12px; }
        .wop-sec h4 { font-size: 11pt; margin: 0 0 4px; border-bottom: 1px solid #000; padding-bottom: 2px; }
        .wop-box { border: 1px solid #000; min-height: 48px; padding: 4px 6px; font-size: 11pt; white-space: pre-wrap; }
        .wop-crew { font-size: 11pt; }
        .wop-crew li { margin-bottom: 2px; }
        .wop-sigs { display: flex; gap: 40px; margin-top: 40px; }
        .wop-sig { flex: 1; text-align: center; font-size: 11pt; }
        .wop-sig .line { border-top: 1px solid #000; margin-top: 34px; padding-top: 3px; font-weight: bold; }
        .wop-sig .role { font-size: 10pt; }
        .wop-controls { text-align: center; padding: 16px; }
        @media print { .wop-controls { display: none; } .wop-sheet { margin: 0; } }
      `}</style>

      <div className="wop-sheet">
        <div className="wop-head">
          <div className="org">{organization?.name ?? 'Water District'}</div>
          {organization?.address && <div className="addr">{organization.address}</div>}
        </div>
        <div className="wop-title">WORK ORDER</div>
        <div className="wop-no">No. {wo.woNumber}</div>

        <div className="wop-row">
          <div className="wop-f"><span className="l">Task:</span><span className="v">{WO_TYPE_LABELS[wo.type as WorkOrderType] ?? wo.type}</span></div>
          <div className="wop-f"><span className="l">Nature:</span><span className="v">{WO_NATURE_LABELS[wo.nature]}</span></div>
          <div className="wop-f"><span className="l">Priority:</span><span className="v">{WO_PRIORITY_LABELS[wo.priority]}</span></div>
        </div>
        <div className="wop-row">
          <div className="wop-f"><span className="l">Customer:</span><span className="v">{customer}</span></div>
          <div className="wop-f"><span className="l">Date:</span><span className="v">{fmtDate(wo.scheduledDate) || fmtDate(wo.createdAt)}</span></div>
        </div>
        <div className="wop-row">
          <div className="wop-f"><span className="l">Location:</span><span className="v">{wo.location ?? ''}</span></div>
        </div>
        <div className="wop-row">
          <div className="wop-f"><span className="l">Title:</span><span className="v">{wo.title}</span></div>
        </div>

        <div className="wop-sec">
          <h4>Instructions</h4>
          <div className="wop-box">{wo.instructions || wo.description || ''}</div>
        </div>

        <div className="wop-sec">
          <h4>Crew Assigned</h4>
          <div className="wop-crew">
            <div><strong>Team Leader:</strong> {leaderName}{wo.team?.name ? ` (${wo.team.name})` : ''}</div>
            <ol>
              {members
                .filter((m) => !m.isLeader)
                .map((m) => (
                  <li key={m.id}>
                    {m.personnel?.name}
                    {m.personnel?.designation ? ` — ${m.personnel.designation}` : ''}
                  </li>
                ))}
            </ol>
          </div>
        </div>

        <div className="wop-row">
          <div className="wop-f"><span className="l">Time Left:</span><span className="v">{fmt(wo.timeLeft)}</span></div>
          <div className="wop-f"><span className="l">Time Returned:</span><span className="v">{fmt(wo.timeReturned)}</span></div>
        </div>

        <div className="wop-sec">
          <h4>Tasks Performed</h4>
          <div className="wop-box">{wo.tasksPerformed || ''}</div>
        </div>
        <div className="wop-sec">
          <h4>Issues Encountered / Remarks</h4>
          <div className="wop-box">{[wo.issuesEncountered, wo.remarks].filter(Boolean).join('\n') || ''}</div>
        </div>

        <div className="wop-sigs">
          <div className="wop-sig">
            <div className="line">{leaderName || ' '}</div>
            <div className="role">Team Leader</div>
          </div>
          {wo.customerSignatureRequired && (
            <div className="wop-sig">
              <div className="line">{customer || ' '}</div>
              <div className="role">Customer / Concerned Client</div>
            </div>
          )}
        </div>
      </div>

      <div className="wop-controls">
        <button onClick={() => window.print()} className="wo-btn wo-btn--primary">Print</button>
      </div>
    </div>
  );
}
