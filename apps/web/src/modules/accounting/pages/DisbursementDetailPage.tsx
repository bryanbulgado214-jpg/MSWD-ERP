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

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#667085' }}>{label}</div>
      <div style={{ fontSize: 14 }}>{value}</div>
    </div>
  );
}

/** Read-only view of a single DV, with Edit/Delete/Print actions (Edit/Delete draft-only). */
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
        <h1 style={{ margin: 0 }}>{dv.dvNumber}</h1>
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

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 14,
          margin: '18px 0',
        }}
      >
        <Field label="Status" value={dv.status.replace(/_/g, ' ')} />
        <Field label="Type" value={dv.dvType} />
        <Field label="DV Date" value={new Date(dv.dvDate).toLocaleDateString('en-PH')} />
        <Field label="Payee" value={payee} />
        <Field label="Net Amount" value={formatPeso(dv.netAmount)} />
        <Field label="Bank" value={dv.bankName ?? '—'} />
        {dv.checkNumber && <Field label="Check #" value={dv.checkNumber} />}
        {dv.payeeTin && <Field label="Payee TIN" value={dv.payeeTin} />}
      </div>

      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#667085' }}>Particulars</div>
        <div style={{ fontSize: 14 }}>{dv.particulars}</div>
      </div>

      {dv.journalEntry && (
        <div style={{ overflowX: 'auto' }}>
          <h2 style={{ fontSize: 15, marginBottom: 8 }}>
            Accounting Entry — {dv.journalEntry.jevNumber} ({dv.journalEntry.status})
          </h2>
          <table className="acct-table">
            <thead>
              <tr>
                <th>Account</th>
                <th>Description</th>
                <th className="acct-text-right">Debit</th>
                <th className="acct-text-right">Credit</th>
              </tr>
            </thead>
            <tbody>
              {dv.journalEntry.lines.map((l, i) => (
                <tr key={i}>
                  <td>
                    <span className="acct-text-mono">{l.chartOfAccount.accountCode}</span>{' '}
                    {l.chartOfAccount.name}
                  </td>
                  <td>{l.description ?? '—'}</td>
                  <td className="acct-text-right acct-text-mono">{formatPeso(l.debitAmount)}</td>
                  <td className="acct-text-right acct-text-mono">{formatPeso(l.creditAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
