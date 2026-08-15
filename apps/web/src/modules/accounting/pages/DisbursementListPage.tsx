import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { useAuth } from '../../../app/auth';
import { AccountingApiError, getDisbursements, postDisbursement } from '../api';
import type { DisbursementSummary } from '../types';

import { AccountingSubNav } from './AccountingSubNav';
import './accounting.css';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; data: DisbursementSummary[] };

function formatPeso(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return num.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
}

const DV_TYPE_LABELS: Record<string, string> = {
  procurement: 'Procurement',
  travel: 'Travel',
  reimbursement: 'Reimbursement',
  payroll: 'Payroll',
  utility: 'Utility',
  other: 'Other',
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

export default function DisbursementListPage() {
  const { permissions } = useAuth();
  const navigate = useNavigate();
  const canCreate = permissions.has('accounting.dv.create');
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [typeFilter, setTypeFilter] = useState('');
  const [posting, setPosting] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (typeFilter) params.set('dvType', typeFilter);
      const data = await getDisbursements(params.toString());
      setState({ status: 'loaded', data });
    } catch (e) {
      setState({
        status: 'error',
        message:
          e instanceof AccountingApiError ? e.message : 'Failed to load disbursement vouchers.',
      });
    }
  }, [typeFilter]);

  useEffect(() => {
    load();
  }, [load]);

  async function handlePost(id: string) {
    setPosting(id);
    setError('');
    try {
      await postDisbursement(id);
      await load();
    } catch (e) {
      setError(
        e instanceof AccountingApiError ? e.message : 'Failed to post the disbursement voucher.',
      );
    } finally {
      setPosting(null);
    }
  }

  return (
    <div className="acct-page">
      <AccountingSubNav />
      <h1>Disbursement Vouchers</h1>
      <p style={{ color: '#667085', fontSize: 13, marginTop: -6, marginBottom: 18, maxWidth: 720 }}>
        Every disbursement of funds — procurement payments, travel, reimbursements, payroll,
        utilities and more. Procurement DVs flow in from the Procurement module; non-procurement DVs
        are prepared here.
      </p>

      <div className="acct-toolbar">
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">All Types</option>
          <option value="procurement">Procurement</option>
          <option value="travel">Travel</option>
          <option value="reimbursement">Reimbursement</option>
          <option value="payroll">Payroll</option>
          <option value="utility">Utility</option>
          <option value="other">Other</option>
        </select>
        {canCreate && (
          <button
            type="button"
            className="acct-btn acct-btn--primary"
            onClick={() => navigate('/accounting/disbursements/new')}
          >
            + New Disbursement Voucher
          </button>
        )}
      </div>

      {error && (
        <div className="acct-error" style={{ marginBottom: 12 }}>
          {error}
        </div>
      )}
      {state.status === 'loading' && (
        <div className="acct-empty">Loading disbursement vouchers...</div>
      )}
      {state.status === 'error' && <div className="acct-error">{state.message}</div>}
      {state.status === 'loaded' && state.data.length === 0 && (
        <div className="acct-empty">No disbursement vouchers yet.</div>
      )}
      {state.status === 'loaded' && state.data.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="acct-table">
            <thead>
              <tr>
                <th>DV #</th>
                <th>Date</th>
                <th>Type</th>
                <th>Payee</th>
                <th>Particulars</th>
                <th>Net Amount</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {state.data.map((dv) => (
                <tr key={dv.id}>
                  <td className="acct-text-mono">{dv.dvNumber}</td>
                  <td>{new Date(dv.dvDate).toLocaleDateString('en-PH')}</td>
                  <td>{DV_TYPE_LABELS[dv.dvType] ?? dv.dvType}</td>
                  <td>{dv.supplier?.name ?? dv.payeeName ?? '—'}</td>
                  <td
                    style={{
                      maxWidth: 280,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {dv.particulars}
                  </td>
                  <td className="acct-text-right acct-text-mono">{formatPeso(dv.netAmount)}</td>
                  <td>
                    <span className="acct-badge">{STATUS_LABELS[dv.status] ?? dv.status}</span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      {dv.status === 'draft' && canCreate && (
                        <button
                          type="button"
                          className="acct-btn acct-btn--sm"
                          disabled={posting === dv.id}
                          onClick={() => handlePost(dv.id)}
                        >
                          {posting === dv.id ? 'Posting...' : 'Post'}
                        </button>
                      )}
                      <Link
                        to={`/accounting/disbursements/${dv.id}/print`}
                        className="acct-table__link"
                      >
                        Print
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
