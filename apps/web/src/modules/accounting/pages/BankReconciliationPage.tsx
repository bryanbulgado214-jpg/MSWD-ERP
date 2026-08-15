import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { AccountingSubNav } from './AccountingSubNav';

import './accounting.css';
import {
  getReconciliations,
  getReconciliation,
  createReconciliation,
  addReconItem,
  completeReconciliation,
  approveReconciliation,
  getBankAccounts,
  getGlFiscalYears,
  getGlPeriods,
} from '../api';
import type {
  BankReconciliationListItem,
  BankReconciliationDetail,
  BankAccount,
  FiscalYearOption,
  PeriodOption,
} from '../types';

function formatPeso(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num) || num === 0) return '—';
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(num);
}

const ITEM_TYPES = [
  { value: 'deposit_in_transit', label: 'Deposit in Transit', side: 'bank' },
  { value: 'outstanding_check', label: 'Outstanding Check', side: 'bank' },
  { value: 'bank_charge', label: 'Bank Charge', side: 'book' },
  { value: 'bank_credit', label: 'Bank Credit', side: 'book' },
  { value: 'book_error', label: 'Book Error', side: 'book' },
  { value: 'bank_error', label: 'Bank Error', side: 'bank' },
];

// ── List View ──

function ReconciliationList() {
  const navigate = useNavigate();
  const [list, setList] = useState<BankReconciliationListItem[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [filterBank, setFilterBank] = useState('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [fiscalYears, setFiscalYears] = useState<FiscalYearOption[]>([]);
  const [periods, setPeriods] = useState<PeriodOption[]>([]);
  const [selectedFY, setSelectedFY] = useState('');
  const [formData, setFormData] = useState({
    bankAccountId: '',
    accountingPeriodId: '',
    reconciliationDate: '',
    bookBalance: '',
    bankBalance: '',
  });
  const [formError, setFormError] = useState('');

  useEffect(() => {
    getBankAccounts().then(setBankAccounts);
    getGlFiscalYears().then((fy) => {
      setFiscalYears(fy);
      if (fy.length > 0) setSelectedFY(fy[0].id);
    });
  }, []);

  useEffect(() => {
    if (selectedFY) getGlPeriods(selectedFY).then(setPeriods);
  }, [selectedFY]);

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterBank) params.set('bankAccountId', filterBank);
    getReconciliations(params.toString())
      .then(setList)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [filterBank]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    try {
      const result = await createReconciliation({
        bankAccountId: formData.bankAccountId,
        accountingPeriodId: formData.accountingPeriodId,
        reconciliationDate: formData.reconciliationDate,
        bookBalance: parseFloat(formData.bookBalance),
        bankBalance: parseFloat(formData.bankBalance),
      });
      navigate(`/accounting/reconciliations/${result.id}`);
    } catch (err: any) {
      setFormError(err.message);
    }
  };

  return (
    <>
      <h1>Bank Reconciliations</h1>

      <div className="acct-toolbar">
        <select
          value={filterBank}
          onChange={(e) => setFilterBank(e.target.value)}
          style={{ width: '100%', maxWidth: 240, boxSizing: 'border-box' }}
        >
          <option value="">All Bank Accounts</option>
          {bankAccounts.map((ba) => (
            <option key={ba.id} value={ba.id}>
              {ba.bank.code} — {ba.accountName}
            </option>
          ))}
        </select>
        <button className="acct-btn acct-btn--primary" onClick={() => setShowForm(!showForm)}>
          + New Reconciliation
        </button>
      </div>

      {showForm && (
        <form className="acct-form" onSubmit={handleCreate}>
          {formError && <div className="acct-error">{formError}</div>}
          <div className="acct-form-row">
            <div className="acct-field">
              <label>Bank Account</label>
              <select
                value={formData.bankAccountId}
                onChange={(e) => setFormData({ ...formData, bankAccountId: e.target.value })}
                required
                style={{ width: '100%', maxWidth: 360, boxSizing: 'border-box' }}
              >
                <option value="">Select...</option>
                {bankAccounts
                  .filter((ba) => ba.status === 'active')
                  .map((ba) => (
                    <option key={ba.id} value={ba.id}>
                      {ba.bank.code} — {ba.accountName}
                    </option>
                  ))}
              </select>
            </div>
            <div className="acct-field">
              <label>Accounting Period</label>
              <select
                value={formData.accountingPeriodId}
                onChange={(e) => setFormData({ ...formData, accountingPeriodId: e.target.value })}
                required
              >
                <option value="">Select...</option>
                {periods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="acct-form-row">
            <div className="acct-field">
              <label>Reconciliation Date</label>
              <input
                type="date"
                value={formData.reconciliationDate}
                onChange={(e) => setFormData({ ...formData, reconciliationDate: e.target.value })}
                required
              />
            </div>
            <div className="acct-field">
              <label>Book Balance (per GL)</label>
              <input
                type="number"
                step="0.01"
                value={formData.bookBalance}
                onChange={(e) => setFormData({ ...formData, bookBalance: e.target.value })}
                required
              />
            </div>
          </div>
          <div className="acct-form-row">
            <div className="acct-field">
              <label>Bank Statement Balance</label>
              <input
                type="number"
                step="0.01"
                value={formData.bankBalance}
                onChange={(e) => setFormData({ ...formData, bankBalance: e.target.value })}
                required
              />
            </div>
            <div className="acct-field" />
          </div>
          <div className="acct-form-actions">
            <button type="button" className="acct-btn" onClick={() => setShowForm(false)}>
              Cancel
            </button>
            <button type="submit" className="acct-btn acct-btn--primary">
              Create
            </button>
          </div>
        </form>
      )}

      {loading && <div className="acct-empty">Loading...</div>}

      {!loading && list.length === 0 && <div className="acct-empty">No reconciliations found.</div>}

      {!loading && list.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="acct-table">
            <thead>
              <tr>
                <th>Period</th>
                <th>Bank Account</th>
                <th>Date</th>
                <th className="acct-text-right">Book Bal.</th>
                <th className="acct-text-right">Bank Bal.</th>
                <th className="acct-text-right">Difference</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link to={`/accounting/reconciliations/${r.id}`} className="acct-table__link">
                      {r.accountingPeriod.name}
                    </Link>
                  </td>
                  <td>
                    {r.bankAccount.bank.code} — {r.bankAccount.accountName}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {new Date(r.reconciliationDate).toLocaleDateString()}
                  </td>
                  <td className="acct-text-right acct-text-mono">
                    {formatPeso(r.adjustedBookBalance)}
                  </td>
                  <td className="acct-text-right acct-text-mono">
                    {formatPeso(r.adjustedBankBalance)}
                  </td>
                  <td
                    className="acct-text-right acct-text-mono"
                    style={{
                      color: Math.abs(parseFloat(r.difference)) < 0.01 ? '#067647' : '#b42318',
                      fontWeight: 600,
                    }}
                  >
                    {Math.abs(parseFloat(r.difference)) < 0.01
                      ? 'Reconciled'
                      : formatPeso(r.difference)}
                  </td>
                  <td>
                    <span className={`acct-badge acct-badge--${r.status}`}>
                      {r.status.replace(/_/g, ' ')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ── Detail View ──

function ReconciliationDetail({ id }: { id: string }) {
  const [recon, setRecon] = useState<BankReconciliationDetail | null>(null);
  const [error, setError] = useState('');
  const [showItemForm, setShowItemForm] = useState(false);
  const [itemData, setItemData] = useState({
    itemType: 'outstanding_check',
    referenceNumber: '',
    referenceDate: '',
    amount: '',
    description: '',
  });
  const [itemError, setItemError] = useState('');

  const load = () => {
    getReconciliation(id)
      .then(setRecon)
      .catch((err) => setError(err.message));
  };

  useEffect(() => {
    load();
  }, [id]);

  if (error) return <div className="acct-error">{error}</div>;
  if (!recon) return <div className="acct-empty">Loading...</div>;

  const isEditable = recon.status === 'in_progress' || recon.status === 'draft';

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setItemError('');
    try {
      const result = await addReconItem(id, {
        expectedVersion: recon.version,
        itemType: itemData.itemType,
        ...(itemData.referenceNumber ? { referenceNumber: itemData.referenceNumber } : {}),
        referenceDate: itemData.referenceDate,
        amount: parseFloat(itemData.amount),
        description: itemData.description,
      });
      setRecon(result);
      setShowItemForm(false);
      setItemData({
        itemType: 'outstanding_check',
        referenceNumber: '',
        referenceDate: '',
        amount: '',
        description: '',
      });
    } catch (err: any) {
      setItemError(err.message);
    }
  };

  const handleComplete = async () => {
    try {
      const result = await completeReconciliation(id, recon.version);
      setRecon(result);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleApprove = async () => {
    try {
      const result = await approveReconciliation(id, recon.version);
      setRecon(result);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const bookItems = recon.items.filter(
    (i) => ITEM_TYPES.find((t) => t.value === i.itemType)?.side === 'book',
  );
  const bankItems = recon.items.filter(
    (i) => ITEM_TYPES.find((t) => t.value === i.itemType)?.side === 'bank',
  );

  return (
    <>
      <Link
        to="/accounting/reconciliations"
        className="acct-btn acct-btn--sm"
        style={{ marginBottom: 16, display: 'inline-block' }}
      >
        &larr; All Reconciliations
      </Link>

      <h1>
        {recon.accountingPeriod.name} — {recon.bankAccount.bank.code}{' '}
        {recon.bankAccount.accountName}
      </h1>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <span className={`acct-badge acct-badge--${recon.status}`}>
          {recon.status.replace(/_/g, ' ')}
        </span>
        {recon.preparer && (
          <span style={{ fontSize: 13, color: '#667085' }}>
            Prepared by: {recon.preparer.username}
          </span>
        )}
        {recon.approver && (
          <span style={{ fontSize: 13, color: '#667085' }}>
            Approved by: {recon.approver.username}
          </span>
        )}
      </div>

      <div
        className="acct-form"
        style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}
      >
        <div>
          <h3 style={{ margin: '0 0 12px', color: 'var(--mswd-navy)' }}>Book Side</h3>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '6px 0',
              borderBottom: '1px solid #eaecf0',
            }}
          >
            <span>Book Balance (GL)</span>
            <strong className="acct-text-mono">{formatPeso(recon.bookBalance)}</strong>
          </div>
          {bookItems.map((item) => (
            <div
              key={item.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '6px 0',
                borderBottom: '1px solid #eaecf0',
                fontSize: 13,
              }}
            >
              <span>
                <span
                  className={`acct-badge acct-badge--${item.itemType === 'bank_charge' ? 'voided' : 'posted'}`}
                  style={{ marginRight: 6 }}
                >
                  {item.itemType.replace(/_/g, ' ')}
                </span>
                {item.description}
              </span>
              <span className="acct-text-mono">{formatPeso(item.amount)}</span>
            </div>
          ))}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '8px 0',
              fontWeight: 700,
              borderTop: '2px solid var(--mswd-navy)',
            }}
          >
            <span>Adjusted Book Balance</span>
            <span className="acct-text-mono">{formatPeso(recon.adjustedBookBalance)}</span>
          </div>
        </div>

        <div>
          <h3 style={{ margin: '0 0 12px', color: 'var(--mswd-navy)' }}>Bank Side</h3>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '6px 0',
              borderBottom: '1px solid #eaecf0',
            }}
          >
            <span>Bank Statement Balance</span>
            <strong className="acct-text-mono">{formatPeso(recon.bankBalance)}</strong>
          </div>
          {bankItems.map((item) => (
            <div
              key={item.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '6px 0',
                borderBottom: '1px solid #eaecf0',
                fontSize: 13,
              }}
            >
              <span>
                <span
                  className={`acct-badge acct-badge--${item.itemType === 'outstanding_check' ? 'for_review' : 'posted'}`}
                  style={{ marginRight: 6 }}
                >
                  {item.itemType.replace(/_/g, ' ')}
                </span>
                {item.description}
                {item.referenceNumber && (
                  <span style={{ color: '#667085' }}> ({item.referenceNumber})</span>
                )}
              </span>
              <span className="acct-text-mono">{formatPeso(item.amount)}</span>
            </div>
          ))}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '8px 0',
              fontWeight: 700,
              borderTop: '2px solid var(--mswd-navy)',
            }}
          >
            <span>Adjusted Bank Balance</span>
            <span className="acct-text-mono">{formatPeso(recon.adjustedBankBalance)}</span>
          </div>
        </div>
      </div>

      <div style={{ textAlign: 'center', padding: '12px 0', fontSize: 15, fontWeight: 700 }}>
        Difference:{' '}
        <span
          style={{ color: Math.abs(parseFloat(recon.difference)) < 0.01 ? '#067647' : '#b42318' }}
        >
          {Math.abs(parseFloat(recon.difference)) < 0.01
            ? 'Reconciled'
            : formatPeso(recon.difference)}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
        {isEditable && (
          <button className="acct-btn" onClick={() => setShowItemForm(!showItemForm)}>
            + Add Reconciling Item
          </button>
        )}
        {recon.status === 'in_progress' && (
          <button className="acct-btn acct-btn--primary" onClick={handleComplete}>
            Mark Complete
          </button>
        )}
        {recon.status === 'completed' && (
          <button className="acct-btn acct-btn--primary" onClick={handleApprove}>
            Approve
          </button>
        )}
      </div>

      {showItemForm && (
        <form className="acct-form" onSubmit={handleAddItem} style={{ marginTop: 16 }}>
          {itemError && <div className="acct-error">{itemError}</div>}
          <div className="acct-form-row">
            <div className="acct-field">
              <label>Item Type</label>
              <select
                value={itemData.itemType}
                onChange={(e) => setItemData({ ...itemData, itemType: e.target.value })}
                required
              >
                {ITEM_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label} ({t.side} side)
                  </option>
                ))}
              </select>
            </div>
            <div className="acct-field">
              <label>Reference Number</label>
              <input
                type="text"
                value={itemData.referenceNumber}
                onChange={(e) => setItemData({ ...itemData, referenceNumber: e.target.value })}
              />
            </div>
          </div>
          <div className="acct-form-row">
            <div className="acct-field">
              <label>Reference Date</label>
              <input
                type="date"
                value={itemData.referenceDate}
                onChange={(e) => setItemData({ ...itemData, referenceDate: e.target.value })}
                required
              />
            </div>
            <div className="acct-field">
              <label>Amount</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={itemData.amount}
                onChange={(e) => setItemData({ ...itemData, amount: e.target.value })}
                required
              />
            </div>
          </div>
          <div className="acct-field">
            <label>Description</label>
            <input
              type="text"
              value={itemData.description}
              onChange={(e) => setItemData({ ...itemData, description: e.target.value })}
              required
            />
          </div>
          <div className="acct-form-actions">
            <button type="button" className="acct-btn" onClick={() => setShowItemForm(false)}>
              Cancel
            </button>
            <button type="submit" className="acct-btn acct-btn--primary">
              Add Item
            </button>
          </div>
        </form>
      )}
    </>
  );
}

// ── Router entry ──

export default function BankReconciliationPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <div className="acct-page">
      <AccountingSubNav />
      {id ? <ReconciliationDetail id={id} /> : <ReconciliationList />}
    </div>
  );
}
