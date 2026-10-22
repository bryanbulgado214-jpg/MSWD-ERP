import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { useAuth } from '../../../app/auth';
import { signatoryFor } from '../../../app/signatories';
import { getWorkOrder } from '../api';
import { type WorkOrder } from '../types';

function fmtDateTime(s: string | null): string {
  return s ? new Date(s).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : '';
}
function fmtDate(s: string | null): string {
  return s ? new Date(s).toLocaleDateString('en-PH', { dateStyle: 'long' }) : '';
}

export default function WorkOrderPrintPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
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

  // Assigned personnel, numbered 1-6 on the form: the leader first, then the
  // other members, across every crew on the order.
  const personnelNames: string[] = [];
  if (wo.crews && wo.crews.length) {
    for (const c of wo.crews) {
      if (c.teamLeader?.name) personnelNames.push(c.teamLeader.name);
      for (const m of c.members.filter((x) => !x.isLeader)) {
        if (m.personnel?.name) personnelNames.push(m.personnel.name);
      }
    }
  } else {
    if (leaderName) personnelNames.push(leaderName);
    for (const m of members.filter((x) => !x.isLeader)) {
      if (m.personnel?.name) personnelNames.push(m.personnel.name);
    }
  }
  const slot = (i: number) => personnelNames[i] ?? '';

  // PRIORITY: the paper form offers only Urgent / Regular.
  const isUrgent = wo.priority === 'urgent';
  // STATUS: In Progress / Completed / On Hold.
  const isCompleted = wo.status === 'completed' || wo.status === 'verified';
  const isOnHold = wo.status === 'cancelled';
  // "In Progress" shows only once the crew is dispatched (time left entered);
  // a merely-assigned order is still pending, so no status box is ticked yet.
  const isInProgress = wo.status === 'in_progress';

  const actionTaken = wo.tasksPerformed || '';
  const remarksText = [wo.issuesEncountered, wo.remarks].filter(Boolean).join('\n');
  const woDate = fmtDate(wo.scheduledDate) || fmtDate(wo.createdAt);
  const dateResolved = fmtDate(wo.completedAt) || fmtDate(wo.verifiedAt);

  // "Approved by": an admin-configured signatory if set, else the section head
  // who assigned the crew (or created the order). Never the raw username.
  const approvedSig = signatoryFor(organization?.signatories, 'workOrder', 'approvedBy');
  const approverName = approvedSig?.name || wo.crewAssigner?.fullName || wo.creator?.fullName || '';
  const approverRole =
    approvedSig?.title ||
    (wo.nature === 'technical' ? 'Technical Services Section Head' : 'Commercial Services Section Head');

  const chk = (on: boolean) => (on ? '☒' : '☐'); // ☒ / ☐

  return (
    <div className="wop">
      <style>{`
        .wop { background: #fff; }
        .wop * { box-sizing: border-box; }
        .wop-sheet {
          width: 8.5in; min-height: 13in; margin: 0 auto; padding: 0.5in 0.6in;
          font-family: 'Times New Roman', Times, serif; color: #000; font-size: 12pt;
          -webkit-print-color-adjust: exact; print-color-adjust: exact;
        }
        /* Letterhead */
        .wop-head { display: flex; align-items: center; gap: 12px; margin-bottom: 4px; }
        .wop-head img { height: 58px; width: 58px; object-fit: contain; }
        .wop-head .ht { line-height: 1.15; }
        .wop-head .org { font-size: 17pt; font-weight: bold; text-transform: uppercase; letter-spacing: 0.2px; }
        .wop-head .addr, .wop-head .tel { font-size: 10pt; }

        .wop-title { text-align: center; font-size: 15pt; font-weight: bold; letter-spacing: 1px; margin: 10px 0 2px; }
        .wop-no { text-align: center; font-size: 12pt; margin-bottom: 12px; }
        .wop-no .u { display: inline-block; min-width: 210px; border-bottom: 1px solid #000; text-align: center; font-weight: bold; }

        /* Single-line label + value rows */
        .wop-f { display: flex; align-items: flex-end; gap: 6px; margin-bottom: 5px; font-size: 11.5pt; }
        .wop-f .l { font-weight: bold; white-space: nowrap; }
        .wop-f .v { flex: 1; border-bottom: 1px solid #000; min-height: 17px; padding: 0 3px; }
        .wop-two { display: flex; gap: 22px; }
        .wop-two > .wop-f { flex: 1; }

        .wop-prio { font-size: 11.5pt; margin: 2px 0 8px; }
        .wop-prio .l { font-weight: bold; }
        .wop-prio .opt { margin-left: 14px; }

        /* The main bordered box */
        .wop-box { border: 1px solid #000; }
        .wop-seg { padding: 5px 8px; border-bottom: 1px solid #000; }
        .wop-seg:last-child { border-bottom: none; }
        .wop-seg .h { font-weight: bold; font-size: 11pt; text-transform: uppercase; }
        .wop-ruled {
          margin-top: 2px; line-height: 24px; white-space: pre-wrap; word-break: break-word; font-size: 11.5pt;
          background-image: repeating-linear-gradient(transparent, transparent 23px, #000 23px, #000 24px);
        }

        .wop-pers { display: flex; gap: 26px; margin-top: 4px; }
        .wop-pers ol { list-style: none; margin: 0; padding: 0; flex: 1; }
        .wop-pers li { display: flex; align-items: flex-end; gap: 6px; margin-bottom: 4px; font-size: 11.5pt; }
        .wop-pers li .n { font-weight: bold; }
        .wop-pers li .v { flex: 1; border-bottom: 1px solid #000; min-height: 17px; padding: 0 3px; }

        .wop-time { display: flex; gap: 22px; }
        .wop-time > .wop-f { flex: 1; margin-bottom: 0; }

        /* Below the box */
        .wop-recv { display: flex; gap: 22px; margin-top: 10px; }
        .wop-recv > .wop-f { flex: 1; margin-bottom: 0; }
        .wop-status { font-size: 11.5pt; margin: 10px 0 6px; }
        .wop-status .l { font-weight: bold; }
        .wop-status .opt { margin-left: 16px; }
        .wop-resolved { max-width: 60%; }

        .wop-approve { margin-top: 18px; text-align: right; font-size: 11.5pt; }
        .wop-sigs { display: flex; justify-content: space-between; align-items: flex-end; gap: 40px; margin-top: 30px; }
        .wop-sig { width: 46%; text-align: center; font-size: 11pt; }
        .wop-sig .line { border-top: 1px solid #000; padding-top: 3px; font-weight: bold; min-height: 20px; }
        .wop-sig .role { font-size: 10pt; }

        .wop-controls { display: flex; justify-content: center; gap: 10px; padding: 16px; }
        @media print {
          .wop-controls { display: none; }
          .wop-sheet { margin: 0; }
        }
      `}</style>

      <div className="wop-sheet">
        {/* Letterhead */}
        <div className="wop-head">
          {organization?.logoUrl && <img src={organization.logoUrl} alt="" />}
          <div className="ht">
            <div className="org">{organization?.name ?? 'Water District'}</div>
            {organization?.address && <div className="addr">{organization.address}</div>}
            {organization?.contact && <div className="tel">{organization.contact}</div>}
          </div>
        </div>

        <div className="wop-title">WORK ORDER</div>
        <div className="wop-no">No.: <span className="u">{wo.woNumber}</span></div>

        <div className="wop-f"><span className="l">Date:</span><span className="v">{woDate}</span></div>
        <div className="wop-f"><span className="l">Customer/Complainant:</span><span className="v">{customer}</span></div>
        <div className="wop-f"><span className="l">Contact Number:</span><span className="v">{wo.contactNumber ?? ''}</span></div>
        <div className="wop-f"><span className="l">Location:</span><span className="v">{wo.location ?? ''}</span></div>
        <div className="wop-prio">
          <span className="l">PRIORITY:</span>
          <span className="opt">{chk(isUrgent)} Urgent</span>
          <span className="opt">{chk(!isUrgent)} Regular</span>
        </div>

        {/* Main bordered box */}
        <div className="wop-box">
          <div className="wop-seg">
            <div className="h">Details/Nature of Complaint/Concern:</div>
            <div className="wop-ruled" style={{ minHeight: 120 }}>{wo.title}</div>
          </div>

          <div className="wop-seg">
            <div className="h">Assigned Personnel:</div>
            <div className="wop-pers">
              <ol>
                <li><span className="n">1.</span><span className="v">{slot(0)}</span></li>
                <li><span className="n">2.</span><span className="v">{slot(1)}</span></li>
                <li><span className="n">3.</span><span className="v">{slot(2)}</span></li>
              </ol>
              <ol>
                <li><span className="n">4.</span><span className="v">{slot(3)}</span></li>
                <li><span className="n">5.</span><span className="v">{slot(4)}</span></li>
                <li><span className="n">6.</span><span className="v">{slot(5)}</span></li>
              </ol>
            </div>
          </div>

          <div className="wop-seg">
            <div className="h">Detailed Instructions:</div>
            <div className="wop-ruled" style={{ minHeight: 72 }}>{wo.instructions ?? ''}</div>
          </div>

          <div className="wop-seg">
            <div className="h">Action Taken:</div>
            <div className="wop-ruled" style={{ minHeight: 96 }}>{actionTaken}</div>
          </div>

          <div className="wop-seg">
            <div className="h">Remarks:</div>
            <div className="wop-ruled" style={{ minHeight: 48 }}>{remarksText}</div>
          </div>

          {/* Time Left is filled by the field team and keyed in by dispatch before
              they leave; Time Returned is logged when they report back. */}
          <div className="wop-seg">
            <div className="wop-time">
              <div className="wop-f"><span className="l">Time Left:</span><span className="v">{fmtDateTime(wo.timeLeft)}</span></div>
              <div className="wop-f"><span className="l">Time Returned:</span><span className="v">{fmtDateTime(wo.timeReturned)}</span></div>
            </div>
          </div>
        </div>

        {/* Received by (team leader) — moved below the box */}
        <div className="wop-recv">
          <div className="wop-f"><span className="l">Received by:</span><span className="v">{leaderName}</span></div>
          <div className="wop-f"><span className="l">Date and Time:</span><span className="v">{fmtDateTime(wo.leaderReceivedAt)}</span></div>
        </div>

        <div className="wop-status">
          <span className="l">STATUS:</span>
          <span className="opt">{chk(isInProgress)} In Progress</span>
          <span className="opt">{chk(isCompleted)} Completed</span>
          <span className="opt">{chk(isOnHold)} On Hold</span>
        </div>

        <div className="wop-f wop-resolved"><span className="l">Date Resolved:</span><span className="v">{dateResolved}</span></div>

        <div className="wop-approve">Approved by:</div>
        <div className="wop-sigs">
          <div className="wop-sig">
            <div className="line">{leaderName || ' '}</div>
            <div className="role">TEAM LEADER</div>
          </div>
          <div className="wop-sig">
            <div className="line">{approverName || ' '}</div>
            <div className="role">{approverRole}</div>
          </div>
        </div>
      </div>

      <div className="wop-controls">
        <button onClick={() => navigate(`/work-orders/${id}`)} className="wo-btn">&larr; Back</button>
        <button onClick={() => window.print()} className="wo-btn wo-btn--primary">Print</button>
      </div>
    </div>
  );
}
