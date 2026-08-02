import { useState } from 'react';

import { useAuth } from '../../../app/auth';
import {
  BillingApiError, getAgingReport, getBillingSummary,
  getCollectionSummary, getConsumerLedger, getConsumers,
} from '../api';
import type { ConsumerListItem } from '../types';
import BillingSubNav from './BillingSubNav';
import './billing.css';

function formatPeso(val: string | number) {
  const num = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(num)) return '--';
  return num.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
}

type ReportType = 'collection' | 'aging' | 'ledger' | 'summary';

export default function BillingReportsPage() {
  const { hasPermission } = useAuth();
  if (!hasPermission('billing.reports')) {
    return <div className="bill-page"><BillingSubNav /><div className="bill-error">You do not have access to billing reports.</div></div>;
  }

  const [reportType, setReportType] = useState<ReportType>('collection');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<Record<string, unknown> | null>(null);

  const [startDate, setStartDate] = useState(() => {
    const d = new Date(); d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));

  const [consumerSearch, setConsumerSearch] = useState('');
  const [consumers, setConsumers] = useState<ConsumerListItem[]>([]);
  const [selectedConsumerId, setSelectedConsumerId] = useState('');

  async function runReport() {
    setLoading(true); setError(''); setData(null);
    try {
      let result: unknown;
      switch (reportType) {
        case 'collection':
          result = await getCollectionSummary(startDate, endDate);
          break;
        case 'aging':
          result = await getAgingReport();
          break;
        case 'ledger':
          if (!selectedConsumerId) { setError('Select a consumer.'); setLoading(false); return; }
          result = await getConsumerLedger(selectedConsumerId);
          break;
        case 'summary':
          result = await getBillingSummary();
          break;
      }
      setData(result as Record<string, unknown>);
    } catch (err) {
      setError(err instanceof BillingApiError ? err.message : 'Failed to generate report.');
    } finally { setLoading(false); }
  }

  async function searchConsumers(q: string) {
    setConsumerSearch(q);
    if (q.length < 2) { setConsumers([]); return; }
    try {
      const all = await getConsumers();
      setConsumers(all.filter((c) =>
        c.accountNumber.toLowerCase().includes(q.toLowerCase()) ||
        `${c.lastName}, ${c.firstName}`.toLowerCase().includes(q.toLowerCase()),
      ).slice(0, 15));
    } catch { setConsumers([]); }
  }

  return (
    <div className="bill-page">
      <BillingSubNav />
      <h1>Billing Reports</h1>

      <div className="bill-toolbar">
        <select value={reportType} onChange={(e) => { setReportType(e.target.value as ReportType); setData(null); }}
          style={{ padding: '8px 12px', borderRadius: '6px', border: '1.5px solid #d0d5dd', fontSize: '13px' }}>
          <option value="collection">Collection Summary</option>
          <option value="aging">Aging Report</option>
          <option value="ledger">Consumer Ledger</option>
          <option value="summary">Billing Summary</option>
        </select>
      </div>

      <div className="bill-form" style={{ marginBottom: '20px' }}>
        {(reportType === 'collection') && (
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
            <div className="bill-field" style={{ marginBottom: 0 }}>
              <label>Start Date</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="bill-field" style={{ marginBottom: 0 }}>
              <label>End Date</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <button type="button" className="bill-btn bill-btn--primary" onClick={runReport} disabled={loading}>
              {loading ? 'Loading...' : 'Generate'}
            </button>
          </div>
        )}

        {reportType === 'aging' && (
          <button type="button" className="bill-btn bill-btn--primary" onClick={runReport} disabled={loading}>
            {loading ? 'Loading...' : 'Generate Aging Report'}
          </button>
        )}

        {reportType === 'summary' && (
          <button type="button" className="bill-btn bill-btn--primary" onClick={runReport} disabled={loading}>
            {loading ? 'Loading...' : 'Generate Billing Summary'}
          </button>
        )}

        {reportType === 'ledger' && (
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div className="bill-field" style={{ marginBottom: 0, minWidth: '250px' }}>
              <label>Consumer</label>
              <input placeholder="Search by account # or name..." value={consumerSearch}
                onChange={(e) => searchConsumers(e.target.value)} />
            </div>
            {consumers.length > 0 && (
              <select value={selectedConsumerId} onChange={(e) => setSelectedConsumerId(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: '6px', border: '1.5px solid #d0d5dd', fontSize: '13px' }}>
                <option value="">Select...</option>
                {consumers.map((c) => (
                  <option key={c.id} value={c.id}>{c.accountNumber} — {c.lastName}, {c.firstName}</option>
                ))}
              </select>
            )}
            <button type="button" className="bill-btn bill-btn--primary" onClick={runReport}
              disabled={loading || !selectedConsumerId}>
              {loading ? 'Loading...' : 'Generate Ledger'}
            </button>
          </div>
        )}
      </div>

      {error && <div className="bill-error">{error}</div>}

      {data && reportType === 'collection' && <CollectionReport data={data} />}
      {data && reportType === 'aging' && <AgingReport data={data} />}
      {data && reportType === 'ledger' && <LedgerReport data={data} />}
      {data && reportType === 'summary' && <SummaryReport data={data} />}
    </div>
  );
}

