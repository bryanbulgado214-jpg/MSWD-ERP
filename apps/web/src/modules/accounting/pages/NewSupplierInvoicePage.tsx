import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { useAuth } from '../../../app/auth';
import { AccountingApiError, createSupplierInvoice, getChartOfAccounts } from '../api';
import { formatAccounting, parseMoney, unformatMoney } from '../money-format';
import type { ChartOfAccount } from '../types';

import { AccountCombobox } from './AccountCombobox';
import { AccountingSubNav } from './AccountingSubNav';
import './accounting.css';

interface LineDraft {
  chartOfAccountId: string;
  debitAmount: string;
  creditAmount: string;
  description: string;
}

interface DueDraft {
  dueDate: string;
  amount: string;
}

function emptyLine(): LineDraft {
  return { chartOfAccountId: '', debitAmount: '', creditAmount: '', description: '' };
}

function formatPeso(value: number): string {
  return value.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
}

export default function NewSupplierInvoicePage() {
  const navigate = useNavigate();
  const { permissions } = useAuth();
  const canCreate = permissions.has('accounting.jev.create');

  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
  const postableAccounts = useMemo(() => accounts.filter((a) => !a.isHeader), [accounts]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Header fields
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [supplierTin, setSupplierTin] = useState('');
  const [supplierAddress, setSupplierAddress] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [term, setTerm] = useState('');
  const [particulars, setParticulars] = useState('');

  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [due, setDue] = useState<DueDraft[]>([{ dueDate: '', amount: '' }]);

  const load = useCallback(async () => {
    try {
      const accts = await getChartOfAccounts('includeInactive=false');
      setAccounts(accts.filter((a) => !a.isHeader));
    } catch (e) {
      setError(e instanceof AccountingApiError ? e.message : 'Failed to load accounts.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const totalDebit = lines.reduce((s, l) => s + parseMoney(l.debitAmount), 0);
  const totalCredit = lines.reduce((s, l) => s + parseMoney(l.creditAmount), 0);
  const netPayable = Math.round((totalDebit - totalCredit) * 100) / 100;

  const scheduledRows = due.filter((d) => d.dueDate);
  const scheduledTotal =
    Math.round(scheduledRows.reduce((s, d) => s + parseMoney(d.amount), 0) * 100) / 100;
  const scheduleBalanced =
    scheduledRows.length === 0 || Math.abs(scheduledTotal - netPayable) < 0.01;

  function updateLine(idx: number, field: keyof LineDraft, value: string) {
    setLines((prev) => {
      const next = [...prev];
      const cur = next[idx];
      if (!cur) return prev;
      const updated: LineDraft = { ...cur, [field]: value };
      if (field === 'debitAmount' && value) updated.creditAmount = '';
      if (field === 'creditAmount' && value) updated.debitAmount = '';
      next[idx] = updated;
      return next;
    });
  }
  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
  }
  function removeLine(idx: number) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)));
  }

  function updateDue(idx: number, field: keyof DueDraft, value: string) {
    setDue((prev) => {
      const next = [...prev];
      const cur = next[idx];
      if (!cur) return prev;
      next[idx] = { ...cur, [field]: value };
      return next;
    });
  }
  function addInstallment() {
    setDue((prev) => [...prev, { dueDate: '', amount: '' }]);
  }
  function removeInstallment(idx: number) {
    setDue((prev) =>
      prev.length <= 1 ? [{ dueDate: '', amount: '' }] : prev.filter((_, i) => i !== idx),
    );
  }
  // Fill a single due-date row's amount with the full net payable.
  function fillFullAmount(idx: number) {
    setDue((prev) => {
      const next = [...prev];
      const cur = next[idx];
      if (!cur) return prev;
      next[idx] = { ...cur, amount: netPayable > 0 ? formatAccounting(String(netPayable)) : '' };
      return next;
    });
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const cleanLines = lines
      .filter(
        (l) =>
          l.chartOfAccountId && (parseMoney(l.debitAmount) > 0 || parseMoney(l.creditAmount) > 0),
      )
      .map((l) => ({
        chartOfAccountId: l.chartOfAccountId,
        debitAmount: parseMoney(l.debitAmount),
        creditAmount: parseMoney(l.creditAmount),
        ...(l.description.trim() ? { description: l.description.trim() } : {}),
      }));

    if (cleanLines.length === 0) {
      setError('Enter at least one charge line with an amount.');
      return;
    }
    if (netPayable <= 0) {
      setError('The net payable (charges less any tax withheld) must be greater than zero.');
      return;
    }
    if (!scheduleBalanced) {
      setError(
        `The due-date amounts (${formatPeso(scheduledTotal)}) must add up to the net payable (${formatPeso(netPayable)}).`,
      );
      return;
    }

    // A single dated row with a blank amount defaults to the full net payable.
    const dueSchedule = scheduledRows.map((d) => ({
      dueDate: d.dueDate,
      amount: scheduledRows.length === 1 && !d.amount.trim() ? netPayable : parseMoney(d.amount),
    }));

    setSaving(true);
    try {
      const created = await createSupplierInvoice({
        invoiceNumber: invoiceNumber.trim(),
        supplierName: supplierName.trim(),
        ...(supplierTin.trim() ? { supplierTin: supplierTin.trim() } : {}),
        ...(supplierAddress.trim() ? { supplierAddress: supplierAddress.trim() } : {}),
        invoiceDate,
        ...(term.trim() ? { term: term.trim() } : {}),
        particulars: particulars.trim(),
        lines: cleanLines,
        ...(dueSchedule.length > 0 ? { dueSchedule } : {}),
      });
      navigate(`/accounting/supplier-invoices/${created.id}`, { replace: true });
    } catch (e) {
      setError(e instanceof AccountingApiError ? e.message : 'Failed to save the invoice.');
    } finally {
      setSaving(false);
    }
  }

  if (!canCreate) {
    return (
      <div className="acct-page">
        <AccountingSubNav />
        <div className="acct-error">You do not have permission to record supplier invoices.</div>
      </div>
    );
  }

  return (
    <div className="acct-page">
      <AccountingSubNav />
      <h1>New Supplier's Invoice</h1>
      <p style={{ color: '#667085', fontSize: 13, marginTop: -6, marginBottom: 18, maxWidth: 720 }}>
        Record a supplier's bill. Saving posts the payable to the ledger (debit the charges, credit
        Accounts Payable). Payment for the invoice is made later from this module — no manual DV.
      </p>
      {error && <div className="acct-error">{error}</div>}

      <form className="acct-form" onSubmit={handleSave}>
        <div className="acct-form-row">
          <div className="acct-field">
            <label>Invoice Number</label>
            <input
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              required
              placeholder="Supplier's invoice / SI number"
            />
          </div>
          <div className="acct-field">
            <label>Invoice Date</label>
            <input
              type="date"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="acct-form-row">
          <div className="acct-field">
            <label>Supplier Name</label>
            <input
              value={supplierName}
              onChange={(e) => setSupplierName(e.target.value)}
              required
              placeholder="Name of supplier / payee"
            />
          </div>
          <div className="acct-field">
            <label>
              Supplier TIN <span style={{ color: '#98a2b3', fontWeight: 400 }}>(optional)</span>
            </label>
            <input
              value={supplierTin}
              onChange={(e) => setSupplierTin(e.target.value)}
              placeholder="000-000-000-000"
            />
          </div>
        </div>

        <div className="acct-form-row">
          <div className="acct-field">
            <label>
              Supplier Address <span style={{ color: '#98a2b3', fontWeight: 400 }}>(optional)</span>
            </label>
            <input
              value={supplierAddress}
              onChange={(e) => setSupplierAddress(e.target.value)}
              placeholder="Registered address"
            />
          </div>
          <div className="acct-field">
            <label>
              Term <span style={{ color: '#98a2b3', fontWeight: 400 }}>(optional)</span>
            </label>
            <input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="e.g. 3/10, n/15"
            />
          </div>
        </div>

        <div className="acct-form-row">
          <div className="acct-field" style={{ flex: 1 }}>
            <label>Particulars</label>
            <input
              value={particulars}
              onChange={(e) => setParticulars(e.target.value)}
              required
              placeholder="Description of what was billed"
            />
          </div>
        </div>

        <h3
          style={{ fontSize: 14, fontWeight: 700, color: 'var(--mswd-navy)', margin: '16px 0 8px' }}
        >
          Charges
        </h3>
        <p style={{ color: '#667085', fontSize: 12, marginTop: -4, marginBottom: 8 }}>
          Debit the expense or asset accounts being billed. Add a credit line only for tax withheld
          at booking (e.g. Due to BIR). Accounts Payable is credited automatically for the net.
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table className="acct-table" style={{ marginBottom: 8 }}>
            <thead>
              <tr>
                <th style={{ minWidth: 280 }}>Account</th>
                <th style={{ width: 130 }}>Debit</th>
                <th style={{ width: 130 }}>Credit</th>
                <th style={{ minWidth: 160 }}>Description</th>
                <th style={{ width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, idx) => (
                <tr key={idx}>
                  <td>
                    <div style={{ maxWidth: 320 }}>
                      <AccountCombobox
                        accounts={postableAccounts}
                        value={line.chartOfAccountId}
                        onChange={(id) => updateLine(idx, 'chartOfAccountId', id)}
                        placeholder="Type code or name…"
                      />
                    </div>
                  </td>
                  <td>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={line.debitAmount}
                      onChange={(e) => updateLine(idx, 'debitAmount', e.target.value)}
                      onFocus={(e) => updateLine(idx, 'debitAmount', unformatMoney(e.target.value))}
                      onBlur={(e) =>
                        updateLine(idx, 'debitAmount', formatAccounting(e.target.value))
                      }
                      placeholder="0.00"
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={line.creditAmount}
                      onChange={(e) => updateLine(idx, 'creditAmount', e.target.value)}
                      onFocus={(e) =>
                        updateLine(idx, 'creditAmount', unformatMoney(e.target.value))
                      }
                      onBlur={(e) =>
                        updateLine(idx, 'creditAmount', formatAccounting(e.target.value))
                      }
                      placeholder="0.00"
                    />
                  </td>
                  <td>
                    <input
                      value={line.description}
                      onChange={(e) => updateLine(idx, 'description', e.target.value)}
                      placeholder="Optional"
                    />
                  </td>
                  <td>
                    {lines.length > 1 && (
                      <button
                        type="button"
                        className="acct-icon-btn acct-icon-btn--danger"
                        onClick={() => removeLine(idx)}
                        title="Remove line"
                        aria-label="Remove line"
                      >
                        ×
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              <tr>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>
                  Net payable (to Accounts Payable)
                </td>
                <td colSpan={3} className="acct-text-mono" style={{ fontWeight: 700 }}>
                  {formatPeso(netPayable > 0 ? netPayable : 0)}
                </td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
        <button type="button" className="acct-btn acct-btn--sm" onClick={addLine}>
          + Add Line
        </button>

        <h3
          style={{ fontSize: 14, fontWeight: 700, color: 'var(--mswd-navy)', margin: '20px 0 8px' }}
        >
          Payment due date(s)
        </h3>
        <p style={{ color: '#667085', fontSize: 12, marginTop: -4, marginBottom: 8 }}>
          When the bill is due. Add more rows for installments. Due dates appear in the accountant's
          “Upcoming Due Dates”. Leave blank if there is no set due date yet.
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table className="acct-table" style={{ marginBottom: 8, maxWidth: 520 }}>
            <thead>
              <tr>
                <th style={{ width: 190 }}>Due Date</th>
                <th style={{ width: 160 }}>Amount</th>
                <th style={{ width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {due.map((d, idx) => (
                <tr key={idx}>
                  <td>
                    <input
                      type="date"
                      value={d.dueDate}
                      onChange={(e) => updateDue(idx, 'dueDate', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={d.amount}
                      onChange={(e) => updateDue(idx, 'amount', e.target.value)}
                      onFocus={(e) => updateDue(idx, 'amount', unformatMoney(e.target.value))}
                      onBlur={(e) => updateDue(idx, 'amount', formatAccounting(e.target.value))}
                      placeholder="0.00"
                      onDoubleClick={() => fillFullAmount(idx)}
                      title="Double-click to fill with the full net payable"
                    />
                  </td>
                  <td>
                    {(due.length > 1 || d.dueDate || d.amount) && (
                      <button
                        type="button"
                        className="acct-icon-btn acct-icon-btn--danger"
                        onClick={() => removeInstallment(idx)}
                        title="Remove"
                        aria-label="Remove"
                      >
                        ×
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {scheduledRows.length > 0 && (
                <tr>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>Scheduled total</td>
                  <td className="acct-text-mono" style={{ fontWeight: 700 }}>
                    {formatPeso(scheduledTotal)}
                  </td>
                  <td>
                    {scheduleBalanced ? (
                      <span style={{ color: '#12805c', fontSize: 12 }}>✓</span>
                    ) : (
                      <span style={{ color: '#b42318', fontSize: 12 }}>≠ net</span>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <button type="button" className="acct-btn acct-btn--sm" onClick={addInstallment}>
          + Add installment
        </button>

        <div className="acct-form-actions" style={{ marginTop: 20 }}>
          <Link to="/accounting/supplier-invoices" className="acct-btn">
            Cancel
          </Link>
          <button
            type="submit"
            className="acct-btn acct-btn--primary"
            disabled={saving || netPayable <= 0 || !scheduleBalanced}
          >
            {saving ? 'Saving…' : 'Record Invoice'}
          </button>
        </div>
      </form>
    </div>
  );
}
