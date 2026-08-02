import { useEffect, useState } from 'react';

import { getPayrollPeriods, getRemittanceSummary, getRemittanceAgencyDetail, HrApiError } from '../api';
import type { PayrollPeriod, RemittanceSummary, RemittanceAgencyDetail } from '../types';
import HrSubNav from './HrSubNav';
import './hr.css';

function formatPeso(val: number) {
  return val.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
}

export default function RemittancePage() {
  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [filterPeriodId, setFilterPeriodId] = useState('');
  const [summary, setSummary] = useState<RemittanceSummary | null>(null);
  const [agencyDetail, setAgencyDetail] = useState<RemittanceAgencyDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { getPayrollPeriods().then(setPeriods).catch(() => {}); }, []);

  useEffect(() => {
    setLoading(true); setError(''); setAgencyDetail(null);
    const params = filterPeriodId ? `payrollPeriodId=${filterPeriodId}` : undefined;
    getRemittanceSummary(params)
      .then(setSummary)
      .catch((e) => setError(e instanceof HrApiError ? e.message : 'Failed.'))
      .finally(() => setLoading(false));
  }, [filterPeriodId]);

  function viewAgency(code: string) {
    setLoading(true); setError('');
    const params = filterPeriodId ? `payrollPeriodId=${filterPeriodId}` : undefined;
    getRemittanceAgencyDetail(code, params)
      .then(setAgencyDetail)
      .catch((e) => setError(e instanceof HrApiError ? e.message : 'Failed.'))
      .finally(() => setLoading(false));
  }

  return (
    <div className="hr-page">
      <HrSubNav />
      <div className="hr-toolbar">
        <div className="hr-toolbar__filters">
          <select value={filterPeriodId} onChange={(e) => setFilterPeriodId(e.target.value)} style={{ padding: '6px 10px' }}>
            <option value="">All Periods</option>
            {periods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      </div>

      {error && <div className="hr-error">{error}</div>}
      {loading && <p>Loading...</p>}

      {/* Agency detail view */}
      {agencyDetail && (
        <>
          <div className="hr-toolbar" style={{ marginTop: 0 }}>
            <button type="button" className="hr-btn" onClick={() => setAgencyDetail(null)}>&larr; Back to Summary</button>
            <h3 style={{ margin: 0 }}>{agencyDetail.agencyName} — Employee Breakdown</h3>
          </div>
          {agencyDetail.records.length === 0 && <div className="hr-empty">No records found.</div>}
          {agencyDetail.records.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table className="hr-table">
                <thead>
                  <tr>
                    <th>Employee #</th><th>Name</th><th>Membership #</th><th>Period</th>
                    <th style={{ textAlign: 'right' }}>EE Share</th>
                    <th style={{ textAlign: 'right' }}>ER Share</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {agencyDetail.records.map((r, i) => (
                    <tr key={i}>
                      <td className="hr-text-mono">{r.employeeNumber}</td>
                      <td>{r.employeeName}</td>
                      <td className="hr-text-mono">{r.membershipNumber ?? '--'}</td>
                      <td>{r.periodName}</td>
                      <td className="hr-text-mono" style={{ textAlign: 'right' }}>{formatPeso(r.employeeShare)}</td>
                      <td className="hr-text-mono" style={{ textAlign: 'right' }}>{formatPeso(r.employerShare)}</td>
                      <td className="hr-text-mono" style={{ textAlign: 'right', fontWeight: 600 }}>{formatPeso(r.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ fontWeight: 700 }}>
                    <td colSpan={4}>TOTAL</td>
                    <td className="hr-text-mono" style={{ textAlign: 'right' }}>{formatPeso(agencyDetail.records.reduce((s, r) => s + r.employeeShare, 0))}</td>
                    <td className="hr-text-mono" style={{ textAlign: 'right' }}>{formatPeso(agencyDetail.records.reduce((s, r) => s + r.employerShare, 0))}</td>
                    <td className="hr-text-mono" style={{ textAlign: 'right' }}>{formatPeso(agencyDetail.records.reduce((s, r) => s + r.total, 0))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      )}

      {/* Summary view */}
      {!agencyDetail && !loading && summary && (
        <>
          {summary.runs.length > 0 && (
            <div style={{ marginBottom: 16, fontSize: 13, color: '#475467' }}>
              Based on {summary.runs.length} payroll run(s): {summary.runs.map((r) => r.runNumber).join(', ')}
            </div>
          )}

          {summary.agencies.length === 0 && (
            <div className="hr-empty">No remittance data found. Compute a payroll run first to generate deduction data.</div>
          )}

          {summary.agencies.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
              {summary.agencies.map((a) => (
                <div key={a.code} className="hr-form" style={{ padding: 16, cursor: 'pointer' }} onClick={() => viewAgency(a.code)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <h3 style={{ margin: 0, fontSize: 16 }}>{a.name}</h3>
                    <span className="hr-badge hr-badge--permanent">{a.employeeCount} employees</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 13 }}>
                    <div>
                      <div style={{ color: '#98a2b3', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>Employee Share</div>
                      <div className="hr-text-mono" style={{ fontSize: 15, fontWeight: 600 }}>{formatPeso(a.totalEmployee)}</div>
                    </div>
                    <div>
                      <div style={{ color: '#98a2b3', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>Employer Share</div>
                      <div className="hr-text-mono" style={{ fontSize: 15, fontWeight: 600 }}>{formatPeso(a.totalEmployer)}</div>
                    </div>
                  </div>
                  <div style={{ marginTop: 12, paddingTop: 8, borderTop: '1px solid #e4e7ec', textAlign: 'right' }}>
                    <span style={{ fontSize: 12, color: '#98a2b3' }}>Total: </span>
                    <span className="hr-text-mono" style={{ fontSize: 16, fontWeight: 700, color: '#344054' }}>{formatPeso(a.totalEmployee + a.totalEmployer)}</span>
                  </div>
                  <div style={{ marginTop: 8, fontSize: 11, color: '#6941c6', textAlign: 'right' }}>Click for details &rarr;</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
