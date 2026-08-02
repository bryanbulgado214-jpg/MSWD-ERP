import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '../../../app/auth';
import { AccountingApiError, createChartOfAccount, getChartOfAccounts } from '../api';
import type { ChartOfAccount } from '../types';
import { AccountingSubNav } from './AccountingSubNav';
import './accounting.css';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; data: ChartOfAccount[] };

const ACCOUNT_TYPES = ['', 'asset', 'liability', 'equity', 'revenue', 'expense'] as const;

export default function ChartOfAccountsPage() {
  const { permissions } = useAuth();
  const canManage = permissions.has('accounting.coa.manage');

  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [typeFilter, setTypeFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (typeFilter) params.set('accountType', typeFilter);
      if (search) params.set('search', search);
      params.set('includeInactive', 'true');
      const data = await getChartOfAccounts(params.toString());
      setState({ status: 'loaded', data });
    } catch (e) {
      const msg = e instanceof AccountingApiError ? e.message : 'Failed to load accounts.';
      setState({ status: 'error', message: msg });
    }
  }, [typeFilter, search]);

  useEffect(() => { load(); }, [load]);

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError('');
    const fd = new FormData(e.currentTarget);
    try {
      await createChartOfAccount({
        accountCode: fd.get('accountCode') as string,
        name: fd.get('name') as string,
        accountType: fd.get('accountType') as string,
        normalBalance: fd.get('normalBalance') as string,
        level: Number(fd.get('level')),
        isHeader: fd.get('isHeader') === 'true',
        ...(fd.get('parentAccountId') ? { parentAccountId: fd.get('parentAccountId') as string } : {}),
        ...(fd.get('uacsCode') ? { uacsCode: fd.get('uacsCode') as string } : {}),
      });
      setShowForm(false);
      load();
    } catch (e) {
      setFormError(e instanceof AccountingApiError ? e.message : 'Failed to create account.');
    }
  }

  return (
    <div className="acct-page">
      <AccountingSubNav />
      <h1>Chart of Accounts</h1>

      <div className="acct-toolbar">
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">All Types</option>
          {ACCOUNT_TYPES.filter(Boolean).map((t) => (
            <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Search code or name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {canManage && (
          <button
            type="button"
            className="acct-btn acct-btn--primary"
            onClick={() => setShowForm(!showForm)}
          >
            {showForm ? 'Cancel' : '+ Add Account'}
          </button>
        )}
      </div>

      {showForm && (
        <form className="acct-form" onSubmit={handleCreate}>
          {formError && <div className="acct-error">{formError}</div>}
          <div className="acct-form-row">
            <div className="acct-field">
              <label>Account Code</label>
              <input name="accountCode" required maxLength={30} />
            </div>
            <div className="acct-field">
              <label>Name</label>
              <input name="name" required maxLength={255} />
            </div>
          </div>
          <div className="acct-form-row">
            <div className="acct-field">
              <label>Account Type</label>
              <select name="accountType" required>
                {ACCOUNT_TYPES.filter(Boolean).map((t) => (
                  <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                ))}
              </select>
            </div>
            <div className="acct-field">
              <label>Normal Balance</label>
              <select name="normalBalance" required>
                <option value="debit">Debit</option>
                <option value="credit">Credit</option>
              </select>
            </div>
          </div>
          <div className="acct-form-row">
            <div className="acct-field">
              <label>Level</label>
              <select name="level" required>
                <option value="1">1 - Group</option>
                <option value="2">2 - Major Account</option>
                <option value="3">3 - Sub-Account</option>
              </select>
            </div>
            <div className="acct-field">
              <label>Is Header?</label>
              <select name="isHeader" required>
                <option value="true">Yes (Header / Non-postable)</option>
                <option value="false">No (Postable)</option>
              </select>
            </div>
          </div>
          <div className="acct-form-row">
            <div className="acct-field">
              <label>UACS Code (optional)</label>
              <input name="uacsCode" maxLength={30} />
            </div>
            <div className="acct-field">
              <label>Parent Account ID (optional)</label>
              <input name="parentAccountId" placeholder="UUID of parent" />
            </div>
          </div>
          <div className="acct-form-actions">
            <button type="button" className="acct-btn" onClick={() => setShowForm(false)}>Cancel</button>
            <button type="submit" className="acct-btn acct-btn--primary">Create Account</button>
          </div>
        </form>
      )}

      {state.status === 'loading' && <div className="acct-empty">Loading chart of accounts...</div>}
      {state.status === 'error' && <div className="acct-error">{state.message}</div>}
      {state.status === 'loaded' && state.data.length === 0 && (
        <div className="acct-empty">No accounts found.</div>
      )}
      {state.status === 'loaded' && state.data.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="acct-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Account Name</th>
                <th>Type</th>
                <th>Normal Bal.</th>
                <th>UACS</th>
                <th>Kind</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {state.data.map((acct) => (
                <tr key={acct.id}>
                  <td className="acct-text-mono">
                    <span className={`acct-indent-${acct.level}`}>
                      {acct.accountCode}
                    </span>
                  </td>
                  <td style={{ fontWeight: acct.isHeader ? 700 : 400 }}>{acct.name}</td>
                  <td><span className={`acct-badge acct-badge--${acct.accountType}`}>{acct.accountType}</span></td>
                  <td>{acct.normalBalance}</td>
                  <td className="acct-text-mono">{acct.uacsCode || '—'}</td>
                  <td>
                    <span className={`acct-badge acct-badge--${acct.isHeader ? 'header' : 'postable'}`}>
                      {acct.isHeader ? 'Header' : 'Postable'}
                    </span>
                  </td>
                  <td>
                    <span className={`acct-badge acct-badge--${acct.isActive ? 'active' : 'inactive'}`}>
                      {acct.isActive ? 'Active' : 'Inactive'}
                    </span>
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
