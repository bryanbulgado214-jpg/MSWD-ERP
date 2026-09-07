import { useEffect, useState } from 'react';

import {
  getInventoryGlRuns,
  InventoryApiError,
  postInventoryGl,
  previewInventoryGl,
  voidInventoryGl,
} from '../api';
import type { InventoryGlPreview, InventoryGlRun } from '../types';

import { InventorySubNav } from './InventorySubNav';
import './inventory.css';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const peso = (n: number) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(n);

export default function MonthEndJevPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [preview, setPreview] = useState<InventoryGlPreview | null>(null);
  const [runs, setRuns] = useState<InventoryGlRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function loadPreview() {
    setLoading(true);
    setError('');
    try {
      const [p, r] = await Promise.all([previewInventoryGl(month, year), getInventoryGlRuns()]);
      setPreview(p);
      setRuns(r);
    } catch (e) {
      setError(e instanceof InventoryApiError ? e.message : 'Failed to load.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPreview();
  }, [month, year]);

  async function handlePost() {
    if (!preview) return;
    if (
      !window.confirm(
        `Post the ${MONTHS[month - 1]} ${year} inventory JEV for ${preview.pendingCount} issuance(s) totalling ${peso(preview.pendingTotal)}?`,
      )
    )
      return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const run = await postInventoryGl(month, year);
      setNotice(`Posted ${run.runNumber}${run.jev ? ` — ${run.jev.jevNumber}` : ''}.`);
      await loadPreview();
    } catch (e) {
      setError(e instanceof InventoryApiError ? e.message : 'Failed to post.');
    } finally {
      setBusy(false);
    }
  }

  async function handleVoid(run: InventoryGlRun) {
    if (
      !window.confirm(
        `Void ${run.runNumber}? This reverses its JEV and releases the month's issuances to be posted again.`,
      )
    )
      return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await voidInventoryGl(run.id, run.version);
      setNotice(`${run.runNumber} voided.`);
      await loadPreview();
    } catch (e) {
      setError(e instanceof InventoryApiError ? e.message : 'Failed to void.');
    } finally {
      setBusy(false);
    }
  }

  const periodBlocked =
    preview?.period && (preview.period.status !== 'open' || preview.period.locked);
  const alreadyPosted = preview?.existingRun?.status === 'posted';
  const canPost = !!preview && preview.pendingCount > 0 && !periodBlocked && !alreadyPosted;

  const years = [
    now.getFullYear() + 1,
    now.getFullYear(),
    now.getFullYear() - 1,
    now.getFullYear() - 2,
  ];

  return (
    <div className="inv-page">
      <InventorySubNav />
      <h1>Month-End Inventory JEV</h1>
      <p style={{ color: '#667085', fontSize: 13, marginTop: -6, marginBottom: 16, maxWidth: 820 }}>
        Issuances are tracked on the stock cards through the month with no ledger entry. At
        month-end, post one journal entry (the RSMI) that debits supplies expense and credits
        inventory for the month's total FIFO cost. Posting is blocked if the accounting period is
        closed or locked.
      </p>

      <div className="inv-toolbar" style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
          {MONTHS.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </select>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      {error && <div className="inv-error">{error}</div>}
      {notice && (
        <div
          className="inv-error"
          style={{ background: '#ecfdf3', color: '#027a48', borderColor: '#a6f4c5' }}
        >
          {notice}
        </div>
      )}
      {loading && <div className="inv-empty">Loading…</div>}

      {preview && !loading && (
        <>
          {preview.period && (
            <div
              style={{
                fontSize: 13,
                marginBottom: 12,
                color: periodBlocked ? '#b42318' : '#027a48',
              }}
            >
              Period <strong>{preview.period.name}</strong>:{' '}
              {preview.period.locked
                ? 'LOCKED — posting disabled'
                : preview.period.status !== 'open'
                  ? 'CLOSED — posting disabled'
                  : 'open'}
            </div>
          )}
          {!preview.period && (
            <div className="inv-error">No accounting period covers {preview.periodLabel}.</div>
          )}

          {alreadyPosted && (
            <div style={{ fontSize: 13, marginBottom: 12, color: '#667085' }}>
              Already posted as <strong>{preview.existingRun?.runNumber}</strong>
              {preview.existingRun?.jev ? ` (${preview.existingRun.jev.jevNumber})` : ''}. Void it
              below to re-post.
            </div>
          )}

          <div
            style={{
              display: 'flex',
              gap: 24,
              alignItems: 'baseline',
              margin: '4px 0 14px',
              flexWrap: 'wrap',
            }}
          >
            <div>
              <div style={{ fontSize: 12, color: '#667085' }}>Un-posted issuances</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{preview.pendingCount}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#667085' }}>Total FIFO cost</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{peso(preview.pendingTotal)}</div>
            </div>
            <button
              className="inv-btn inv-btn--primary"
              disabled={!canPost || busy}
              onClick={handlePost}
              style={{ marginLeft: 'auto' }}
            >
              {busy ? 'Posting…' : 'Post Month-End JEV'}
            </button>
          </div>

          {preview.pendingCount === 0 ? (
            <div className="inv-empty">No un-posted issuances for {preview.periodLabel}.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="inv-table">
                <thead>
                  <tr>
                    <th>Stock No.</th>
                    <th>Item</th>
                    <th>Class</th>
                    <th style={{ textAlign: 'right' }}>Qty issued</th>
                    <th style={{ textAlign: 'right' }}>Cost (FIFO)</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.items.map((it) => (
                    <tr key={it.stockNumber}>
                      <td className="inv-text-mono">{it.stockNumber}</td>
                      <td>{it.description}</td>
                      <td>{it.classification.replace('_', ' ')}</td>
                      <td style={{ textAlign: 'right' }}>{it.quantity}</td>
                      <td style={{ textAlign: 'right' }} className="inv-text-mono">
                        {peso(it.totalCost)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <h2 style={{ fontSize: 16, marginTop: 28 }}>Posted runs</h2>
      {runs.length === 0 ? (
        <div className="inv-empty">No month-end runs yet.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="inv-table">
            <thead>
              <tr>
                <th>Run</th>
                <th>Period</th>
                <th>Status</th>
                <th>JEV</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
                <th>Issuances</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td className="inv-text-mono">{r.runNumber}</td>
                  <td>
                    {MONTHS[r.periodMonth - 1]} {r.periodYear}
                  </td>
                  <td>
                    <span className={`inv-badge inv-badge--${r.status}`}>{r.status}</span>
                  </td>
                  <td className="inv-text-mono">{r.jev?.jevNumber ?? '—'}</td>
                  <td style={{ textAlign: 'right' }} className="inv-text-mono">
                    {peso(Number(r.totalAmount))}
                  </td>
                  <td>{r.issueCount}</td>
                  <td>
                    {r.status === 'posted' && (
                      <button
                        className="inv-btn inv-btn--danger"
                        disabled={busy}
                        onClick={() => handleVoid(r)}
                      >
                        Void
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
