import { useState } from 'react';

import type { ChartOfAccount } from '../types';

import { AccountCombobox } from './AccountCombobox';

const round2 = (n: number) => Math.round(n * 100) / 100;
const peso = (n: number) => n.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });

// Expanded-withholding-tax rate by the nature of the transaction (per BIR / the
// reference computations).
const NATURES = [
  { key: 'goods', label: 'Purchase of goods', ewt: 0.01 },
  { key: 'services', label: 'Purchase of services', ewt: 0.02 },
  { key: 'rent', label: 'Rent', ewt: 0.05 },
  { key: 'professional', label: 'Professional fees', ewt: 0.1 },
] as const;

// Standard UACS codes for the withholding payables.
const EWT_CODE = '2-02-01-010-02'; // Due to BIR - Expanded Withholding Tax
const GVAT_CODE = '2-02-01-010-04'; // Due to BIR - Withholding Tax on GMP - VAT (5%)
const PCT_CODE = '2-02-01-010-03'; // Due to BIR - Withholding Tax on GMP - Percentage (3%)

export interface WhtRow {
  chartOfAccountId: string;
  debit: string;
  credit: string;
  description: string;
}

/**
 * Withholding-tax assistant: the user indicates whether the payee is
 * VAT-registered and the nature of the payment (goods / services / rent /
 * professional fees); this computes the expanded withholding tax and the
 * government VAT (5%) or percentage tax (3%) and maps them to the accounting
 * entry. VAT-registered payees are taxed on the amount NET of VAT (÷1.12).
 *
 * Two input modes:
 *  • Invoice amount — tax is deducted from the amount (payee receives net).
 *  • Net payable — the amount is grossed up so the payee nets it (matches the
 *    reference workbook's "gross-up" entries).
 */
