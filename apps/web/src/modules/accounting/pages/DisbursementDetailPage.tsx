import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { useAuth } from '../../../app/auth';
import { AccountingApiError, deleteDisbursement, getDisbursement } from '../api';
import type { DisbursementDetail } from '../types';

import { AccountingSubNav } from './AccountingSubNav';
import './accounting.css';

function formatPeso(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num) || num === 0) return '—';
  return num.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
}
function fmtDate(d: string | null): string {
  return d ? new Date(d).toLocaleDateString('en-PH') : '—';
}

const DV_TYPE_LABELS: Record<string, string> = {
  procurement: 'Procurement',
  travel: 'Travel',
  reimbursement: 'Reimbursement',
  payroll: 'Payroll',
  utility: 'Utility',
  other: 'Other',
};
const PAYMENT_MODE_LABELS: Record<string, string> = {
  check: 'MDS / Commercial Check',
  ada: 'Advice to Debit Account (ADA)',
  others: 'Others',
};
const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  for_certification: 'For Certification',
  certified: 'Certified',
  for_approval: 'For Approval',
  approved: 'Approved',
  released: 'Released',
  cancelled: 'Cancelled',
};

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#667085' }}>{label}</div>
      <div style={{ fontSize: 14 }}>{value}</div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        fontSize: 13,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        color: 'var(--mswd-navy)',
        borderBottom: '2px solid var(--mswd-navy)',
        paddingBottom: 6,
        margin: '26px 0 14px',
      }}
    >
      {children}
    </h2>
  );
}

