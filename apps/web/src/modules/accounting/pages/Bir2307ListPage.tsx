import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { AccountingApiError, getDisbursements } from '../api';
import { amountSearchTokens, matchesQuery } from '../search';
import type { DisbursementSummary } from '../types';

import { AccountingSubNav } from './AccountingSubNav';
import './accounting.css';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; data: DisbursementSummary[] };

function peso(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return num.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
}

/**
 * Register of disbursement vouchers that withheld a creditable tax — each row
 * opens the prefilled, editable BIR Form 2307 (Certificate of Creditable Tax
 * Withheld at Source) for viewing and printing.
 */
export default function Bir2307ListPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [search, setSearch] = useState('');

  useEffect(() => {
    getDisbursements('withholding=true')
      .then((data) => setState({ status: 'loaded', data }))
      .catch((e) =>
        setState({
          status: 'error',
          message: e instanceof AccountingApiError ? e.message : 'Failed to load.',
        }),
      );
  }, []);

  const rows =
    state.status === 'loaded'
      ? state.data.filter((dv) =>
          matchesQuery(
            [
              dv.dvNumber,
              dv.payeeName ?? dv.supplier?.name ?? '',
              dv.particulars,
              amountSearchTokens(dv.grossAmount, dv.taxAmount, dv.netAmount),
            ].join(' '),
            search,
          ),
        )
      : [];

  return (
    <div className="acct-page">
      <AccountingSubNav />
      <h1>BIR Form 2307 — Certificates of Tax Withheld</h1>
      <p style={{ color: '#667085', fontSize: 13, marginTop: -6, marginBottom: 18, maxWidth: 760 }}>
        Every disbursement voucher that withheld a creditable tax. Open one to view and print its
        BIR Form 2307 (Certificate of Creditable Tax Withheld at Source) — the fields are prefilled
        from the voucher and remain editable before printing.
      </p>

      <div className="acct-toolbar">
        <input
          type="search"
          placeholder="Search DV #, payee, particulars, or amount…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ minWidth: 260, flex: '1 1 260px' }}
          aria-label="Search"
        />
        <Link to="/accounting/disbursements" className="acct-btn">
          ← All Disbursement Vouchers
        </Link>
      </div>

      {state.status === 'loading' && <div className="acct-empty">Loading…</div>}
      {state.status === 'error' && <div className="acct-error">{state.message}</div>}
      {state.status === 'loaded' && rows.length === 0 && (
        <div className="acct-empty">No disbursement vouchers with withholding tax yet.</div>
      )}
      {state.status === 'loaded' && rows.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="acct-table">
            <thead>
              <tr>
                <th>DV #</th>
                <th>Date</th>
                <th>Payee</th>
                <th>Particulars</th>
                <th className="acct-text-right">Income Payment</th>
                <th className="acct-text-right">Tax Withheld</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((dv) => (
                <tr key={dv.id}>
                  <td className="acct-text-mono">{dv.dvNumber}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {new Date(dv.dvDate).toLocaleDateString('en-PH')}
                  </td>
                  <td>{dv.payeeName ?? dv.supplier?.name ?? '—'}</td>
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
                  <td className="acct-text-right acct-text-mono">{peso(dv.grossAmount)}</td>
                  <td className="acct-text-right acct-text-mono" style={{ color: '#b42318' }}>
                    {peso(dv.taxAmount)}
                  </td>
                  <td>
                    <Link
                      to={`/accounting/disbursements/${dv.id}/bir-2307`}
                      className="acct-btn acct-btn--sm acct-btn--primary"
                    >
                      BIR Form 2307
                    </Link>
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
