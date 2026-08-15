import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { useAuth } from '../../../app/auth';
import { AccountingApiError, getJevList } from '../api';
import type { JevListItem } from '../types';

import { AccountingSubNav } from './AccountingSubNav';
import './accounting.css';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; data: JevListItem[] };

function formatPeso(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return num.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  for_review: 'For Review',
  approved: 'Approved',
  posted: 'Posted',
  voided: 'Voided',
  reversed: 'Reversed',
};

export default function JevListPage() {
  const { permissions } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const canCreate = permissions.has('accounting.jev.create');

  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') ?? '');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (search) params.set('search', search);
      const data = await getJevList(params.toString());
      setState({ status: 'loaded', data });
    } catch (e) {
      setState({
        status: 'error',
        message: e instanceof AccountingApiError ? e.message : 'Failed to load JEVs.',
      });
    }
  }, [statusFilter, search]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="acct-page">
      <AccountingSubNav />
      <h1>Journal Entry Vouchers</h1>

      <div className="acct-toolbar">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="for_review">For Review</option>
          <option value="approved">Approved</option>
          <option value="posted">Posted</option>
          <option value="reversed">Reversed</option>
          <option value="voided">Voided</option>
        </select>
        <input
          type="text"
          placeholder="Search JEV# or particulars..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {canCreate && (
          <button
            type="button"
            className="acct-btn acct-btn--primary"
            onClick={() => navigate('/accounting/jev/new')}
          >
            + New JEV
          </button>
        )}
      </div>

      {state.status === 'loading' && <div className="acct-empty">Loading journal entries...</div>}
      {state.status === 'error' && <div className="acct-error">{state.message}</div>}
      {state.status === 'loaded' && state.data.length === 0 && (
        <div className="acct-empty">No journal entry vouchers found.</div>
      )}
      {state.status === 'loaded' && state.data.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="acct-table">
            <thead>
              <tr>
                <th>JEV #</th>
                <th>Date</th>
                <th>Particulars</th>
                <th>Period</th>
                <th>Debit</th>
                <th>Credit</th>
                <th>Status</th>
                <th>Created By</th>
              </tr>
            </thead>
            <tbody>
              {state.data.map((jev) => (
                <tr key={jev.id}>
                  <td>
                    <Link to={`/accounting/jev/${jev.id}`} className="acct-table__link">
                      {jev.jevNumber}
                    </Link>
                  </td>
                  <td>{new Date(jev.jevDate).toLocaleDateString('en-PH')}</td>
                  <td
                    style={{
                      maxWidth: 300,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {jev.particulars}
                  </td>
                  <td>{jev.accountingPeriod.name}</td>
                  <td className="acct-text-right acct-text-mono">{formatPeso(jev.totalDebit)}</td>
                  <td className="acct-text-right acct-text-mono">{formatPeso(jev.totalCredit)}</td>
                  <td>
                    <span className={`acct-badge acct-badge--${jev.status}`}>
                      {STATUS_LABELS[jev.status] || jev.status}
                    </span>
                  </td>
                  <td>{jev.creator?.username || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
