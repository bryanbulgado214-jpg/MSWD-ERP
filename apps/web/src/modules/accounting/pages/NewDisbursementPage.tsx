import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { useAuth } from '../../../app/auth';
import { listFundSources } from '../../budgeting/api';
import {
  AccountingApiError,
  createDisbursement,
  getAccountingSettings,
  getBankAccounts,
  getChartOfAccounts,
  getDisbursement,
  updateDisbursement,
  uploadDvAttachment,
} from '../api';
import { bankAccountLabel } from '../bank-account-label';
import type { BankAccount, ChartOfAccount, CreateDisbursementInput } from '../types';

import { AccountCombobox } from './AccountCombobox';
import { AccountingSubNav } from './AccountingSubNav';
import { PayeeCombobox } from './PayeeCombobox';
import './accounting.css';

interface LineDraft {
  chartOfAccountId: string;
  debitAmount: string;
  creditAmount: string;
  description: string;
}

interface Lookup {
  id: string;
  code: string;
  name: string;
}

function emptyLine(): LineDraft {
  return { chartOfAccountId: '', debitAmount: '', creditAmount: '', description: '' };
}

function peso(n: number): string {
  return n.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
}

const DV_TYPES = [
  { value: 'travel', label: 'Travel' },
  { value: 'reimbursement', label: 'Reimbursement' },
  { value: 'payroll', label: 'Payroll' },
  { value: 'utility', label: 'Utility' },
  { value: 'other', label: 'Other' },
];

