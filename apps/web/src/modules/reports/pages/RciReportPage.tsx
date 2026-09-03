import { useEffect, useMemo, useState } from 'react';

import { useAuth } from '../../../app/auth';
import { signatoryFor } from '../../../app/signatories';
import { getCheckRci, getChecks } from '../../accounting/api';
import { downloadRciCsv, downloadRciPdf } from '../../accounting/rci-report';
import '../../accounting/pages/accounting.css';
import type { CheckListItem } from '../../accounting/types';

const FUND_CLUSTERS = ['Corporate Operating Budget'];

const ctl: React.CSSProperties = {
  padding: '6px 8px',
  border: '1px solid #d0d5dd',
  borderRadius: 6,
  fontSize: 13,
  boxSizing: 'border-box',
};
const lbl: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: '#344054',
  marginBottom: 3,
};

/**
 * Report of Checks Issued (COA Appendix 35) — the cashier's monthly report of
 * the checks they issued, keyed off the DV date. Bank options come from the
 * cashier's own check register (they can't list bank accounts directly).
 */
export function RciReportPage() {
  const { organization } = useAuth();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [fund, setFund] = useState(FUND_CLUSTERS[0]!);
  const [bank, setBank] = useState('');
  const [checks, setChecks] = useState<CheckListItem[]>([]);
  const [busy, setBusy] = useState<'csv' | 'pdf' | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getChecks()
      .then(setChecks)
      .catch(() => {
        /* bank list is best-effort */
      });
  }, []);

  const bankOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of checks) {
      map.set(c.bankAccount.id, `${c.bankAccount.bank.name} — ${c.bankAccount.accountName}`);
    }
    return [...map.entries()].map(([id, label]) => ({ id, label }));
  }, [checks]);

  async function download(format: 'csv' | 'pdf') {
    if (!month) return;
    setBusy(format);
    setError('');
    try {
      const report = await getCheckRci(month, {
        ...(bank ? { bankAccountId: bank } : {}),
        ...(fund ? { fundCluster: fund } : {}),
      });
      if (report.rows.length === 0) {
        setError('No checks were issued for the selected month and bank account.');
        return;
      }
      const sig = signatoryFor(organization?.signatories, 'rci', 'disbursingOfficer');
      if (format === 'csv') downloadRciCsv(report, sig);
      else downloadRciPdf(report, sig);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not generate the report.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <h2>Report of Checks Issued</h2>
      <p className="reports-subtitle">
        COA Appendix 35 — the monthly report of checks issued by the cashier, for submission to COA.
        The month is keyed off the Disbursement Voucher date. Pick the month, fund cluster and bank
        account, then download in CSV or PDF (the file follows the prescribed Appendix 35 layout).
      </p>

      {error && (
        <div className="reports-error" style={{ marginBottom: 12 }}>
          {error}
        </div>
      )}

      <div
        style={{
          border: '1px solid #e4e7ec',
          borderRadius: 10,
          background: '#fcfcfd',
          padding: '14px 16px',
          display: 'flex',
          gap: 16,
          alignItems: 'flex-end',
          flexWrap: 'wrap',
          maxWidth: 900,
        }}
      >
        <label style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={lbl}>Month covered</span>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            style={ctl}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={lbl}>Fund Cluster</span>
          <select value={fund} onChange={(e) => setFund(e.target.value)} style={ctl}>
            {FUND_CLUSTERS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={lbl}>Bank Name/Account No.</span>
          <select
            value={bank}
            onChange={(e) => setBank(e.target.value)}
            style={{ ...ctl, minWidth: 240 }}
          >
            <option value="">All bank accounts</option>
            {bankOptions.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="acct-btn acct-btn--sm"
          disabled={busy !== null || !month}
          onClick={() => download('csv')}
        >
          {busy === 'csv' ? 'Generating…' : '⭳ CSV'}
        </button>
        <button
          type="button"
          className="acct-btn acct-btn--sm acct-btn--primary"
          disabled={busy !== null || !month}
          onClick={() => download('pdf')}
        >
          {busy === 'pdf' ? 'Generating…' : '⭳ PDF'}
        </button>
      </div>
    </div>
  );
}