function CollectionReport({ data }: { data: Record<string, unknown> }) {
  const d = data as {
    startDate: string; endDate: string; totalCollected: number; paymentCount: number;
    byMethod: Array<{ method: string; amount: number }>;
    byCashier: Array<{ cashier: string; amount: number }>;
    payments: Array<{ orNumber: string; paymentDate: string; consumer: string; amount: string; method: string; cashier: string; bills: string }>;
  };
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '20px' }}>
        <div style={{ background: '#ecfdf3', padding: '16px', borderRadius: '8px', textAlign: 'center' }}>
          <div style={{ fontSize: '12px', color: '#067647', fontWeight: 600, textTransform: 'uppercase' }}>Total Collected</div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#067647', fontVariantNumeric: 'tabular-nums' }}>{formatPeso(d.totalCollected)}</div>
        </div>
        <div style={{ background: '#eff8ff', padding: '16px', borderRadius: '8px', textAlign: 'center' }}>
          <div style={{ fontSize: '12px', color: '#175cd3', fontWeight: 600, textTransform: 'uppercase' }}>Payments</div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#175cd3' }}>{d.paymentCount}</div>
        </div>
        <div style={{ background: '#f8f9fc', padding: '16px', borderRadius: '8px' }}>
          <div style={{ fontSize: '12px', color: '#475467', fontWeight: 600, textTransform: 'uppercase', marginBottom: '6px' }}>By Method</div>
          {d.byMethod.map((m) => (
            <div key={m.method} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
              <span style={{ textTransform: 'capitalize' }}>{m.method.replace('_', ' ')}</span>
              <span className="bill-text-mono">{formatPeso(m.amount)}</span>
            </div>
          ))}
        </div>
      </div>
      {d.payments.length > 0 && (
        <table className="bill-table">
          <thead>
            <tr><th>OR #</th><th>Date</th><th>Consumer</th><th>Amount</th><th>Method</th><th>Cashier</th><th>Bills</th></tr>
          </thead>
          <tbody>
            {d.payments.map((p) => (
              <tr key={p.orNumber}>
                <td className="bill-text-mono">{p.orNumber}</td>
                <td>{new Date(p.paymentDate).toLocaleDateString()}</td>
                <td>{p.consumer}</td>
                <td className="bill-text-mono" style={{ fontWeight: 600 }}>{formatPeso(p.amount)}</td>
                <td style={{ textTransform: 'capitalize' }}>{p.method.replace('_', ' ')}</td>
                <td>{p.cashier}</td>
                <td className="bill-text-mono">{p.bills}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function AgingReport({ data }: { data: Record<string, unknown> }) {
  const d = data as {
    totalOutstanding: number; billCount: number;
    summary: Array<{ bracket: string; count: number; total: number }>;
    bills: Array<{ accountNumber: string; consumer: string; billNumber: string; period: string; balance: string; daysOverdue: number; bracket: string }>;
  };
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        <div style={{ background: '#fef3f2', padding: '14px', borderRadius: '8px', textAlign: 'center' }}>
          <div style={{ fontSize: '11px', color: '#b42318', fontWeight: 600, textTransform: 'uppercase' }}>Total Outstanding</div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: '#b42318', fontVariantNumeric: 'tabular-nums' }}>{formatPeso(d.totalOutstanding)}</div>
        </div>
        {d.summary.map((s) => (
          <div key={s.bracket} style={{ background: '#f8f9fc', padding: '14px', borderRadius: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: '11px', color: '#475467', fontWeight: 600, textTransform: 'uppercase' }}>
              {s.bracket === 'current' ? 'Current' : `${s.bracket} days`}
            </div>
            <div style={{ fontSize: '16px', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{formatPeso(s.total)}</div>
            <div style={{ fontSize: '11px', color: '#98a2b3' }}>{s.count} bill(s)</div>
          </div>
        ))}
      </div>
      {d.bills.length > 0 && (
        <table className="bill-table">
          <thead>
            <tr><th>Account #</th><th>Consumer</th><th>Bill #</th><th>Period</th><th>Balance</th><th>Days Overdue</th><th>Bracket</th></tr>
          </thead>
          <tbody>
            {d.bills.map((b) => (
              <tr key={b.billNumber}>
                <td className="bill-text-mono">{b.accountNumber}</td>
                <td>{b.consumer}</td>
                <td className="bill-text-mono">{b.billNumber}</td>
                <td>{b.period}</td>
                <td className="bill-text-mono" style={{ fontWeight: 600 }}>{formatPeso(b.balance)}</td>
                <td className="bill-text-mono">{b.daysOverdue}</td>
                <td>{b.bracket === 'current' ? 'Current' : `${b.bracket} days`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {d.bills.length === 0 && <div className="bill-empty">No outstanding balances.</div>}
    </div>
  );
}

function LedgerReport({ data }: { data: Record<string, unknown> }) {
  const d = data as {
    consumer: { accountNumber: string; firstName: string; lastName: string; address: string; consumerType: string };
    totalBilled: number; totalPaid: number; balance: number;
    bills: Array<{ billNumber: string; period: string; totalAmount: string; amountPaid: string; balance: string; dueDate: string; status: string; consumption: string }>;
    payments: Array<{ orNumber: string; paymentDate: string; totalAmount: string; paymentMethod: string; status: string }>;
  };
  return (
    <div>
      <div style={{ background: '#f8f9fc', padding: '16px', borderRadius: '8px', marginBottom: '20px' }}>
        <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '8px' }}>
          {d.consumer.accountNumber} — {d.consumer.lastName}, {d.consumer.firstName}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', fontSize: '13px' }}>
          <div><span style={{ color: '#667085' }}>Total Billed:</span> <strong className="bill-text-mono">{formatPeso(d.totalBilled)}</strong></div>
          <div><span style={{ color: '#667085' }}>Total Paid:</span> <strong className="bill-text-mono" style={{ color: '#039855' }}>{formatPeso(d.totalPaid)}</strong></div>
          <div><span style={{ color: '#667085' }}>Balance:</span> <strong className="bill-text-mono" style={{ color: d.balance > 0 ? '#d92d20' : '#039855' }}>{formatPeso(d.balance)}</strong></div>
        </div>
      </div>
      <h3 className="bill-section-title">Bills</h3>
      <table className="bill-table">
        <thead>
          <tr><th>Bill #</th><th>Period</th><th>Consumption</th><th>Total</th><th>Paid</th><th>Balance</th><th>Due</th><th>Status</th></tr>
        </thead>
        <tbody>
          {d.bills.map((b) => (
            <tr key={b.billNumber}>
              <td className="bill-text-mono">{b.billNumber}</td>
              <td>{b.period}</td>
              <td className="bill-text-mono">{b.consumption} cu.m.</td>
              <td className="bill-text-mono">{formatPeso(b.totalAmount)}</td>
              <td className="bill-text-mono">{formatPeso(b.amountPaid)}</td>
              <td className="bill-text-mono" style={{ fontWeight: 600 }}>{formatPeso(b.balance)}</td>
              <td>{new Date(b.dueDate).toLocaleDateString()}</td>
              <td><span className={`bill-badge bill-badge--${b.status}`}>{b.status}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3 className="bill-section-title">Payments</h3>
      {d.payments.length > 0 ? (
        <table className="bill-table">
          <thead>
            <tr><th>OR #</th><th>Date</th><th>Amount</th><th>Method</th><th>Status</th></tr>
          </thead>
          <tbody>
            {d.payments.map((p) => (
              <tr key={p.orNumber} style={p.status === 'voided' ? { opacity: 0.5 } : undefined}>
                <td className="bill-text-mono">{p.orNumber}</td>
                <td>{new Date(p.paymentDate).toLocaleDateString()}</td>
                <td className="bill-text-mono" style={{ fontWeight: 600 }}>{formatPeso(p.totalAmount)}</td>
                <td style={{ textTransform: 'capitalize' }}>{p.paymentMethod.replace('_', ' ')}</td>
                <td><span className={`bill-badge bill-badge--${p.status}`}>{p.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="bill-empty" style={{ padding: '16px 0' }}>No payments recorded.</div>
      )}
    </div>
  );
}

function SummaryReport({ data }: { data: Record<string, unknown> }) {
  const d = data as {
    totalBills: number; totalBilled: number; totalCollected: number; totalBalance: number;
    totalConsumption: number; collectionRate: number;
    byStatus: Array<{ status: string; count: number; amount: number }>;
  };
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '20px' }}>
        <div style={{ background: '#eff8ff', padding: '16px', borderRadius: '8px', textAlign: 'center' }}>
          <div style={{ fontSize: '11px', color: '#175cd3', fontWeight: 600, textTransform: 'uppercase' }}>Total Billed</div>
          <div style={{ fontSize: '22px', fontWeight: 700, color: '#175cd3', fontVariantNumeric: 'tabular-nums' }}>{formatPeso(d.totalBilled)}</div>
          <div style={{ fontSize: '11px', color: '#98a2b3' }}>{d.totalBills} bills</div>
        </div>
        <div style={{ background: '#ecfdf3', padding: '16px', borderRadius: '8px', textAlign: 'center' }}>
          <div style={{ fontSize: '11px', color: '#067647', fontWeight: 600, textTransform: 'uppercase' }}>Collected</div>
          <div style={{ fontSize: '22px', fontWeight: 700, color: '#067647', fontVariantNumeric: 'tabular-nums' }}>{formatPeso(d.totalCollected)}</div>
          <div style={{ fontSize: '11px', color: '#98a2b3' }}>{d.collectionRate.toFixed(1)}% rate</div>
        </div>
        <div style={{ background: '#fef3f2', padding: '16px', borderRadius: '8px', textAlign: 'center' }}>
          <div style={{ fontSize: '11px', color: '#b42318', fontWeight: 600, textTransform: 'uppercase' }}>Outstanding</div>
          <div style={{ fontSize: '22px', fontWeight: 700, color: '#b42318', fontVariantNumeric: 'tabular-nums' }}>{formatPeso(d.totalBalance)}</div>
        </div>
        <div style={{ background: '#f8f9fc', padding: '16px', borderRadius: '8px', textAlign: 'center' }}>
          <div style={{ fontSize: '11px', color: '#475467', fontWeight: 600, textTransform: 'uppercase' }}>Consumption</div>
          <div style={{ fontSize: '22px', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{d.totalConsumption.toLocaleString()} cu.m.</div>
        </div>
      </div>
      <h3 className="bill-section-title">By Status</h3>
      <table className="bill-table" style={{ maxWidth: '500px' }}>
        <thead><tr><th>Status</th><th>Count</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
        <tbody>
          {d.byStatus.map((s) => (
            <tr key={s.status}>
              <td><span className={`bill-badge bill-badge--${s.status}`}>{s.status}</span></td>
              <td className="bill-text-mono">{s.count}</td>
              <td className="bill-text-mono" style={{ textAlign: 'right' }}>{formatPeso(s.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