export default function NewDisbursementPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const { permissions } = useAuth();
  const canCreate = permissions.has('accounting.dv.create');

  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
  const [fundSources, setFundSources] = useState<Lookup[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState<false | 'draft' | 'post'>(false);

  // Header
  const [dvType, setDvType] = useState('travel');
  const [dvDate, setDvDate] = useState(new Date().toISOString().slice(0, 10));
  const [dvNumber, setDvNumber] = useState('');
  const [manualNumbering, setManualNumbering] = useState(false);
  const [payeeName, setPayeeName] = useState('');
  const [payeeTin, setPayeeTin] = useState('');
  const [payeeAddress, setPayeeAddress] = useState('');
  const [particulars, setParticulars] = useState('');
  const [paymentMode, setPaymentMode] = useState('check');
  const [fundSourceId, setFundSourceId] = useState('');
  const [bankAccountId, setBankAccountId] = useState('');
  // Charge/deduction entry (the cash credit is added automatically from the bank)
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  // Supporting documents to attach once the DV is created.
  const [attachFiles, setAttachFiles] = useState<File[]>([]);

  const load = useCallback(async () => {
    try {
      const [accts, banks] = await Promise.all([
        getChartOfAccounts('includeInactive=false'),
        getBankAccounts(),
      ]);
      setAccounts(accts.filter((a) => !a.isHeader));
      setBankAccounts(banks.filter((b) => b.status === 'active' && b.chartOfAccount));
      try {
        setFundSources(await listFundSources());
      } catch {
        /* fund sources optional */
      }
      if (!id) {
        try {
          const s = await getAccountingSettings();
          setManualNumbering(s.manualDocumentNumbering);
        } catch {
          /* numbering setting optional */
        }
      }

      // Edit mode — prefill from the existing draft DV.
      if (id) {
        const dv = await getDisbursement(id);
        setDvType(dv.dvType);
        setDvDate(dv.dvDate.slice(0, 10));
        setPayeeName(dv.payeeName ?? '');
        setPayeeTin(dv.payeeTin ?? '');
        setPayeeAddress(dv.payeeAddress ?? '');
        setParticulars(dv.particulars);
        setPaymentMode(dv.paymentMode);
        setFundSourceId(dv.fundSource?.id ?? '');
        setBankAccountId(dv.bankAccountId ?? '');
        // Show only the charge/deduction lines — the balancing cash credit is
        // re-derived from the bank account on save (it carries that description).
        const editable = (dv.journalEntry?.lines ?? []).filter(
          (l) => !(l.description ?? '').startsWith('Cash disbursement —'),
        );
        setLines(
          editable.length
            ? editable.map((l) => ({
                chartOfAccountId: l.chartOfAccountId,
                debitAmount: Number(l.debitAmount) ? String(Number(l.debitAmount)) : '',
                creditAmount: Number(l.creditAmount) ? String(Number(l.creditAmount)) : '',
                description: l.description ?? '',
              }))
            : [emptyLine()],
        );
      }
    } catch (e) {
      setError(e instanceof AccountingApiError ? e.message : 'Failed to load form data.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  function updateLine(idx: number, field: keyof LineDraft, value: string) {
    const next = [...lines];
    next[idx] = { ...next[idx]!, [field]: value };
    if (field === 'debitAmount' && value) next[idx]!.creditAmount = '';
    if (field === 'creditAmount' && value) next[idx]!.debitAmount = '';
    setLines(next);
  }

  function addLine() {
    setLines([...lines, emptyLine()]);
  }
  function removeLine(idx: number) {
    if (lines.length <= 1) return;
    setLines(lines.filter((_, i) => i !== idx));
  }

  const totalDebit = lines.reduce((s, l) => s + (parseFloat(l.debitAmount) || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (parseFloat(l.creditAmount) || 0), 0);
  const net = Math.round((totalDebit - totalCredit) * 100) / 100;
  const filledLines = lines.filter(
    (l) => l.chartOfAccountId && (parseFloat(l.debitAmount) || parseFloat(l.creditAmount)),
  );
  const bank = bankAccounts.find((b) => b.id === bankAccountId);

  const canSubmit =
    canCreate &&
    payeeName.trim().length > 0 &&
    particulars.trim().length > 0 &&
    bankAccountId.length > 0 &&
    totalDebit > 0 &&
    net > 0 &&
    filledLines.length >= 1;

  async function submit(asDraft: boolean) {
    if (!canSubmit) return;
    setSaving(asDraft ? 'draft' : 'post');
    setError('');
    try {
      const payload: CreateDisbursementInput = {
        dvType,
        dvDate,
        ...(manualNumbering && dvNumber.trim() ? { dvNumber: dvNumber.trim() } : {}),
        payeeName: payeeName.trim(),
        ...(payeeTin.trim() ? { payeeTin: payeeTin.trim() } : {}),
        ...(payeeAddress.trim() ? { payeeAddress: payeeAddress.trim() } : {}),
        particulars: particulars.trim(),
        paymentMode,
        bankAccountId,
        ...(fundSourceId ? { fundSourceId } : {}),
        ...(asDraft ? { asDraft: true } : {}),
        lines: filledLines.map((l) => ({
          chartOfAccountId: l.chartOfAccountId,
          debitAmount: parseFloat(l.debitAmount) || 0,
          creditAmount: parseFloat(l.creditAmount) || 0,
          ...(l.description.trim() ? { description: l.description.trim() } : {}),
        })),
      };
      if (isEdit && id) {
        await updateDisbursement(id, payload);
      } else {
        const created = await createDisbursement(payload);
        // Attach any supporting documents to the newly-created DV.
        for (const file of attachFiles) {
          await uploadDvAttachment(created.id, file);
        }
      }
      // Always return to the register; the row's own Print/View actions take it
      // from there (previously a posted DV jumped straight to the printout).
      navigate('/accounting/disbursements');
    } catch (e) {
      setError(
        e instanceof AccountingApiError ? e.message : 'Failed to save disbursement voucher.',
      );
      setSaving(false);
    }
  }

  if (loading)
    return (
      <div className="acct-page">
        <AccountingSubNav />
        <div className="acct-empty">Loading...</div>
      </div>
    );

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 12,
    fontWeight: 600,
    color: '#344054',
    marginBottom: 4,
  };
  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '7px 9px',
    border: '1px solid #d0d5dd',
    borderRadius: 6,
    fontSize: 13,
    boxSizing: 'border-box',
  };
  const cell = (w: string): React.CSSProperties => ({ flex: `1 1 ${w}`, minWidth: 0 });

  return (
    <div className="acct-page">
      <AccountingSubNav />
      <h1>{isEdit ? 'Edit Disbursement Voucher' : 'New Disbursement Voucher'}</h1>
      <p style={{ color: '#667085', fontSize: 13, marginTop: -6, marginBottom: 18, maxWidth: 760 }}>
        For non-procurement disbursements (travel, reimbursement, payroll, utilities, etc.). Enter
        the accounts charged and any deductions withheld — the net is credited automatically to the
        bank account you choose.
      </p>

      {error && (
        <div className="acct-error" style={{ marginBottom: 16 }}>
          {error}
        </div>
      )}

      <div style={{ maxWidth: 1240 }}>
        {/* Compact header — kept narrow so the accounting entry gets the room */}
        <div style={{ maxWidth: 920 }}>
          {/* Header */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 10 }}>
            <div style={cell('160px')}>
              <label style={labelStyle}>Type</label>
              <select style={inputStyle} value={dvType} onChange={(e) => setDvType(e.target.value)}>
                {DV_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div style={cell('160px')}>
              <label style={labelStyle}>DV Date</label>
              <input
                style={inputStyle}
                type="date"
                value={dvDate}
                onChange={(e) => setDvDate(e.target.value)}
              />
            </div>
            {manualNumbering && (
              <div style={cell('180px')}>
                <label style={labelStyle}>DV Number</label>
                <input
                  style={inputStyle}
                  value={dvNumber}
                  onChange={(e) => setDvNumber(e.target.value)}
                  placeholder="e.g. DV-2026-01-001"
                  required
                />
              </div>
            )}
            <div style={cell('220px')}>
              <label style={labelStyle}>Fund Cluster</label>
              <select
                style={inputStyle}
                value={fundSourceId}
                onChange={(e) => setFundSourceId(e.target.value)}
              >
                <option value="">— None —</option>
                {fundSources.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.code} — {f.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 10 }}>
            <div style={cell('280px')}>
              <label style={labelStyle}>Payee *</label>
              <PayeeCombobox
                name={payeeName}
                onNameChange={setPayeeName}
                onPick={(p) => {
                  setPayeeName(p.name);
                  setPayeeTin(p.tin ?? '');
                  setPayeeAddress(p.address ?? '');
                }}
                inputStyle={inputStyle}
                placeholder="Type or select a payee…"
              />
            </div>
            <div style={cell('150px')}>
              <label style={labelStyle}>Payee TIN / ID</label>
              <input
                style={inputStyle}
                value={payeeTin}
                onChange={(e) => setPayeeTin(e.target.value)}
              />
            </div>
            <div style={cell('280px')}>
              <label style={labelStyle}>Payee Address</label>
              <input
                style={inputStyle}
                value={payeeAddress}
                onChange={(e) => setPayeeAddress(e.target.value)}
              />
            </div>
          </div>

          <div style={{ marginBottom: 10 }}>
            <label style={labelStyle}>Particulars *</label>
            <textarea
              style={{ ...inputStyle, minHeight: 42, resize: 'vertical' }}
              value={particulars}
              onChange={(e) => setParticulars(e.target.value)}
              placeholder="Nature of the disbursement"
            />
          </div>

          {/* Payment */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 10 }}>
            <div style={cell('300px')}>
              <label style={labelStyle}>
                Bank Name &amp; Account *{' '}
                <span style={{ fontWeight: 400, color: '#667085' }}>(account credited)</span>
              </label>
              <select
                style={inputStyle}
                value={bankAccountId}
                onChange={(e) => setBankAccountId(e.target.value)}
              >
                <option value="">Select paying bank account...</option>
                {bankAccounts.map((b) => (
                  <option key={b.id} value={b.id}>
                    {bankAccountLabel(b)}
                  </option>
                ))}
              </select>
              {bank?.chartOfAccount && (
                <div style={{ fontSize: 11, color: '#667085', marginTop: 4 }}>
                  Credits{' '}
                  <span style={{ fontFamily: 'monospace' }}>{bank.chartOfAccount.accountCode}</span>{' '}
                  — {bank.chartOfAccount.name}
                </div>
              )}
            </div>
            <div style={cell('200px')}>
              <label style={labelStyle}>Mode of Payment</label>
              <select
                style={inputStyle}
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value)}
              >
                <option value="check">MDS Check</option>
                <option value="ada">Commercial Check / ADA</option>
                <option value="others">Others</option>
              </select>
            </div>
          </div>
          {paymentMode === 'check' && (
            <p style={{ fontSize: 12, color: '#667085', marginTop: -4, marginBottom: 0 }}>
              A check payment raises a <strong>pending check</strong> in the Check Register. The
              cashier assigns the check number and prints it — the accountant does not enter a check
              number here.
            </p>
          )}
        </div>
        {/* End compact header */}

        {/* Accounting entry (charges + deductions) — the main working area */}
        <div
          style={{
            marginTop: 16,
            border: '1px solid #e4e7ec',
            borderRadius: 10,
            padding: '14px 16px',
            background: '#fcfcfd',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 4,
            }}
          >
            <h2 style={{ fontSize: 15, margin: 0 }}>Accounting Entry — charges &amp; deductions</h2>
            <button type="button" className="acct-btn acct-btn--primary" onClick={addLine}>
              + Add Line
            </button>
          </div>
          <p style={{ fontSize: 12, color: '#667085', margin: '0 0 10px' }}>
            Debit the accounts charged; credit any amounts withheld (e.g. tax). Do{' '}
            <strong>not</strong> add the bank — its net credit is posted for you.
          </p>
          <table className="acct-table" style={{ width: '100%', tableLayout: 'fixed' }}>
            <thead>
              <tr>
                <th style={{ width: '34%' }}>Account</th>
                <th style={{ width: '13%', textAlign: 'right' }}>Debit</th>
                <th style={{ width: '13%', textAlign: 'right' }}>Credit</th>
                <th style={{ width: '32%' }}>Description</th>
                <th style={{ width: '8%' }}></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, idx) => (
                <tr key={idx}>
                  <td>
                    <AccountCombobox
                      accounts={accounts}
                      value={l.chartOfAccountId}
                      onChange={(id) => updateLine(idx, 'chartOfAccountId', id)}
                    />
                  </td>
                  <td>
                    <input
                      style={{ ...inputStyle, textAlign: 'right' }}
                      type="number"
                      step="0.01"
                      min="0"
                      value={l.debitAmount}
                      onChange={(e) => updateLine(idx, 'debitAmount', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      style={{ ...inputStyle, textAlign: 'right' }}
                      type="number"
                      step="0.01"
                      min="0"
                      value={l.creditAmount}
                      onChange={(e) => updateLine(idx, 'creditAmount', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      style={{ ...inputStyle, fontSize: 12 }}
                      value={l.description}
                      onChange={(e) => updateLine(idx, 'description', e.target.value)}
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="acct-btn"
                      disabled={lines.length <= 1}
                      onClick={() => removeLine(idx)}
                      title="Remove line"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
              {/* Auto cash credit preview */}
              {bank?.chartOfAccount && net > 0 && (
                <tr style={{ background: '#f8fafc' }}>
                  <td style={{ fontStyle: 'italic', color: '#475467' }}>
                    {bank.chartOfAccount.accountCode} — {bank.chartOfAccount.name}
                    <span style={{ color: '#98a2b3' }}> (auto)</span>
                  </td>
                  <td></td>
                  <td className="acct-text-right acct-text-mono" style={{ fontStyle: 'italic' }}>
                    {peso(net)}
                  </td>
                  <td style={{ color: '#98a2b3', fontSize: 12 }}>Cash credited to bank</td>
                  <td></td>
                </tr>
              )}
            </tbody>
          </table>

          <button
            type="button"
            className="acct-btn acct-btn--sm"
            onClick={addLine}
            style={{ marginTop: 8 }}
          >
            + Add Line
          </button>

          {/* Summary */}
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginTop: 14, fontSize: 13 }}>
            <div>
              <span style={{ color: '#667085' }}>Total charges (Dr): </span>
              <strong>{peso(totalDebit)}</strong>
            </div>
            <div>
              <span style={{ color: '#667085' }}>Less deductions (Cr): </span>
              <strong>{peso(totalCredit)}</strong>
            </div>
            <div>
              <span style={{ color: '#667085' }}>Net paid from bank: </span>
              <strong style={{ color: net > 0 ? '#067647' : '#b42318' }}>{peso(net)}</strong>
            </div>
          </div>
          {totalDebit > 0 && net <= 0 && (
            <div style={{ color: '#b42318', fontSize: 12, marginTop: 6 }}>
              The net payable must be greater than zero (deductions can’t meet or exceed the
              charges).
            </div>
          )}
        </div>
        {/* End accounting entry */}

        {/* Supporting documents (attached after the DV is created) */}
        {!isEdit && (
          <div style={{ marginTop: 16 }}>
            <h2 style={{ fontSize: 15, margin: '0 0 6px' }}>Supporting Documents</h2>
            <p style={{ fontSize: 12, color: '#667085', margin: '0 0 8px' }}>
              Optionally attach receipts, invoices, or other supporting files (PDF, PNG, JPEG · up
              to 10 MB each). They’re saved to the voucher when you create it.
            </p>
            <label className="acct-btn acct-btn--sm" style={{ cursor: 'pointer' }}>
              ＋ Choose files
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                multiple
                style={{ display: 'none' }}
                onChange={(e) => {
                  if (e.target.files)
                    setAttachFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
                  e.target.value = '';
                }}
              />
            </label>
            {attachFiles.length > 0 && (
              <ul style={{ listStyle: 'none', padding: 0, margin: '10px 0 0' }}>
                {attachFiles.map((f, i) => (
                  <li
                    key={`${f.name}-${i}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '6px 0',
                      fontSize: 13,
                    }}
                  >
                    <span>{f.type === 'application/pdf' ? '📄' : '🖼️'}</span>
                    <span>{f.name}</span>
                    <span style={{ color: '#667085', fontSize: 12 }}>
                      {(f.size / 1024).toFixed(1)} KB
                    </span>
                    <button
                      type="button"
                      onClick={() => setAttachFiles((prev) => prev.filter((_, j) => j !== i))}
                      title="Remove"
                      style={{
                        marginLeft: 'auto',
                        color: '#b42318',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                      }}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
          {isEdit ? (
            <button
              type="button"
              className="acct-btn acct-btn--primary"
              disabled={!canSubmit || saving !== false}
              onClick={() => submit(true)}
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          ) : (
            <>
              <button
                type="button"
                className="acct-btn acct-btn--primary"
                disabled={!canSubmit || saving !== false}
                onClick={() => submit(false)}
              >
                {saving === 'post' ? 'Posting...' : 'Create & Post DV'}
              </button>
              <button
                type="button"
                className="acct-btn"
                disabled={!canSubmit || saving !== false}
                onClick={() => submit(true)}
              >
                {saving === 'draft' ? 'Saving...' : 'Save as Draft'}
              </button>
            </>
          )}
          <button
            type="button"
            className="acct-btn"
            onClick={() => navigate('/accounting/disbursements')}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
