import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { formatPeso } from '../../budgeting/format-peso';
import {
  consolidateApp,
  listAppItems,
  listProcurementFiscalYears,
  ProcurementApiError,
} from '../api';
import type { AppItem, ProcurementFiscalYear } from '../api';
import './procurement.css';

const CATEGORY_LABEL: Record<string, string> = {
  goods: 'Goods',
  services: 'Services',
  infrastructure: 'Infrastructure',
  consulting_services: 'Consulting Services',
};

interface Group {
  key: string;
  office: string;
  items: AppItem[];
  subtotal: number;
}

export function AppConsolidationPage() {
  const [fiscalYears, setFiscalYears] = useState<ProcurementFiscalYear[]>([]);
  const [selectedFiscalYear, setSelectedFiscalYear] = useState('');
  const [items, setItems] = useState<AppItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [consolidating, setConsolidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listProcurementFiscalYears()
      .then((fy) => {
        if (cancelled) return;
        setFiscalYears(fy);
        if (fy[0]) setSelectedFiscalYear(fy[0].id);
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load fiscal years.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function loadItems() {
    if (!selectedFiscalYear) return;
    setLoading(true);
    listAppItems({ fiscalYearId: selectedFiscalYear })
      .then(setItems)
      .catch((err) =>
        setError(err instanceof ProcurementApiError ? err.message : 'Failed to load APP.'),
      )
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadItems();
    setSuccess(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFiscalYear]);

  async function handleConsolidate() {
    setError(null);
    setSuccess(null);
    if (!selectedFiscalYear) return;
    setConsolidating(true);
    try {
      const res = await consolidateApp(selectedFiscalYear);
      setSuccess(
        `${res.created} new APP line(s) added from approved PPMPs — ` +
          `${res.totalApprovedPpmp} approved item(s), grand total ${formatPeso(res.grandTotalBudget)}.`,
      );
      loadItems();
    } catch (err) {
      setError(err instanceof ProcurementApiError ? err.message : 'Consolidation failed.');
    } finally {
      setConsolidating(false);
    }
  }

  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, Group>();
    for (const it of items) {
      const dept = it.ppmpItem.department;
      const key = dept?.id ?? 'unassigned';
      const office = dept ? `${dept.code} — ${dept.name}` : 'Unassigned office';
      let g = map.get(key);
      if (!g) {
        g = { key, office, items: [], subtotal: 0 };
        map.set(key, g);
      }
      g.items.push(it);
      g.subtotal += parseFloat(it.approvedBudget) || 0;
    }
    return [...map.values()].sort((a, b) => a.office.localeCompare(b.office));
  }, [items]);

  const grandTotal = useMemo(
    () => items.reduce((sum, it) => sum + (parseFloat(it.approvedBudget) || 0), 0),
    [items],
  );

  const fyLabel = fiscalYears.find((f) => f.id === selectedFiscalYear);

  return (
    <div className="pr-page">
      <Link to="/procurement" className="pr-back">
        {'<-'} Back to Procurement
      </Link>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <h1>Annual Procurement Plan (APP)</h1>
        <button className="pr-btn" type="button" onClick={() => window.print()}>
          🖨 Print
        </button>
      </div>
      <p style={{ color: '#667085', fontSize: 14, marginBottom: 20 }}>
        The APP consolidates every end-user office's <strong>approved</strong> PPMP for the year.
        Use “Generate / Refresh” after approving PPMP items to pull them in.
      </p>

      {error && <div className="pr-error">{error}</div>}
      {success && (
        <div
          style={{
            background: '#ecfdf3',
            color: '#067647',
            padding: '12px 16px',
            borderRadius: 8,
            marginBottom: 16,
            fontSize: 13,
          }}
        >
          {success}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          gap: 16,
          marginBottom: 20,
          flexWrap: 'wrap',
          alignItems: 'flex-end',
        }}
      >
        <div className="pr-field" style={{ minWidth: 220 }}>
          <label>Fiscal Year</label>
          <select value={selectedFiscalYear} onChange={(e) => setSelectedFiscalYear(e.target.value)}>
            {fiscalYears.map((fy) => (
              <option key={fy.id} value={fy.id}>
                {fy.name} ({fy.year})
              </option>
            ))}
          </select>
        </div>
        <button
          className="pr-btn pr-btn--primary"
          type="button"
          onClick={handleConsolidate}
          disabled={consolidating || !selectedFiscalYear}
        >
          {consolidating ? 'Consolidating…' : '↻ Generate / Refresh from approved PPMPs'}
        </button>
      </div>

      {loading && <p style={{ color: '#667085' }}>Loading…</p>}

      {!loading && items.length === 0 && (
        <div
          style={{
            border: '1px dashed #d0d5dd',
            borderRadius: 10,
            padding: 24,
            color: '#667085',
            textAlign: 'center',
          }}
        >
          No APP lines yet for {fyLabel ? `${fyLabel.name} (${fyLabel.year})` : 'this year'}. Approve
          the office PPMPs, then click “Generate / Refresh from approved PPMPs”.
        </div>
      )}

      {!loading && items.length > 0 && (
        <>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              marginBottom: 8,
            }}
          >
            <span style={{ color: '#475467', fontSize: 13 }}>
              {items.length} line(s) · {groups.length} office(s)
            </span>
            <span style={{ fontSize: 15 }}>
              Grand Total: <strong>{formatPeso(grandTotal.toFixed(2))}</strong>
            </span>
          </div>
          {groups.map((g) => (
            <div key={g.key} style={{ marginBottom: 24 }}>
              <h2
                style={{
                  fontSize: 15,
                  color: 'var(--mswd-navy)',
                  margin: '0 0 8px',
                  borderBottom: '2px solid #e4e7ec',
                  paddingBottom: 4,
                }}
              >
                {g.office}
              </h2>
              <div style={{ overflowX: 'auto' }}>
                <table className="pr-table">
                  <thead>
                    <tr>
                      <th>APP #</th>
                      <th>PPMP Code</th>
                      <th>Procurement Project / Item</th>
                      <th>Category</th>
                      <th>Mode</th>
                      <th style={{ textAlign: 'center' }}>Sched.</th>
                      <th style={{ textAlign: 'right' }}>Approved Budget</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.items.map((it) => (
                      <tr key={it.id}>
                        <td>
                          <strong>{it.appNumber}</strong>
                        </td>
                        <td>{it.ppmpItem.code}</td>
                        <td>{it.procurementProjectTitle}</td>
                        <td>{CATEGORY_LABEL[it.procurementCategory] ?? it.procurementCategory}</td>
                        <td style={{ fontSize: 12 }}>{it.procurementMode ?? '—'}</td>
                        <td style={{ textAlign: 'center' }}>
                          {it.ppmpItem.scheduleQuarter ? `Q${it.ppmpItem.scheduleQuarter}` : '—'}
                        </td>
                        <td style={{ textAlign: 'right' }}>{formatPeso(it.approvedBudget)}</td>
                        <td>
                          <span className={`pr-badge pr-badge--${it.status}`}>{it.status}</span>
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'right', fontWeight: 600 }}>
                        {g.office} subtotal
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>
                        {formatPeso(g.subtotal.toFixed(2))}
                      </td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          ))}
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 16,
              fontSize: 16,
              borderTop: '2px solid var(--mswd-navy)',
              paddingTop: 10,
            }}
          >
            <span>
              Grand Total ({fyLabel ? fyLabel.year : ''}):{' '}
              <strong>{formatPeso(grandTotal.toFixed(2))}</strong>
            </span>
          </div>
        </>
      )}
    </div>
  );
}
