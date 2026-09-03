import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { useAuth } from '../../../app/auth';
import { AccountingApiError, deleteDisbursement, getDisbursements, postDisbursement } from '../api';
import { amountSearchTokens, matchesQuery } from '../search';
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

const STATUS_LABELS: Record<string, string> = {
  // DV lifecycle (accountant / procurement side)
  draft: 'Draft',
  for_certification: 'For Certification',
  certified: 'Certified',
  for_approval: 'For Approval',
  approved: 'Approved',
  released: 'Released',
  cancelled: 'Cancelled',
  // Check lifecycle (cashier side) — shown once a check has been issued so the
  // DV register mirrors the cashier's Check Register.
  pending: 'Pending (for printing)',
  assigned: 'Assigned',
  printed: 'Printed',
  cleared: 'Cleared',
  stale_dated: 'Stale-dated',
  spoiled: 'Spoiled',
  voided: 'Voided',
};

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
  const [posting, setPosting] = useState<string | null>(null);
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

  async function handleDelete(dv: DisbursementSummary) {
    if (!window.confirm(`Delete draft ${dv.dvNumber}? This cannot be undone.`)) return;
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
                <th>DV #</th>
                <th>Date</th>
                <th>Payee</th>
                <th>Particulars</th>
                <th>Net Amount</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {state.data
                .filter((dv) => matchesSearch(dv, search))
                .map((dv) => (
                  <tr key={dv.id}>
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
                    <td>
                      <span className="acct-badge">
                        {STATUS_LABELS[effectiveStatus(dv)] ?? effectiveStatus(dv)}
                      </span>
                      {dv.checkStatusDate && (
                        <span style={{ color: '#667085', fontSize: 12, marginLeft: 6 }}>
                          on {new Date(dv.checkStatusDate).toLocaleDateString('en-PH')}
                        </span>
                      )}
                    </td>
                    <td>
                      <div
                        style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}
                      >
                        <Link
                          to={`/accounting/disbursements/${dv.id}`}
                          className="acct-table__link"
                        >
                          View
                        </Link>
                        {dv.status === 'draft' && canCreate && (
                          <Link
                            to={`/accounting/disbursements/${dv.id}/edit`}
                            className="acct-table__link"
                          >
                            Edit
                          </Link>
                        )}
                        <Link
                          to={`/accounting/disbursements/${dv.id}/print`}
                          className="acct-table__link"
                        >
                          Print
                        </Link>
                        {parseFloat(dv.taxAmount) > 0 && (
                          <Link
                            to={`/accounting/disbursements/${dv.id}/bir-2307`}
                            className="acct-table__link"
                            title="Certificate of Creditable Tax Withheld at Source"
                          >
                            2307
                          </Link>
                        )}
                        {dv.status === 'draft' && canPost && (
                          <button
                            type="button"
                            className="acct-btn acct-btn--sm"
                            disabled={posting === dv.id}
                            onClick={() => handlePost(dv.id)}
                          >
                            {posting === dv.id ? 'Posting…' : 'Post'}
                          </button>
                        )}
                        {dv.status === 'draft' && canCreate && (
                          <button
                            type="button"
                            onClick={() => handleDelete(dv)}
                            disabled={deleting === dv.id}
                            style={{
                              color: '#b42318',
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              padding: 0,
                              font: 'inherit',
                              textDecoration: 'underline',
                            }}
                          >
                            {deleting === dv.id ? 'Deleting…' : 'Delete'}
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
