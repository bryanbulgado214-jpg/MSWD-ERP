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
  type CheckItem,
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

type GlLineDraft = { glAccountId: string; amount: string };
type Draft = {
  collectorId: string;
  collectionAreaId: string;
  collectionDate: string;
  orSeries: string;
  glLines: GlLineDraft[];
  checks: CheckItem[];
  cashCount: Record<string, number>;
};

function emptyDraft(reportDate: string): Draft {
  return {
    collectorId: '',
    collectionAreaId: '',
    collectionDate: reportDate,
    orSeries: '',
    glLines: [{ glAccountId: '', amount: '' }],
    checks: [],
    cashCount: {},
  };
}

/** Shortage/(overage) label for a signed variance (counted − expected). */
function varianceLabel(v: number): { text: string; color: string } {
  if (Math.abs(v) < 0.005) return { text: 'Balanced ✓', color: '#067647' };
  if (v > 0) return { text: `Overage ${peso(v)}`, color: '#b54708' };
  return { text: `Shortage ${peso(-v)}`, color: '#b42318' };
}

/** Denomination grid for a cash-count sheet; edits a { denom: qty } map. */
function CashCountSheet({
  denominations,
  value,
  onChange,
  checksTotal,
}: {
  denominations: number[];
  value: Record<string, number>;
  onChange?: (v: Record<string, number>) => void;
  checksTotal?: number;
  readOnly?: boolean;
}) {
  const readOnly = !onChange;
  const cashTotal = cashCountTotal(denominations, value);
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
          <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{peso(cashTotal)}</td>
        </tr>
        {checksTotal !== undefined && (
          <>
            <tr>
              <td colSpan={2} style={{ textAlign: 'right' }}>
                Add: total checks
              </td>
              <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{peso(checksTotal)}</td>
            </tr>
            <tr style={{ fontWeight: 700, borderTop: '1px solid #d0d5dd' }}>
              <td colSpan={2} style={{ textAlign: 'right' }}>
                Total collection (cash + checks)
              </td>
              <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                {peso(cashTotal + checksTotal)}
              </td>
            </tr>
          </>
        )}
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
      orSeries: e.orSeries,
      glLines: e.glLines.map((l) => ({ glAccountId: l.glAccountId, amount: String(l.amount) })),
      checks: e.checks ?? [],
      cashCount: e.cashCount ?? {},
    });
    setError('');
  }

  const draftRemit = draft
    ? Math.round(draft.glLines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0) * 100) / 100
    : 0;
  const draftChecksTotal = draft
    ? draft.checks.reduce((s, c) => s + (Number(c.amount) || 0), 0)
    : 0;
  const draftCash = draft ? cashCountTotal(denoms, draft.cashCount) : 0;
  const draftCounted = Math.round((draftCash + draftChecksTotal) * 100) / 100;
  const draftVariance = Math.round((draftCounted - draftRemit) * 100) / 100;
  const draftValid =
    !!draft &&
    !!draft.collectorId &&
    !!draft.orSeries.trim() &&
    draft.glLines.some((l) => l.glAccountId && (parseFloat(l.amount) || 0) > 0) &&
    draft.glLines.every((l) => !l.glAccountId || (parseFloat(l.amount) || 0) > 0) &&
    draftRemit > 0 &&
    draftChecksTotal <= draftRemit + 0.005 &&
    draft.checks.every((c) => c.checkNumber.trim() && (Number(c.amount) || 0) > 0);

  async function saveEntry() {
    if (!id || !draft || !draftValid) return;
    setSaving(true);
    setError('');
    try {
      const payload = {
        collectorId: draft.collectorId,
        ...(draft.collectionAreaId ? { collectionAreaId: draft.collectionAreaId } : {}),
        collectionDate: draft.collectionDate,
        orSeries: draft.orSeries.trim(),
        glLines: draft.glLines
          .filter((l) => l.glAccountId && (parseFloat(l.amount) || 0) > 0)
          .map((l) => ({ glAccountId: l.glAccountId, amount: parseFloat(l.amount) || 0 })),
        checks: draft.checks
          .filter((c) => c.checkNumber.trim())
          .map((c) => ({
            checkNumber: c.checkNumber.trim(),
            ...(c.bankName?.trim() ? { bankName: c.bankName.trim() } : {}),
            amount: Number(c.amount) || 0,
          })),
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
                <th style={{ textAlign: 'right' }}>Total Remittance</th>
                <th style={{ textAlign: 'right' }}>Checks</th>
                <th style={{ textAlign: 'right' }}>Short / (Over)</th>
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
                    {e.glLines.map((l, i) => (
                      <div key={i} style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                        <span style={{ fontFamily: 'monospace' }}>{l.glAccountCode}</span>{' '}
                        {l.glAccountName}
                        <span style={{ color: '#667085' }}> — {peso(l.amount)}</span>
                      </div>
                    ))}
                  </td>
                  <td>{e.orSeries}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{peso(e.amount)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                    {e.checksTotal ? peso(e.checksTotal) : '—'}
                  </td>
                  <td
                    style={{
                      textAlign: 'right',
                      fontSize: 12,
                      fontWeight: 600,
                      color: varianceLabel(e.variance).color,
                    }}
                  >
                    {varianceLabel(e.variance).text}
                  </td>
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
                <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                  {report.combinedChecksTotal ? peso(report.combinedChecksTotal) : '—'}
                </td>
                <td
                  style={{
                    textAlign: 'right',
                    fontSize: 12,
                    fontWeight: 600,
                    color: varianceLabel(report.overallVariance).color,
                  }}
                >
                  {varianceLabel(report.overallVariance).text}
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
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>OR series covered *</label>
            <input
              style={{ ...inputStyle, maxWidth: 340 }}
              placeholder="e.g. 2026-3822 to 2026-3827"
              value={draft.orSeries}
              onChange={(e) => setDraft({ ...draft, orSeries: e.target.value })}
            />
          </div>

          {/* GL breakdown — one or more accounts, auto-summing to the remittance */}
          <div style={{ marginBottom: 12 }}>
            <table className="bill-table" style={{ maxWidth: 620 }}>
              <thead>
                <tr>
                  <th>GL account (collection recorded to) *</th>
                  <th style={{ textAlign: 'right', width: 150 }}>Amount</th>
                  <th style={{ width: 30 }}></th>
                </tr>
              </thead>
              <tbody>
                {draft.glLines.map((l, i) => (
                  <tr key={i}>
                    <td>
                      <select
                        style={{ ...inputStyle, padding: '4px 6px' }}
                        value={l.glAccountId}
                        onChange={(e) => {
                          const glLines = [...draft.glLines];
                          glLines[i] = { ...glLines[i]!, glAccountId: e.target.value };
                          setDraft({ ...draft, glLines });
                        }}
                      >
                        <option value="">— Select GL account —</option>
                        {opts.glAccounts.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.accountCode} — {g.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        style={{ ...inputStyle, padding: '4px 6px', textAlign: 'right' }}
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={l.amount}
                        onChange={(e) => {
                          const glLines = [...draft.glLines];
                          glLines[i] = { ...glLines[i]!, amount: e.target.value };
                          setDraft({ ...draft, glLines });
                        }}
                      />
                    </td>
                    <td>
                      {draft.glLines.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setDraft({ ...draft, glLines: draft.glLines.filter((_, j) => j !== i) })
                          }
                          style={{
                            color: '#b42318',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                          }}
                        >
                          ×
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                <tr style={{ fontWeight: 700, borderTop: '2px solid var(--mswd-navy, #0b2e63)' }}>
                  <td style={{ textAlign: 'right' }}>
                    Total remittance (per teller&apos;s report)
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                    {peso(draftRemit)}
                  </td>
                  <td></td>
                </tr>
              </tbody>
            </table>
            <button
              type="button"
              className="bill-btn bill-btn--sm"
              style={{ marginTop: 6 }}
              onClick={() =>
                setDraft({ ...draft, glLines: [...draft.glLines, { glAccountId: '', amount: '' }] })
              }
            >
              + Add GL account
            </button>
          </div>

          {/* Checks received from customers (multiple) */}
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Checks received from customers</label>
            {draft.checks.length > 0 && (
              <table className="bill-table" style={{ maxWidth: 620, marginBottom: 6 }}>
                <thead>
                  <tr>
                    <th>Check No.</th>
                    <th>Bank</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {draft.checks.map((c, i) => (
                    <tr key={i}>
                      <td>
                        <input
                          style={{ ...inputStyle, padding: '4px 6px' }}
                          value={c.checkNumber}
                          onChange={(e) => {
                            const checks = [...draft.checks];
                            checks[i] = { ...checks[i]!, checkNumber: e.target.value };
                            setDraft({ ...draft, checks });
                          }}
                        />
                      </td>
                      <td>
                        <input
                          style={{ ...inputStyle, padding: '4px 6px' }}
                          value={c.bankName ?? ''}
                          onChange={(e) => {
                            const checks = [...draft.checks];
                            checks[i] = { ...checks[i]!, bankName: e.target.value };
                            setDraft({ ...draft, checks });
                          }}
                        />
                      </td>
                      <td>
                        <input
                          style={{
                            ...inputStyle,
                            padding: '4px 6px',
                            textAlign: 'right',
                            width: 110,
                          }}
                          type="number"
                          step="0.01"
                          min="0"
                          value={c.amount || ''}
                          onChange={(e) => {
                            const checks = [...draft.checks];
                            checks[i] = { ...checks[i]!, amount: parseFloat(e.target.value) || 0 };
                            setDraft({ ...draft, checks });
                          }}
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          onClick={() =>
                            setDraft({ ...draft, checks: draft.checks.filter((_, j) => j !== i) })
                          }
                          style={{
                            color: '#b42318',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                          }}
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                  <tr style={{ fontWeight: 700 }}>
                    <td colSpan={2} style={{ textAlign: 'right' }}>
                      Total checks
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                      {peso(draftChecksTotal)}
                    </td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            )}
            <button
              type="button"
              className="bill-btn bill-btn--sm"
              onClick={() =>
                setDraft({
                  ...draft,
                  checks: [...draft.checks, { checkNumber: '', bankName: '', amount: 0 }],
                })
              }
            >
              + Add check
            </button>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Cash count sheet (cash + checks = total collection) *</label>
            <CashCountSheet
              denominations={denoms}
              value={draft.cashCount}
              onChange={(v) => setDraft({ ...draft, cashCount: v })}
              checksTotal={draftChecksTotal}
            />
          </div>

          {/* Verification: counted collection (cash + checks) vs declared → shortage/overage */}
          {draftRemit > 0 && (
            <div
              style={{
                border: '1px solid #e4e7ec',
                borderRadius: 8,
                padding: '10px 14px',
                marginBottom: 12,
                maxWidth: 380,
                fontSize: 13,
                background: '#fff',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Cash counted</span>
                <span style={{ fontFamily: 'monospace' }}>{peso(draftCash)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Add: checks received</span>
                <span style={{ fontFamily: 'monospace' }}>{peso(draftChecksTotal)}</span>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontWeight: 600,
                  borderTop: '1px solid #eaecf0',
                  paddingTop: 4,
                  marginTop: 4,
                }}
              >
                <span>Total collection counted</span>
                <span style={{ fontFamily: 'monospace' }}>{peso(draftCounted)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Total remittance (declared)</span>
                <span style={{ fontFamily: 'monospace' }}>{peso(draftRemit)}</span>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontWeight: 700,
                  borderTop: '2px solid var(--mswd-navy,#0b2e63)',
                  paddingTop: 4,
                  marginTop: 4,
                  color: varianceLabel(draftVariance).color,
                }}
              >
                <span>Short / (over)</span>
                <span>{varianceLabel(draftVariance).text}</span>
              </div>
            </div>
          )}

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
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <CashCountSheet
              denominations={denoms}
              value={report.combinedCashCount}
              checksTotal={report.combinedChecksTotal}
            />
            <div
              style={{
                border: '1px solid #e4e7ec',
                borderRadius: 8,
                padding: '12px 16px',
                minWidth: 300,
                fontSize: 14,
                background: '#fff',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Total cash counted</span>
                <span style={{ fontFamily: 'monospace' }}>
                  {peso(report.combinedCashCountTotal)}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Add: checks received</span>
                <span style={{ fontFamily: 'monospace' }}>{peso(report.combinedChecksTotal)}</span>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontWeight: 600,
                  borderTop: '1px solid #eaecf0',
                  paddingTop: 5,
                  marginTop: 5,
                }}
              >
                <span>Total collection counted</span>
                <span style={{ fontFamily: 'monospace' }}>{peso(report.overallCountedTotal)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Total collections (declared)</span>
                <strong style={{ fontFamily: 'monospace' }}>{peso(report.totalAmount)}</strong>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontWeight: 700,
                  fontSize: 15,
                  borderTop: '2px solid var(--mswd-navy,#0b2e63)',
                  paddingTop: 6,
                  marginTop: 6,
                  color: varianceLabel(report.overallVariance).color,
                }}
              >
                <span>Short / (over)</span>
                <span>{varianceLabel(report.overallVariance).text}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
