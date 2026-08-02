import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '../../../app/auth';
import {
  AccountingApiError,
  createBank,
  createBankAccount,
  getBankAccounts,
  getBanks,
} from '../api';
import type { Bank, BankAccount } from '../types';
import { AccountingSubNav } from './AccountingSubNav';
import './accounting.css';

type LoadState<T> =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; data: T };

function formatPeso(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return num.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
}

export default function BanksPage() {
  const { permissions } = useAuth();
  const canManage = permissions.has('accounting.bank.manage');

  const [banks, setBanks] = useState<LoadState<Bank[]>>({ status: 'loading' });
  const [accounts, setAccounts] = useState<LoadState<BankAccount[]>>({ status: 'loading' });
  const [showBankForm, setShowBankForm] = useState(false);
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [formError, setFormError] = useState('');

  const loadBanks = useCallback(async () => {
    try {
      const data = await getBanks();
      setBanks({ status: 'loaded', data });
    } catch (e) {
      setBanks({ status: 'error', message: e instanceof AccountingApiError ? e.message : 'Failed to load banks.' });
    }
  }, []);

  const loadAccounts = useCallback(async () => {
    try {
      const data = await getBankAccounts();
      setAccounts({ status: 'loaded', data });
    } catch (e) {
      setAccounts({ status: 'error', message: e instanceof AccountingApiError ? e.message : 'Failed to load accounts.' });
    }
  }, []);

  useEffect(() => { loadBanks(); loadAccounts(); }, [loadBanks, loadAccounts]);

  async function handleCreateBank(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError('');
    const fd = new FormData(e.currentTarget);
    try {
      await createBank({
        code: fd.get('code') as string,
        name: fd.get('name') as string,
        ...(fd.get('branch') ? { branch: fd.get('branch') as string } : {}),
      });
      setShowBankForm(false);
      loadBanks();
    } catch (e) {
      setFormError(e instanceof AccountingApiError ? e.message : 'Failed to create bank.');
    }
  }

  async function handleCreateAccount(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError('');
    const fd = new FormData(e.currentTarget);
    try {
      await createBankAccount({
        bankId: fd.get('bankId') as string,
        accountNumber: fd.get('accountNumber') as string,
        accountName: fd.get('accountName') as string,
        accountType: fd.get('accountType') as string,
        isDefault: fd.get('isDefault') === 'true',
      });
      setShowAccountForm(false);
      loadAccounts();
    } catch (e) {
      setFormError(e instanceof AccountingApiError ? e.message : 'Failed to create bank account.');
    }
  }

  return (
    <div className="acct-page">
      <AccountingSubNav />
      <h1>Banks & Bank Accounts</h1>

      {/* ── Banks Section ── */}
      <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--mswd-navy)', marginBottom: 12 }}>Banks</h2>

      <div className="acct-toolbar">
        {canManage && (
          <button
            type="button"
            className="acct-btn acct-btn--primary"
            onClick={() => { setShowBankForm(!showBankForm); setShowAccountForm(false); }}
          >
            {showBankForm ? 'Cancel' : '+ Add Bank'}
          </button>
        )}
      </div>

      {showBankForm && (
        <form className="acct-form" onSubmit={handleCreateBank}>
          {formError && <div className="acct-error">{formError}</div>}
          <div className="acct-form-row">
            <div className="acct-field">
              <label>Code</label>
              <input name="code" required maxLength={20} placeholder="e.g. LBP" />
            </div>
            <div className="acct-field">
              <label>Name</label>
              <input name="name" required maxLength={255} placeholder="e.g. Land Bank of the Philippines" />
            </div>
          </div>
          <div className="acct-field">
            <label>Branch (optional)</label>
            <input name="branch" maxLength={255} placeholder="e.g. Siquijor Branch" />
          </div>
          <div className="acct-form-actions">
            <button type="button" className="acct-btn" onClick={() => setShowBankForm(false)}>Cancel</button>
            <button type="submit" className="acct-btn acct-btn--primary">Create Bank</button>
          </div>
        </form>
      )}

      {banks.status === 'loading' && <div className="acct-empty">Loading banks...</div>}
      {banks.status === 'error' && <div className="acct-error">{banks.message}</div>}
      {banks.status === 'loaded' && banks.data.length === 0 && <div className="acct-empty">No banks registered yet.</div>}
      {banks.status === 'loaded' && banks.data.length > 0 && (
        <div style={{ overflowX: 'auto', marginBottom: 32 }}>
          <table className="acct-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Bank Name</th>
                <th>Branch</th>
                <th>Accounts</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {banks.data.map((bank) => (
                <tr key={bank.id}>
                  <td className="acct-text-mono">{bank.code}</td>
                  <td style={{ fontWeight: 600 }}>{bank.name}</td>
                  <td>{bank.branch || '—'}</td>
                  <td>{bank._count?.bankAccounts ?? 0}</td>
                  <td>
                    <span className={`acct-badge acct-badge--${bank.isActive ? 'active' : 'inactive'}`}>
                      {bank.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Bank Accounts Section ── */}
      <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--mswd-navy)', marginBottom: 12 }}>Bank Accounts</h2>

      <div className="acct-toolbar">
        {canManage && banks.status === 'loaded' && banks.data.length > 0 && (
          <button
            type="button"
            className="acct-btn acct-btn--primary"
            onClick={() => { setShowAccountForm(!showAccountForm); setShowBankForm(false); }}
          >
            {showAccountForm ? 'Cancel' : '+ Add Account'}
          </button>
        )}
      </div>

      {showAccountForm && banks.status === 'loaded' && (
        <form className="acct-form" onSubmit={handleCreateAccount}>
          {formError && <div className="acct-error">{formError}</div>}
          <div className="acct-form-row">
            <div className="acct-field">
              <label>Bank</label>
              <select name="bankId" required>
                <option value="">Select bank...</option>
                {banks.data.filter((b) => b.isActive).map((b) => (
                  <option key={b.id} value={b.id}>{b.code} — {b.name}</option>
                ))}
              </select>
            </div>
            <div className="acct-field">
              <label>Account Type</label>
              <select name="accountType" required>
                <option value="checking">Checking</option>
                <option value="savings">Savings</option>
                <option value="trust">Trust</option>
              </select>
            </div>
          </div>
          <div className="acct-form-row">
            <div className="acct-field">
              <label>Account Number</label>
              <input name="accountNumber" required maxLength={50} />
            </div>
            <div className="acct-field">
              <label>Account Name</label>
              <input name="accountName" required maxLength={255} />
            </div>
          </div>
          <div className="acct-field">
            <label>Set as default account?</label>
            <select name="isDefault">
              <option value="false">No</option>
              <option value="true">Yes</option>
            </select>
          </div>
          <div className="acct-form-actions">
            <button type="button" className="acct-btn" onClick={() => setShowAccountForm(false)}>Cancel</button>
            <button type="submit" className="acct-btn acct-btn--primary">Create Account</button>
          </div>
        </form>
      )}

      {accounts.status === 'loading' && <div className="acct-empty">Loading bank accounts...</div>}
      {accounts.status === 'error' && <div className="acct-error">{accounts.message}</div>}
      {accounts.status === 'loaded' && accounts.data.length === 0 && <div className="acct-empty">No bank accounts yet.</div>}
      {accounts.status === 'loaded' && accounts.data.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="acct-table">
            <thead>
              <tr>
                <th>Account Number</th>
                <th>Account Name</th>
                <th>Bank</th>
                <th>Type</th>
                <th>Balance</th>
                <th>Fund Source</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {accounts.data.map((acct) => (
                <tr key={acct.id}>
                  <td className="acct-text-mono" style={{ fontWeight: 600 }}>
                    {acct.accountNumber}
                    {acct.isDefault && <span className="acct-badge acct-badge--default">DEFAULT</span>}
                  </td>
                  <td>{acct.accountName}</td>
                  <td>{acct.bank.name}</td>
                  <td><span className={`acct-badge acct-badge--${acct.accountType}`}>{acct.accountType}</span></td>
                  <td className="acct-text-right acct-text-mono">{formatPeso(acct.currentBalance)}</td>
                  <td>{acct.fundSource?.name || '—'}</td>
                  <td><span className={`acct-badge acct-badge--${acct.status}`}>{acct.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