export function WithholdingTaxAssistant({
  accounts,
  onApply,
}: {
  accounts: ChartOfAccount[];
  onApply: (rows: WhtRow[]) => void;
}) {
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState<'invoice' | 'grossup'>('invoice');
  const [vatReg, setVatReg] = useState(false);
  const [nature, setNature] = useState<(typeof NATURES)[number]['key']>('services');
  const [expenseId, setExpenseId] = useState('');

  const byCode = (code: string) => accounts.find((a) => a.accountCode === code);
  const ewtAcct = byCode(EWT_CODE);
  const otherAcct = vatReg ? byCode(GVAT_CODE) : byCode(PCT_CODE);

  const ewtRate = NATURES.find((n) => n.key === nature)!.ewt;
  const otherRate = vatReg ? 0.05 : 0.03; // final VAT (GMP) vs percentage tax
  const amt = parseFloat(amount) || 0;

  let base = 0;
  let expense = 0;
  let cash = 0;
  if (amt > 0) {
    if (mode === 'grossup') {
      base = vatReg ? amt / (1.12 - ewtRate - otherRate) : amt / (1 - ewtRate - otherRate);
      expense = vatReg ? base * 1.12 : base;
      cash = amt;
    } else {
      base = vatReg ? amt / 1.12 : amt;
      expense = amt;
      cash = expense - base * ewtRate - base * otherRate;
    }
  }
  const ewt = round2(base * ewtRate);
  const other = round2(base * otherRate);
  base = round2(base);
  expense = round2(expense);
  cash = round2(cash);

  const missing = !ewtAcct || !otherAcct;
  const canApply = amt > 0 && !!expenseId && !missing && cash > 0;
  const otherLabel = vatReg ? 'Final VAT withheld (GMP, 5%)' : 'Percentage tax withheld (GMP, 3%)';

  function apply() {
    if (!canApply) return;
    const natLabel = NATURES.find((n) => n.key === nature)!.label;
    const rows: WhtRow[] = [
      {
        chartOfAccountId: expenseId,
        debit: String(expense),
        credit: '',
        description: `${natLabel}${vatReg ? ' — VAT-registered' : ''}`,
      },
      {
        chartOfAccountId: ewtAcct!.id,
        debit: '',
        credit: String(ewt),
        description: `EWT ${(ewtRate * 100).toFixed(0)}% on ${peso(base)}`,
      },
      {
        chartOfAccountId: otherAcct!.id,
        debit: '',
        credit: String(other),
        description: otherLabel,
      },
    ];
    onApply(rows);
  }

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

  return (
    <div
      style={{
        border: '1px solid #d0d5dd',
        borderRadius: 10,
        padding: '14px 16px',
        background: '#f9fafb',
        marginTop: 16,
      }}
    >
      <h2 style={{ fontSize: 15, margin: '0 0 4px' }}>Withholding Tax Assistant</h2>
      <p style={{ fontSize: 12, color: '#667085', margin: '0 0 12px' }}>
        Indicate the payee&apos;s VAT status and the nature of the payment — the expanded
        withholding tax and the government VAT / percentage tax are computed and posted to the
        accounting entry. VAT-registered payees are taxed on the amount net of VAT.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 10 }}>
        <div style={{ flex: '1 1 180px', minWidth: 0 }}>
          <label style={labelStyle}>Amount</label>
          <input
            style={inputStyle}
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
          />
        </div>
        <div style={{ flex: '1 1 220px', minWidth: 0 }}>
          <label style={labelStyle}>This amount is the…</label>
          <select
            style={inputStyle}
            value={mode}
            onChange={(e) => setMode(e.target.value as 'invoice' | 'grossup')}
          >
            <option value="invoice">Invoice amount (deduct tax)</option>
            <option value="grossup">Net payable to payee (gross up)</option>
          </select>
        </div>
        <div style={{ flex: '1 1 220px', minWidth: 0 }}>
          <label style={labelStyle}>Nature of payment</label>
          <select
            style={inputStyle}
            value={nature}
            onChange={(e) => setNature(e.target.value as (typeof NATURES)[number]['key'])}
          >
            {NATURES.map((n) => (
              <option key={n.key} value={n.key}>
                {n.label} — EWT {(n.ewt * 100).toFixed(0)}%
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 13,
            fontWeight: 600,
            color: '#344054',
            flex: '0 0 auto',
            paddingBottom: 8,
          }}
        >
          <input type="checkbox" checked={vatReg} onChange={(e) => setVatReg(e.target.checked)} />
          Payee is VAT-registered
        </label>
        <div style={{ flex: '1 1 320px', minWidth: 0 }}>
          <label style={labelStyle}>Account charged (expense / asset)</label>
          <AccountCombobox accounts={accounts} value={expenseId} onChange={setExpenseId} />
        </div>
      </div>

      {/* Computed breakdown */}
      {amt > 0 && (
        <table
          className="acct-table"
          style={{ width: '100%', marginTop: 14, maxWidth: 560, fontSize: 13 }}
        >
          <tbody>
            <tr>
              <td>Tax base {vatReg ? '(net of 12% VAT)' : ''}</td>
              <td className="acct-text-right acct-text-mono">{peso(base)}</td>
            </tr>
            <tr>
              <td>Expense charged (Dr)</td>
              <td className="acct-text-right acct-text-mono">{peso(expense)}</td>
            </tr>
            <tr style={{ color: '#b42318' }}>
              <td>Less: EWT {(ewtRate * 100).toFixed(0)}% (Cr)</td>
              <td className="acct-text-right acct-text-mono">({peso(ewt)})</td>
            </tr>
            <tr style={{ color: '#b42318' }}>
              <td>Less: {otherLabel} (Cr)</td>
              <td className="acct-text-right acct-text-mono">({peso(other)})</td>
            </tr>
            <tr style={{ fontWeight: 700, borderTop: '2px solid var(--mswd-navy)' }}>
              <td>Net paid to payee</td>
              <td className="acct-text-right acct-text-mono">{peso(cash)}</td>
            </tr>
          </tbody>
        </table>
      )}

      {missing && (
        <div className="acct-error" style={{ marginTop: 10, fontSize: 12 }}>
          The withholding-tax payable accounts ({EWT_CODE}, {vatReg ? GVAT_CODE : PCT_CODE}) are not
          in the chart of accounts. Add them to use this assistant.
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        <button
          type="button"
          className="acct-btn acct-btn--primary"
          disabled={!canApply}
          onClick={apply}
          title={!expenseId ? 'Choose the account charged first' : ''}
        >
          Apply to accounting entry
        </button>
      </div>
    </div>
  );
}
