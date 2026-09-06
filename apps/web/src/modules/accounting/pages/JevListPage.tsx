import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { useAuth } from '../../../app/auth';
import { AccountingApiError, deleteJev, getJevList } from '../api';
import { compareDocNumber, sortArrow, type SortDir } from '../sort-utils';
import type { JevListItem } from '../types';

import { AccountingSubNav } from './AccountingSubNav';
import './accounting.css';

const PenIcon = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
  </svg>
);
const TrashIcon = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M3 6h18" />
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <line x1="10" y1="11" x2="10" y2="17" />
    <line x1="14" y1="11" x2="14" y2="17" />
  </svg>
);

const sortBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  font: 'inherit',
  fontWeight: 'inherit',
  color: 'inherit',
  cursor: 'pointer',
  display: 'inline-flex',
  gap: 4,
  alignItems: 'center',
};

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; data: JevListItem[] };

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
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  // Entries are back-entered out of order, so sort by the manual JEV number
  // (read numerically) or by date. Default: JEV number, earliest first.
  const [sortKey, setSortKey] = useState<'jevNumber' | 'jevDate'>('jevNumber');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const toggleSort = (key: 'jevNumber' | 'jevDate') => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  };
  const compareJev = (a: JevListItem, b: JevListItem) => {
    const c =
      sortKey === 'jevNumber'
        ? compareDocNumber(a.jevNumber, b.jevNumber)
        : new Date(a.jevDate).getTime() - new Date(b.jevDate).getTime();
    return sortDir === 'asc' ? c : -c;
  };
  const [deleting, setDeleting] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  // The accountant may edit or delete any JEV — including a posted one — as long
  // as its accounting period is still open and unlocked. A closed or locked
  // period freezes its books, so no changes are allowed there.
  const canModify = (jev: JevListItem) =>
    canCreate && jev.accountingPeriod.status === 'open' && !jev.accountingPeriod.lockedAt;

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (search) params.set('search', search);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      const data = await getJevList(params.toString());
      setState({ status: 'loaded', data });
    } catch (e) {
      setState({
        status: 'error',
        message: e instanceof AccountingApiError ? e.message : 'Failed to load JEVs.',
      });
    }
  }, [statusFilter, search, dateFrom, dateTo]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDelete(jev: JevListItem) {
    const posted = jev.status === 'posted' || jev.status === 'reversed';
    const msg = posted
      ? `Delete ${jev.jevNumber}? This removes its posting from the ledger. This cannot be undone.`
      : `Delete ${jev.jevNumber}? This cannot be undone.`;
    if (!window.confirm(msg)) return;
    setDeleting(jev.id);
    setActionError('');
    try {
      await deleteJev(jev.id);
      await load();
    } catch (e) {
      setActionError(
        e instanceof AccountingApiError ? e.message : 'Failed to delete the journal entry.',
      );
    } finally {
      setDeleting(null);
    }
  }

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
          placeholder="Search JEV#, particulars, or amount..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span className="acct-daterange">
          <span className="acct-daterange__label">Date</span>
          <input
            type="date"
            value={dateFrom}
            max={dateTo || undefined}
            onChange={(e) => setDateFrom(e.target.value)}
            aria-label="JEV date from"
          />
          <span className="acct-daterange__sep">–</span>
          <input
            type="date"
            value={dateTo}
            min={dateFrom || undefined}
            onChange={(e) => setDateTo(e.target.value)}
            aria-label="JEV date to"
          />
          <button
            type="button"
            className="acct-daterange__clear"
            onClick={() => {
              setDateFrom('');
              setDateTo('');
            }}
            disabled={!dateFrom && !dateTo}
          >
            Clear
          </button>
        </span>
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

      {actionError && (
        <div className="acct-error" style={{ marginBottom: 12 }}>
          {actionError}
        </div>
      )}
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
                <th>
                  <button
                    type="button"
                    style={sortBtnStyle}
                    onClick={() => toggleSort('jevNumber')}
                  >
                    JEV # <span aria-hidden>{sortArrow(sortKey === 'jevNumber', sortDir)}</span>
                  </button>
                </th>
                <th>
                  <button type="button" style={sortBtnStyle} onClick={() => toggleSort('jevDate')}>
                    Date <span aria-hidden>{sortArrow(sortKey === 'jevDate', sortDir)}</span>
                  </button>
                </th>
                <th>Particulars</th>
                <th>Status</th>
                <th>Created By</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {[...state.data].sort(compareJev).map((jev) => (
                <tr
                  key={jev.id}
                  className="acct-row--click"
                  onClick={() => navigate(`/accounting/jev/${jev.id}`)}
                >
                  <td className="acct-text-mono">{jev.jevNumber}</td>
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
                  <td>
                    <span className={`acct-badge acct-badge--${jev.status}`}>
                      {STATUS_LABELS[jev.status] || jev.status}
                    </span>
                  </td>
                  <td>{jev.creator?.username || '—'}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      {canModify(jev) && (
                        <>
                          <button
                            type="button"
                            className="acct-icon-btn"
                            onClick={() => navigate(`/accounting/jev/${jev.id}?edit=1`)}
                            title="Edit"
                            aria-label="Edit"
                          >
                            {PenIcon}
                          </button>
                          <button
                            type="button"
                            className="acct-icon-btn acct-icon-btn--danger"
                            onClick={() => handleDelete(jev)}
                            disabled={deleting === jev.id}
                            title="Delete"
                            aria-label="Delete"
                          >
                            {TrashIcon}
                          </button>
                        </>
                      )}
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
