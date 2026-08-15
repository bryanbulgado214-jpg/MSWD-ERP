import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { getChartOfAccounts } from '../../accounting/api';
import type { ChartOfAccount } from '../../accounting/types';

/**
 * Subsidiary Ledgers index — lists postable accounts; each links to its
 * per-account subsidiary ledger (which reuses the existing GL subsidiary view).
 */
export function SubsidiaryLedgersIndexPage() {
  const [accounts, setAccounts] = useState<ChartOfAccount[] | null>(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');

  useEffect(() => {
    getChartOfAccounts()
      .then(setAccounts)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load chart of accounts.'));
  }, []);

  const postable = useMemo(
    () => (accounts ?? []).filter((a) => !a.isHeader && a.isActive),
    [accounts],
  );
  const needle = q.trim().toLowerCase();
  const filtered = needle
    ? postable.filter((a) => `${a.accountCode} ${a.name}`.toLowerCase().includes(needle))
    : postable;

  return (
    <div>
      <h2>Subsidiary Ledgers</h2>
      <p className="reports-subtitle">
        Select an account to view its subsidiary ledger — every posted debit and credit with a
        running balance.
      </p>

      <div className="reports-filters">
        <label htmlFor="sl-search">Find account</label>
        <input
          id="sl-search"
          type="text"
          placeholder="Search by code or name…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{
            padding: '6px 12px',
            border: '1px solid #d1d5db',
            borderRadius: 6,
            fontSize: 13,
            minWidth: 260,
          }}
        />
      </div>

      {error && <div className="reports-error">{error}</div>}
      {!accounts && !error && <div className="reports-loading">Loading…</div>}
      {accounts && filtered.length === 0 && (
        <div className="reports-empty">No postable accounts match “{q}”.</div>
      )}
      {accounts && filtered.length > 0 && (
        <div className="reports-table-wrap">
          <table className="reports-table">
            <thead>
              <tr>
                <th>Account Code</th>
                <th>Account Name</th>
                <th>Type</th>
                <th>Normal Balance</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.id}>
                  <td className="code">{a.accountCode}</td>
                  <td>{a.name}</td>
                  <td style={{ textTransform: 'capitalize' }}>{a.accountType}</td>
                  <td style={{ textTransform: 'capitalize' }}>{a.normalBalance}</td>
                  <td>
                    <Link to={`/reports/subsidiary-ledgers/${a.id}`} className="reports-link">
                      View ledger →
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
