import { useEffect, useState } from 'react';

import { getCashActivity, getGlFiscalYears, getGlPeriods } from '../../accounting/api';
import type { CashActivityResult, FiscalYearOption, PeriodOption } from '../../accounting/types';
import { formatPeso } from '../../budgeting/format-peso';

/** Cash / Bank Activity — opening, receipts, disbursements and closing per cash account. */
export function CashBankActivityPage() {
  const [fiscalYears, setFiscalYears] = useState<FiscalYearOption[]>([]);
  const [periods, setPeriods] = useState<PeriodOption[]>([]);
  const [fy, setFy] = useState('');
  const [period, setPeriod] = useState('');
  const [data, setData] = useState<CashActivityResult | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getGlFiscalYears().then((f) => {
      setFiscalYears(f);
      if (f.length) setFy(f[0]!.id);
    });
  }, []);

  useEffect(() => {
    if (!fy) return;
    setPeriod('');
    getGlPeriods(fy).then(setPeriods);
  }, [fy]);

  useEffect(() => {
    if (!fy) return;
    setData(null);
    setError('');
    const params = new URLSearchParams({ fiscalYearId: fy });
    if (period) params.set('periodId', period);
    getCashActivity(params.toString())
      .then((d) => {
        setData(d);
        setPeriod((prev) => prev || d.period.id);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load.'));
  }, [fy, period]);

  return (
    <div>
      <h2>Cash / Bank Activity</h2>
      <p className="reports-subtitle">
        Movement of every cash &amp; cash-equivalents account for the month — opening balance,
        receipts, disbursements, and closing balance, from posted journal entries.
      </p>

      <div className="reports-filters">
        <label htmlFor="ca-fy">Fiscal Year</label>
        <select id="ca-fy" value={fy} onChange={(e) => setFy(e.target.value)}>
          {fiscalYears.map((f) => (
            <option key={f.id} value={f.id}>
              FY {f.year} — {f.name}
            </option>
          ))}
        </select>
        <label htmlFor="ca-period">Month</label>
        <select id="ca-period" value={period} onChange={(e) => setPeriod(e.target.value)}>
          {periods.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {error && <div className="reports-error">{error}</div>}
      {!data && !error && <div className="reports-loading">Loading…</div>}
      {data && data.accounts.length === 0 && (
        <div className="reports-empty">No cash activity for {data.period.name}.</div>
      )}
      {data && data.accounts.length > 0 && (
        <div className="reports-table-wrap">
          <table className="reports-table">
            <thead>
              <tr>
                <th>Account</th>
                <th className="num">Opening Balance</th>
                <th className="num">Receipts</th>
                <th className="num">Disbursements</th>
                <th className="num">Closing Balance</th>
              </tr>
            </thead>
            <tbody>
              {data.accounts.map((a) => (
                <tr key={a.code}>
                  <td>
                    <span className="code">{a.code}</span> {a.name}
                  </td>
                  <td className="num">{formatPeso(a.opening)}</td>
                  <td className="num">{formatPeso(a.receipts)}</td>
                  <td className="num">{formatPeso(a.disbursements)}</td>
                  <td className="num">{formatPeso(a.closing)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Total — {data.period.name}</td>
                <td className="num">{formatPeso(data.totals.opening)}</td>
                <td className="num">{formatPeso(data.totals.receipts)}</td>
                <td className="num">{formatPeso(data.totals.disbursements)}</td>
                <td className="num">{formatPeso(data.totals.closing)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
