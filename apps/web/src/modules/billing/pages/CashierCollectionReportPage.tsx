import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import {
  CashierCollectionApiError,
  addEntry,
  cashCountTotal,
  deleteEntry,
  denomLabel,
  getFormOptions,
  getReport,
  submitReport,
  updateEntry,
  type CashierEntry,
  type CashierReport,
  type FormOptions,
} from '../cashierCollectionApi';

import BillingSubNav from './BillingSubNav';
import './billing.css';

function peso(v: number) {
  return (v || 0).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
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

type Draft = {
  collectorId: string;
  collectionAreaId: string;
  collectionDate: string;
  glAccountId: string;
  orSeries: string;
  cashCount: Record<string, number>;
};

function emptyDraft(reportDate: string): Draft {
  return {
    collectorId: '',
    collectionAreaId: '',
    collectionDate: reportDate,
    glAccountId: '',
    orSeries: '',
    cashCount: {},
  };
}

/** Denomination grid for a cash-count sheet; edits a { denom: qty } map. */
function CashCountSheet({
  denominations,
  value,
  onChange,
}: {
  denominations: number[];
  value: Record<string, number>;
  onChange?: (v: Record<string, number>) => void;
  readOnly?: boolean;
}) {
  const readOnly = !onChange;
  return (
    <table className="bill-table" style={{ maxWidth: 380 }}>
      <thead>
        <tr>
          <th>Denomination</th>
          <th style={{ textAlign: 'right' }}>Qty</th>
          <th style={{ textAlign: 'right' }}>Amount</th>
        </tr>
      </thead>
      <tbody>
        {denominations.map((d) => {
          const qty = Number(value[String(d)]) || 0;
          return (
            <tr key={d}>
              <td>{denomLabel(d)}</td>
              <td style={{ textAlign: 'right' }}>
                {readOnly ? (
                  qty || ''
                ) : (
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={qty || ''}
                    onChange={(e) =>
                      onChange!({ ...value, [String(d)]: parseInt(e.target.value, 10) || 0 })
                    }
                    style={{ ...inputStyle, width: 80, textAlign: 'right', padding: '4px 6px' }}
                  />
                )}
              </td>
              <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                {qty ? peso(cashCountTotal([d], { [String(d)]: qty })) : ''}
              </td>
            </tr>
          );
        })}
        <tr style={{ fontWeight: 700, borderTop: '2px solid var(--mswd-navy, #0b2e63)' }}>
          <td colSpan={2} style={{ textAlign: 'right' }}>
            Cash total
          </td>
          <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
            {peso(cashCountTotal(denominations, value))}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

export default function CashierCollectionReportPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [report, setReport] = useState<CashierReport | null>(null);
  const [opts, setOpts] = useState<FormOptions | null>(null);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [glFilter, setGlFilter] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [r, o] = await Promise.all([getReport(id), getFormOptions()]);
      setReport(r);
      setOpts(o);
    } catch (e) {
      setError(e instanceof CashierCollectionApiError ? e.message : 'Failed to load the report.');
    }
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);

  const isDraft = report?.status === 'draft';
  const denoms = report?.denominations ?? [1000, 500, 200, 100, 50, 20, 10, 5, 1, 0.25];

  function startAdd() {
    if (!report) return;
    setEditingId(null);
    setDraft(emptyDraft(report.reportDate.slice(0, 10)));
    setError('');
  }
  function startEdit(e: CashierEntry) {
    setEditingId(e.id);
    setDraft({
      collectorId: e.collectorId,
      collectionAreaId: e.collectionAreaId ?? '',
      collectionDate: e.collectionDate.slice(0, 10),
      glAccountId: e.glAccountId,
      orSeries: e.orSeries,
      cashCount: e.cashCount ?? {},
    });
    setError('');
  }

  const draftTotal = draft ? cashCountTotal(denoms, draft.cashCount) : 0;
  const draftValid =
    !!draft && draft.collectorId && draft.glAccountId && draft.orSeries.trim() && draftTotal > 0;

  async function saveEntry() {
    if (!id || !draft || !draftValid) return;
    setSaving(true);
    setError('');
    try {
      const payload = {
        collectorId: draft.collectorId,
        ...(draft.collectionAreaId ? { collectionAreaId: draft.collectionAreaId } : {}),
        collectionDate: draft.collectionDate,
        glAccountId: draft.glAccountId,
        orSeries: draft.orSeries.trim(),
        cashCount: draft.cashCount,
      };
      const r = editingId ? await updateEntry(id, editingId, payload) : await addEntry(id, payload);
      setReport(r);
      setDraft(null);
      setEditingId(null);
    } catch (e) {
      setError(e instanceof CashierCollectionApiError ? e.message : 'Failed to save the entry.');
    } finally {
      setSaving(false);
    }
  }

  async function removeEntry(entryId: string) {
    if (!id || !window.confirm('Remove this teller collection?')) return;
    try {
      setReport(await deleteEntry(id, entryId));
    } catch (e) {
      setError(e instanceof CashierCollectionApiError ? e.message : 'Failed to remove.');
    }
  }

  async function onSubmit() {
    if (!id || !report) return;
    if (
      !window.confirm(
        `Submit ${report.reportNumber}? This creates a draft journal entry for the accountant's review and locks the report.`,
      )
    )
      return;
    setSubmitting(true);
    setError('');
    try {
      const r = await submitReport(id, report.version);
      setReport(r);
      setOk(
        `Submitted. Journal entry ${r.jevNumber ?? r.journalEntry?.jevNumber ?? ''} created for the accountant's review.`,
      );
    } catch (e) {
      setError(e instanceof CashierCollectionApiError ? e.message : 'Failed to submit.');
    } finally {
      setSubmitting(false);
    }
  }

  if (error && !report) {
    return (
      <div className="bill-page">
        <BillingSubNav />
        <div className="bill-error">{error}</div>
        <Link to="/billing/cashier-report" className="bill-link">
          ← Back to reports
        </Link>
      </div>
    );
  }
  if (!report || !opts) {
    return (
      <div className="bill-page">
        <BillingSubNav />
        <div className="bill-empty">Loading…</div>
      </div>
    );
  }

  const glOptions = opts.glAccounts.filter((g) => {
    const q = glFilter.trim().toLowerCase();
    return !q || g.accountCode.toLowerCase().includes(q) || g.name.toLowerCase().includes(q);
  });

  return (
    <div className="bill-page">
      <BillingSubNav />
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <h1 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
          {report.reportNumber}
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: 12,
              background: report.status === 'submitted' ? '#ecfdf3' : '#fffaeb',
              color: report.status === 'submitted' ? '#067647' : '#b54708',
            }}
          >
            {report.status === 'submitted' ? 'Submitted' : 'Draft'}
          </span>
        </h1>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Link to={`/billing/print/cashier-report/${report.id}`} className="bill-btn bill-btn--sm">
            🖨 Print Summary
          </Link>
          {isDraft && (
            <button
              type="button"
              className="bill-btn bill-btn--primary"
              disabled={submitting || report.entries.length === 0}
              onClick={onSubmit}
            >
              {submitting ? 'Submitting…' : 'Submit for Review'}
            </button>
          )}
          <Link to="/billing/cashier-report" className="bill-link">
            ← Back
          </Link>
        </div>
      </div>
      <div style={{ color: '#667085', fontSize: 13, margin: '6px 0 16px' }}>
        {fmtDate(report.reportDate)} · Cashier: {report.cashierName}
        {report.journalEntry && (
          <>
            {' · '}JEV: <strong>{report.journalEntry.jevNumber}</strong> (
            {report.journalEntry.status})
          </>
        )}
      </div>

      {ok && (
        <div
          style={{
            background: '#ecfdf3',
            border: '1px solid #abefc6',
            color: '#067647',
            borderRadius: 8,
            padding: '10px 14px',
            marginBottom: 14,
            fontWeight: 600,
          }}
        >
          ✓ {ok}
        </div>
      )}
      {error && (
        <div className="bill-error" style={{ marginBottom: 12 }}>
          {error}
        </div>
      )}

      {/* ── Teller entries ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: 16, margin: '8px 0' }}>
          Teller Collections ({report.entries.length})
        </h2>
        {isDraft && !draft && (
          <button type="button" className="bill-btn bill-btn--primary" onClick={startAdd}>
            + Add Teller Collection
          </button>
        )}
      </div>

      {report.entries.length > 0 && (
        <div style={{ overflowX: 'auto', marginBottom: 16 }}>
          <table className="bill-table">
            <thead>
              <tr>
                <th>Teller / Collector</th>
                <th>Area</th>
                <th>Date</th>
                <th>GL Account</th>
                <th>OR Series</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
                {isDraft && <th></th>}
              </tr>
            </thead>
            <tbody>
              {report.entries.map((e) => (
                <tr key={e.id}>
                  <td>{e.collectorName}</td>
                  <td>{e.collectionAreaName ?? '—'}</td>
                  <td>{fmtDate(e.collectionDate)}</td>
                  <td>
                    <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{e.glAccountCode}</span>{' '}
                    {e.glAccountName}
                  </td>
                  <td>{e.orSeries}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{peso(e.amount)}</td>
                  {isDraft && (
                    <td>
                      <div style={{ display: 'flex', gap: 10 }}>
                        <button
                          type="button"
                          className="bill-link"
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: 0,
                          }}
                          onClick={() => startEdit(e)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => removeEntry(e.id)}
                          style={{
                            color: '#b42318',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: 0,
                            textDecoration: 'underline',
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              <tr style={{ fontWeight: 700, borderTop: '2px solid var(--mswd-navy, #0b2e63)' }}>
                <td colSpan={5} style={{ textAlign: 'right' }}>
                  Total Collections
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                  {peso(report.totalAmount)}
                </td>
                {isDraft && <td></td>}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* ── Entry form (add/edit) ── */}
      {draft && (
        <div
          style={{
            border: '1px solid #e4e7ec',
            borderRadius: 10,
            padding: 16,
            background: '#fcfcfd',
            marginBottom: 20,
          }}
        >
          <h3 style={{ fontSize: 15, margin: '0 0 12px' }}>
            {editingId ? 'Edit teller collection' : 'Add teller collection'}
          </h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
            <div style={{ flex: '1 1 200px' }}>
              <label style={labelStyle}>Teller / Collector *</label>
              <select
                style={inputStyle}
                value={draft.collectorId}
                onChange={(e) => setDraft({ ...draft, collectorId: e.target.value })}
              >
                <option value="">— Select —</option>
                {opts.collectors.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ flex: '1 1 180px' }}>
              <label style={labelStyle}>Collection area</label>
              <select
                style={inputStyle}
                value={draft.collectionAreaId}
                onChange={(e) => setDraft({ ...draft, collectionAreaId: e.target.value })}
              >
                <option value="">— None —</option>
                {opts.areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ flex: '1 1 150px' }}>
              <label style={labelStyle}>Date of collection *</label>
              <input
                type="date"
                style={inputStyle}
                value={draft.collectionDate}
                onChange={(e) => setDraft({ ...draft, collectionDate: e.target.value })}
              />
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
            <div style={{ flex: '1 1 320px' }}>
              <label style={labelStyle}>GL account (collection recorded to) *</label>
              <input
                style={{ ...inputStyle, marginBottom: 4 }}
                placeholder="Filter accounts by code or name…"
                value={glFilter}
                onChange={(e) => setGlFilter(e.target.value)}
              />
              <select
                style={inputStyle}
                size={1}
                value={draft.glAccountId}
                onChange={(e) => setDraft({ ...draft, glAccountId: e.target.value })}
              >
                <option value="">— Select GL account —</option>
                {glOptions.slice(0, 100).map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.accountCode} — {g.name}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ flex: '1 1 260px' }}>
              <label style={labelStyle}>OR series covered *</label>
              <input
                style={inputStyle}
                placeholder="e.g. 2026-3822 to 2026-3827"
                value={draft.orSeries}
                onChange={(e) => setDraft({ ...draft, orSeries: e.target.value })}
              />
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Cash count sheet (teller&apos;s remittance) *</label>
            <CashCountSheet
              denominations={denoms}
              value={draft.cashCount}
              onChange={(v) => setDraft({ ...draft, cashCount: v })}
            />
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              className="bill-btn bill-btn--primary"
              disabled={!draftValid || saving}
              onClick={saveEntry}
            >
              {saving ? 'Saving…' : editingId ? 'Update entry' : 'Add entry'}
            </button>
            <button
              type="button"
              className="bill-btn"
              onClick={() => {
                setDraft(null);
                setEditingId(null);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Combined cash-count summary ── */}
      {report.entries.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <h2 style={{ fontSize: 16, margin: '8px 0' }}>Combined Cash Count (final count)</h2>
          <p style={{ color: '#667085', fontSize: 13, marginTop: 0 }}>
            All teller cash counts combined — the cashier&apos;s final count before finalizing.
          </p>
          <CashCountSheet denominations={denoms} value={report.combinedCashCount} />
          <div style={{ marginTop: 8, fontSize: 14 }}>
            Grand total counted:{' '}
            <strong style={{ fontFamily: 'monospace' }}>
              {peso(report.combinedCashCountTotal)}
            </strong>
            {Math.abs(report.combinedCashCountTotal - report.totalAmount) > 0.005 ? (
              <span style={{ color: '#b42318', marginLeft: 10 }}>
                ⚠ differs from total collections {peso(report.totalAmount)}
              </span>
            ) : (
              <span style={{ color: '#067647', marginLeft: 10 }}>✓ matches total collections</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