/** Read-only view of a single DV — the full voucher plus its accounting entry (Box B). */
export default function DisbursementDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { permissions } = useAuth();
  const canCreate = permissions.has('accounting.dv.create');

  const [dv, setDv] = useState<DisbursementDetail | null>(null);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!id) return;
    getDisbursement(id)
      .then(setDv)
      .catch((e) =>
        setError(e instanceof AccountingApiError ? e.message : 'Failed to load the voucher.'),
      );
  }, [id]);

  async function handleDelete() {
    if (!dv) return;
    if (!window.confirm(`Delete draft ${dv.dvNumber}? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await deleteDisbursement(dv.id);
      navigate('/accounting/disbursements');
    } catch (e) {
      setError(e instanceof AccountingApiError ? e.message : 'Failed to delete the voucher.');
      setDeleting(false);
    }
  }

  if (error) {
    return (
      <div className="acct-page">
        <AccountingSubNav />
        <div className="acct-error">{error}</div>
        <Link to="/accounting/disbursements" className="acct-table__link">
          ← Back to register
        </Link>
      </div>
    );
  }
  if (!dv) {
    return (
      <div className="acct-page">
        <AccountingSubNav />
        <div className="acct-empty">Loading…</div>
      </div>
    );
  }

  const isDraft = dv.status === 'draft';
  const payee = dv.supplier?.name ?? dv.payeeName ?? '—';
  const payeeTin = dv.supplier?.tin ?? dv.payeeTin ?? '—';
  const payeeAddress = dv.supplier?.address ?? dv.payeeAddress ?? '—';
  const tax = parseFloat(dv.taxAmount);
  const otherDed = parseFloat(dv.otherDeductions);

  const je = dv.journalEntry;
  const jeLines = je?.lines ?? [];
  const jeTotalDebit = jeLines.reduce((s, l) => s + parseFloat(l.debitAmount), 0);
  const jeTotalCredit = jeLines.reduce((s, l) => s + parseFloat(l.creditAmount), 0);

  return (
    <div className="acct-page">
      <AccountingSubNav />
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <h1 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
          {dv.dvNumber}
          <span className="acct-badge" style={{ fontSize: 12 }}>
            {STATUS_LABELS[dv.status] ?? dv.status.replace(/_/g, ' ')}
          </span>
        </h1>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {isDraft && canCreate && (
            <Link to={`/accounting/disbursements/${dv.id}/edit`} className="acct-btn acct-btn--sm">
              Edit
            </Link>
          )}
          <Link to={`/accounting/disbursements/${dv.id}/print`} className="acct-btn acct-btn--sm">
            Print
          </Link>
          {isDraft && canCreate && (
            <button
              type="button"
              className="acct-btn acct-btn--sm"
              style={{ color: '#b42318' }}
              disabled={deleting}
              onClick={handleDelete}
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          )}
          <Link to="/accounting/disbursements" className="acct-table__link">
            ← Back
          </Link>
        </div>
      </div>

      {/* ── Voucher details ── */}
      <SectionTitle>Voucher Details</SectionTitle>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 14,
        }}
      >
        <Field label="Type" value={DV_TYPE_LABELS[dv.dvType] ?? dv.dvType} />
        <Field label="DV Date" value={fmtDate(dv.dvDate)} />
        <Field
          label="Mode of Payment"
          value={PAYMENT_MODE_LABELS[dv.paymentMode] ?? dv.paymentMode}
        />
        <Field
          label="Fund Cluster"
          value={dv.fundSource ? `${dv.fundSource.code} — ${dv.fundSource.name}` : '—'}
        />
        <Field
          label="Responsibility Center"
          value={
            dv.responsibilityCenter
              ? `${dv.responsibilityCenter.code} — ${dv.responsibilityCenter.name}`
              : '—'
          }
        />
        <Field label="ORS / BURS No." value={dv.ors?.orsNumber ?? '—'} />
        {dv.accountCode && <Field label="MFO / PAP" value={dv.accountCode} />}
      </div>

      {/* ── Payee ── */}
      <SectionTitle>Payee</SectionTitle>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 14,
        }}
      >
        <Field label="Payee" value={payee} />
        <Field label="TIN / ID No." value={payeeTin} />
        <Field label="Address" value={payeeAddress} />
      </div>

      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#667085' }}>Particulars</div>
        <div style={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>{dv.particulars}</div>
        {(dv.purchaseRequest || dv.purchaseOrder || dv.inspectionReport) && (
          <div style={{ marginTop: 8, fontSize: 12, color: '#667085', display: 'grid', gap: 2 }}>
            {dv.purchaseRequest && (
              <span>
                PR: {dv.purchaseRequest.prNumber} — {dv.purchaseRequest.title}
              </span>
            )}
            {dv.purchaseOrder && <span>PO: {dv.purchaseOrder.poNumber}</span>}
            {dv.inspectionReport && (
              <span>
                IR: {dv.inspectionReport.reportNumber} ({dv.inspectionReport.overallResult})
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Amount ── */}
      <SectionTitle>Amount</SectionTitle>
      <div style={{ overflowX: 'auto' }}>
        <table className="acct-table" style={{ maxWidth: 460 }}>
          <tbody>
            <tr>
              <td>Gross Amount</td>
              <td className="acct-text-right acct-text-mono">{formatPeso(dv.grossAmount)}</td>
            </tr>
            {tax > 0 && (
              <tr>
                <td style={{ color: '#b42318' }}>Less: Withholding Tax</td>
                <td className="acct-text-right acct-text-mono" style={{ color: '#b42318' }}>
                  ({formatPeso(dv.taxAmount)})
                </td>
              </tr>
            )}
            {otherDed > 0 && (
              <tr>
                <td style={{ color: '#b42318' }}>Less: Other Deductions</td>
                <td className="acct-text-right acct-text-mono" style={{ color: '#b42318' }}>
                  ({formatPeso(dv.otherDeductions)})
                </td>
              </tr>
            )}
            <tr style={{ fontWeight: 700 }}>
              <td>Net Amount Due</td>
              <td className="acct-text-right acct-text-mono" style={{ fontSize: 15 }}>
                {formatPeso(dv.netAmount)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── Accounting Entry (Box B) ── */}
      <SectionTitle>
        Accounting Entry
        {je && (
          <span
            style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: '#667085' }}
          >
            {'   '}
            {je.jevNumber} · {STATUS_LABELS[je.status] ?? je.status}
            {je.status !== 'posted' && ' (not yet posted to the ledger)'}
          </span>
        )}
      </SectionTitle>
      {jeLines.length > 0 ? (
        <div style={{ overflowX: 'auto' }}>
          <table className="acct-table">
            <thead>
              <tr>
                <th>Account Title</th>
                <th style={{ width: '16%' }}>UACS Code</th>
                <th>Description</th>
                <th className="acct-text-right" style={{ width: '15%' }}>
                  Debit
                </th>
                <th className="acct-text-right" style={{ width: '15%' }}>
                  Credit
                </th>
              </tr>
            </thead>
            <tbody>
              {jeLines.map((l, i) => (
                <tr key={i}>
                  <td>{l.chartOfAccount.name}</td>
                  <td className="acct-text-mono">{l.chartOfAccount.accountCode}</td>
                  <td style={{ color: '#667085' }}>{l.description ?? '—'}</td>
                  <td className="acct-text-right acct-text-mono">
                    {parseFloat(l.debitAmount) > 0 ? formatPeso(l.debitAmount) : ''}
                  </td>
                  <td className="acct-text-right acct-text-mono">
                    {parseFloat(l.creditAmount) > 0 ? formatPeso(l.creditAmount) : ''}
                  </td>
                </tr>
              ))}
              <tr style={{ fontWeight: 700, borderTop: '2px solid var(--mswd-navy)' }}>
                <td colSpan={3} className="acct-text-right">
                  Total
                </td>
                <td className="acct-text-right acct-text-mono">{formatPeso(jeTotalDebit)}</td>
                <td className="acct-text-right acct-text-mono">{formatPeso(jeTotalCredit)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <div className="acct-empty">
          {dv.status === 'cancelled'
            ? 'This voucher was cancelled — no accounting entry was recorded.'
            : 'The accounting entry is recorded as a journal entry voucher when this DV is released.'}
        </div>
      )}

      {/* ── Certification & Payment ── */}
      <SectionTitle>Certification &amp; Payment</SectionTitle>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 14,
        }}
      >
        <Field
          label="Certified by"
          value={dv.certifier ? `${dv.certifier.username} · ${fmtDate(dv.certifiedAt)}` : '—'}
        />
        <Field
          label="Approved by"
          value={dv.approver ? `${dv.approver.username} · ${fmtDate(dv.approvedAt)}` : '—'}
        />
        <Field
          label="Released by"
          value={dv.releaser ? `${dv.releaser.username} · ${fmtDate(dv.releasedAt)}` : '—'}
        />
        <Field label="Check / ADA No." value={dv.checkNumber ?? '—'} />
        <Field label="Check Date" value={fmtDate(dv.checkDate)} />
        <Field label="Bank Name & Account" value={dv.bankName ?? '—'} />
        <Field label="JEV No." value={je?.jevNumber ?? '—'} />
      </div>
    </div>
  );
}
