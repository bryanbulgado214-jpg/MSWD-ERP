import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { AccountingSubNav } from './AccountingSubNav';
import './accounting.css';
import { getChecks, getBankAccounts, createCheck, transitionCheck } from '../api';
import type { CheckListItem, BankAccount } from '../types';

function formatPeso(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num) || num === 0) return '—';
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(num);
}

const STATUS_OPTIONS = ['', 'assigned', 'printed', 'released', 'cleared', 'stale_dated', 'spoiled', 'voided'];

type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; data: CheckListItem[] };

export default function CheckRegisterPage() {
  const [state, setState] = useState<LoadState>({ status: 'idle' });
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [filterBank, setFilterBank] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    bankAccountId: '', checkNumber: '', amount: '', checkDate: '', payeeName: '',
  });
  const [formError, setFormError] = useState('');
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    getBankAccounts().then(setBankAccounts);
  }, []);

  const loadChecks = () => {
    setState({ status: 'loading' });
    const params = new URLSearchParams();
    if (filterBank) params.set('bankAccountId', filterBank);
    if (filterStatus) params.set('status', filterStatus);
    if (search) params.set('search', search);
    getChecks(params.toString())
      .then((data) => setState({ status: 'loaded', data }))
      .catch((err) => setState({ status: 'error', message: err.message }));
  };

  useEffect(() => { loadChecks(); }, [filterBank, filterStatus]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadChecks();
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    try {
      await createCheck({
        bankAccountId: formData.bankAccountId,
        checkNumber: formData.checkNumber,
        amount: parseFloat(formData.amount),
        checkDate: formData.checkDate,
        payeeName: formData.payeeName,
      });
      setShowForm(false);
      setFormData({ bankAccountId: '', checkNumber: '', amount: '', checkDate: '', payeeName: '' });
      loadChecks();
    } catch (err: any) {
      setFormError(err.message);
    }
  };

  const handleTransition = async (check: CheckListItem, toStatus: string) => {
    setActionError('');
    let remarks: string | undefined;
    let clearedDate: string | undefined;

    if (toStatus === 'voided') {
      remarks = prompt('Void reason:');
      if (!remarks) return;
    }
    if (toStatus === 'cleared') {
      clearedDate = prompt('Cleared date (YYYY-MM-DD):');
      if (!clearedDate) return;
    }

    try {
      await transitionCheck(check.id, {
        expectedVersion: check.version,
        toStatus,
        ...(remarks ? { remarks } : {}),
        ...(clearedDate ? { clearedDate } : {}),
      });
      loadChecks();
    } catch (err: any) {
      setActionError(err.message);
    }
  };

  const checks = state.status === 'loaded' ? state.data : [];

  const getActions = (check: CheckListItem) => {
    const map: Record<string, string[]> = {
      assigned: ['printed', 'released', 'voided'],
      printed: ['released', 'voided'],
      released: ['cleared', 'voided'],
    };
    return map[check.status] ?? [];
  };

  return (
    <div className="acct-page">
      <AccountingSubNav />
      <h1>Check Register</h1>

      <div className="acct-toolbar">
        <select value={filterBank} onChange={(e) => setFilterBank(e.target.value)}>
          <option value="">All Bank Accounts</option>
          {bankAccounts.map((ba) => (
            <option key={ba.id} value={ba.id}>{ba.bank.code} — {ba.accountName}</option>
          ))}
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s || 'All Statuses'}</option>
          ))}
        </select>
        <form onSubmit={handleSearch} style={{ display: 'contents' }}>
          <input
            type="text" placeholder="Search check# or payee..."
            value={search} onChange={(e) => setSearch(e.target.value)}
          />
        </form>
        <button className="acct-btn acct-btn--primary" onClick={() => setShowForm(!showForm)}>
          + New Check
        </button>
      </div>

      {actionError && <div className="acct-error">{actionError}</div>}

      {showForm && (
        <form className="acct-form" onSubmit={handleCreate}>
          {formError && <div className="acct-error">{formError}</div>}
          <div className="acct-form-row">
            <div className="acct-field">
              <label>Bank Account</label>
              <select value={formData.bankAccountId} onChange={(e) => setFormData({ ...formData, bankAccountId: e.target.value })} required>
                <option value="">Select...</option>
                {bankAccounts.filter((ba) => ba.status === 'active').map((ba) => (
                  <option key={ba.id} value={ba.id}>{ba.bank.code} — {ba.accountName} ({ba.accountNumber})</option>
                ))}
              </select>
            </div>
            <div className="acct-field">
              <label>Check Number</label>
              <input type="text" value={formData.checkNumber} onChange={(e) => setFormData({ ...formData, checkNumber: e.target.value })} required />
            </div>
          </div>
          <div className="acct-form-row">
            <div className="acct-field">
              <label>Amount</label>
              <input type="number" step="0.01" min="0.01" value={formData.amount} onChange={(e) => setFormData({ ...formData, amount: e.target.value })} required />
            </div>
            <div className="acct-field">
              <label>Check Date</label>
              <input type="date" value={formData.checkDate} onChange={(e) => setFormData({ ...formData, checkDate: e.target.value })} required />
            </div>
          </div>
          <div className="acct-field">
            <label>Payee Name</label>
            <input type="text" value={formData.payeeName} onChange={(e) => setFormData({ ...formData, payeeName: e.target.value })} required />
          </div>
          <div className="acct-form-actions">
            <button type="button" className="acct-btn" onClick={() => setShowForm(false)}>Cancel</button>
            <button type="submit" className="acct-btn acct-btn--primary">Create Check</button>
          </div>
        </form>
      )}

      {state.status === 'loading' && <div className="acct-empty">Loading...</div>}
      {state.status === 'error' && <div className="acct-error">{state.message}</div>}

      {state.status === 'loaded' && checks.length === 0 && (
        <div className="acct-empty">No checks found.</div>
      )}

      {state.status === 'loaded' && checks.length > 0 && (
        <table className="acct-table">
          <thead>
            <tr>
              <th>Check #</th>
              <th>Date</th>
              <th>Payee</th>
              <th>Bank</th>
              <th className="acct-text-right">Amount</th>
              <th>Status</th>
              <th>DV #</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {checks.map((c) => (
              <tr key={c.id}>
                <td style={{ fontWeight: 600 }}>{c.checkNumber}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{new Date(c.checkDate).toLocaleDateString()}</td>
                <td>{c.payeeName}</td>
                <td>{c.bankAccount.bank.code} — {c.bankAccount.accountName}</td>
                <td className="acct-text-right acct-text-mono">{formatPeso(c.amount)}</td>
                <td><span className={`acct-badge acct-badge--${c.status}`}>{c.status.replace(/_/g, ' ')}</span></td>
                <td>
                  {c.disbursementVoucher ? (
                    <Link to={`/procurement/dv/${c.disbursementVoucher.id}`} className="acct-table__link">
                      {c.disbursementVoucher.dvNumber}
                    </Link>
                  ) : '—'}
                </td>
                <td>
                  {getActions(c).map((action) => (
                    <button
                      key={action}
                      className="acct-btn acct-btn--sm"
                      style={{ marginRight: 4, marginBottom: 2 }}
                      onClick={() => handleTransition(c, action)}
                    >
                      {action.replace(/_/g, ' ')}
                    </button>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
