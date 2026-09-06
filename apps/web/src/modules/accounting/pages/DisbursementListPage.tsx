import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { useAuth } from '../../../app/auth';
import { AccountingApiError, deleteDisbursement, getDisbursements } from '../api';
import { amountSearchTokens, matchesQuery } from '../search';
import { compareDocNumber, sortArrow, type SortDir } from '../sort-utils';
import { statusLabel } from '../status-format';
import type { DisbursementSummary } from '../types';

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
  | { status: 'loaded'; data: DisbursementSummary[] };

function formatPeso(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return num.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
}

/**
 * Once a check has been issued for a DV, its status (the cashier's payment
 * lifecycle: pending → printed → released → cleared) is what both the cashier
 * and the accountant should see. Fall back to the DV's own status before any
 * check exists.
 */
function effectiveStatus(dv: DisbursementSummary): string {
  return dv.checkStatus ?? dv.status;
}

function matchesSearch(dv: DisbursementSummary, q: string): boolean {
  const hay = [
    dv.dvNumber,
    dv.supplier?.name ?? dv.payeeName ?? '',
    dv.particulars,
    amountSearchTokens(dv.grossAmount, dv.taxAmount, dv.netAmount),
  ].join(' ');
  return matchesQuery(hay, q);
}

export default function DisbursementListPage() {
  const { permissions } = useAuth();
  const navigate = useNavigate();
  const canCreate = permissions.has('accounting.dv.create');
  const canPost = permissions.has('accounting.dv.post');
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  // Back-entered out of order — sort by the manual DV number (read numerically)
  // or by date. Default: DV number, earliest first.
  const [sortKey, setSortKey] = useState<'dvNumber' | 'dvDate'>('dvNumber');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const toggleSort = (key: 'dvNumber' | 'dvDate') => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  };
  const compareDv = (a: DisbursementSummary, b: DisbursementSummary) => {
    const c =
      sortKey === 'dvNumber'
        ? compareDocNumber(a.dvNumber, b.dvNumber)
        : new Date(a.dvDate).getTime() - new Date(b.dvDate).getTime();
    return sortDir === 'asc' ? c : -c;
  };
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      const data = await getDisbursements(params.toString());
      setState({ status: 'loaded', data });
    } catch (e) {
      setState({
        status: 'error',
        message:
          e instanceof AccountingApiError ? e.message : 'Failed to load disbursement vouchers.',
      });
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDelete(dv: DisbursementSummary) {
    const posted = dv.status !== 'draft';
    const msg = posted
      ? `Delete ${dv.dvNumber}? This removes its GL entry and voids the check. This cannot be undone.`
      : `Delete draft ${dv.dvNumber}? This cannot be undone.`;
    if (!window.confirm(msg)) return;
    setDeleting(dv.id);
    setError('');
    try {
      await deleteDisbursement(dv.id);
      await load();
    } catch (e) {
      setError(
        e instanceof AccountingApiError ? e.message : 'Failed to delete the disbursement voucher.',
      );
    } finally {
      setDeleting(null);
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
        <input
          type="search"
          placeholder="Search DV #, payee, particulars, or amount…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ minWidth: 260, flex: '1 1 260px' }}
          aria-label="Search disbursement vouchers"
        />
        <span className="acct-daterange">
          <span className="acct-daterange__label">Date</span>
          <input
            type="date"
            value={dateFrom}
            max={dateTo || undefined}
            onChange={(e) => setDateFrom(e.target.value)}
            aria-label="DV date from"
          />
          <span className="acct-daterange__sep">–</span>
          <input
            type="date"
            value={dateTo}
            min={dateFrom || undefined}
            onChange={(e) => setDateTo(e.target.value)}
            aria-label="DV date to"
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
        <button
          type="button"
          className="acct-btn"
          onClick={() => navigate('/accounting/disbursements/bir-2307')}
          title="Disbursement vouchers with withholding tax — view & print BIR Form 2307"
        >
          📄 BIR Form 2307
        </button>
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
                <th>
                  <button type="button" style={sortBtnStyle} onClick={() => toggleSort('dvNumber')}>
                    DV # <span aria-hidden>{sortArrow(sortKey === 'dvNumber', sortDir)}</span>
                  </button>
                </th>
                <th>
                  <button type="button" style={sortBtnStyle} onClick={() => toggleSort('dvDate')}>
                    Date <span aria-hidden>{sortArrow(sortKey === 'dvDate', sortDir)}</span>
                  </button>
                </th>
                <th>Payee</th>
                <th>Particulars</th>
                <th>Net Amount</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {state.data
                .filter((dv) => matchesSearch(dv, search))
                .sort(compareDv)
                .map((dv) => (
                  <tr
                    key={dv.id}
                    className="acct-row--click"
                    onClick={() => navigate(`/accounting/disbursements/${dv.id}`)}
                  >
                    <td className="acct-text-mono">{dv.dvNumber}</td>
                    <td>{new Date(dv.dvDate).toLocaleDateString('en-PH')}</td>
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
                    <td style={{ textAlign: 'center' }}>
                      <div
                        style={{
                          display: 'inline-flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: 3,
                        }}
                      >
                        <span className="acct-badge">{statusLabel(effectiveStatus(dv))}</span>
                        {dv.checkStatusDate && (
                          <span style={{ color: '#667085', fontSize: 12 }}>
                            {new Date(dv.checkStatusDate).toLocaleDateString('en-PH')}
                          </span>
                        )}
                      </div>
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        {/* Drafts are edited by data-entry; a posted voucher's edit
                            re-posts its GL entry, so it needs the post permission. */}
                        {dv.status !== 'cancelled' &&
                          (dv.status === 'draft' ? canCreate : canPost) && (
                            <Link
                              to={`/accounting/disbursements/${dv.id}/edit`}
                              className="acct-icon-btn"
                              title="Edit"
                              aria-label="Edit"
                            >
                              {PenIcon}
                            </Link>
                          )}
                        {((dv.status === 'draft' && canCreate) ||
                          (canPost && dv.checkStatus !== 'cleared')) && (
                          <button
                            type="button"
                            className="acct-icon-btn acct-icon-btn--danger"
                            onClick={() => handleDelete(dv)}
                            disabled={deleting === dv.id}
                            title="Delete"
                            aria-label="Delete"
                          >
                            {TrashIcon}
                          </button>
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
