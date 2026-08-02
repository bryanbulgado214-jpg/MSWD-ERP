import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { useAuth } from '../../../app/auth';
import {
  AccountingApiError,
  createJev,
  getChartOfAccounts,
  getJev,
  getOpenPeriods,
  postJev,
  submitJev,
  voidJev,
} from '../api';
import type { AccountingPeriod, ChartOfAccount, JevDetail } from '../types';
import { AccountingSubNav } from './AccountingSubNav';
import './accounting.css';

interface LineDraft {
  chartOfAccountId: string;
  debitAmount: string;
  creditAmount: string;
  description: string;
}

function emptyLine(): LineDraft {
  return { chartOfAccountId: '', debitAmount: '', creditAmount: '', description: '' };
}

function formatPeso(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return num.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  for_review: 'For Review',
  posted: 'Posted',
  voided: 'Voided',
};

export default function JevDetailPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id;
  const navigate = useNavigate();
  const { permissions } = useAuth();

  const canCreate = permissions.has('accounting.jev.create');
  const canPost = permissions.has('accounting.jev.post');
  const canVoid = permissions.has('accounting.jev.void');

  const [jev, setJev] = useState<JevDetail | null>(null);
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
  const [periods, setPeriods] = useState<AccountingPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [showVoidForm, setShowVoidForm] = useState(false);

  // Form state
  const [jevDate, setJevDate] = useState(new Date().toISOString().slice(0, 10));
  const [particulars, setParticulars] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([emptyLine(), emptyLine()]);

  const loadRef = useCallback(async () => {
    try {
      const [accts, prds] = await Promise.all([
        getChartOfAccounts('includeInactive=false'),
        getOpenPeriods(),
      ]);
      setAccounts(accts.filter((a) => !a.isHeader));
      setPeriods(prds);

      if (!isNew && id) {
        const data = await getJev(id);
        setJev(data);
        setJevDate(new Date(data.jevDate).toISOString().slice(0, 10));
        setParticulars(data.particulars);
        setLines(
          data.lines.map((l) => ({
            chartOfAccountId: l.chartOfAccount.id,
            debitAmount: Number(l.debitAmount) > 0 ? l.debitAmount : '',
            creditAmount: Number(l.creditAmount) > 0 ? l.creditAmount : '',
            description: l.description || '',
          })),
        );
      }
    } catch (e) {
      setError(e instanceof AccountingApiError ? e.message : 'Failed to load.');
    } finally {
      setLoading(false);
    }
  }, [id, isNew]);

  useEffect(() => { loadRef(); }, [loadRef]);

  function addLine() {
    setLines([...lines, emptyLine()]);
  }

  function removeLine(idx: number) {
    if (lines.length <= 2) return;
    setLines(lines.filter((_, i) => i !== idx));
  }

  function updateLine(idx: number, field: keyof LineDraft, value: string) {
    const next = [...lines];
    next[idx] = { ...next[idx], [field]: value };
    if (field === 'debitAmount' && value) next[idx].creditAmount = '';
    if (field === 'creditAmount' && value) next[idx].debitAmount = '';
    setLines(next);
  }

  const totalDebit = lines.reduce((s, l) => s + (parseFloat(l.debitAmount) || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (parseFloat(l.creditAmount) || 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!isBalanced) { setError('Debits and credits must balance.'); return; }
    setError('');
    setSaving(true);
    try {
      const payload = {
        jevDate,
        particulars,
        lines: lines
          .filter((l) => l.chartOfAccountId)
          .map((l) => ({
            chartOfAccountId: l.chartOfAccountId,
            debitAmount: parseFloat(l.debitAmount) || 0,
            creditAmount: parseFloat(l.creditAmount) || 0,
            ...(l.description ? { description: l.description } : {}),
          })),
      };
      const result = await createJev(payload);
      navigate(`/accounting/jev/${result.id}`, { replace: true });
    } catch (e) {
      setError(e instanceof AccountingApiError ? e.message : 'Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit() {
    if (!jev) return;
    setSaving(true);
    setError('');
    try {
      const result = await submitJev(jev.id, jev.version);
      setJev(result);
    } catch (e) {
      setError(e instanceof AccountingApiError ? e.message : 'Failed to submit.');
    } finally {
      setSaving(false);
    }
  }

  async function handlePost() {
    if (!jev) return;
    setSaving(true);
    setError('');
    try {
      const result = await postJev(jev.id, jev.version);
      setJev(result);
    } catch (e) {
      setError(e instanceof AccountingApiError ? e.message : 'Failed to post.');
    } finally {
      setSaving(false);
    }
  }

  async function handleVoid() {
    if (!jev || !voidReason.trim()) return;
    setSaving(true);
    setError('');
    try {
      const result = await voidJev(jev.id, { expectedVersion: jev.version, voidReason });
      setJev(result);
      setShowVoidForm(false);
    } catch (e) {
      setError(e instanceof AccountingApiError ? e.message : 'Failed to void.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="acct-page"><AccountingSubNav /><div className="acct-empty">Loading...</div></div>;

  // ── Create Form ──
  if (isNew) {
    return (
      <div className="acct-page">
        <AccountingSubNav />
        <h1>New Journal Entry Voucher</h1>
        {error && <div className="acct-error">{error}</div>}
        <form className="acct-form" onSubmit={handleSave}>
          <div className="acct-form-row">
            <div className="acct-field">
              <label>JEV Date</label>
              <input type="date" value={jevDate} onChange={(e) => setJevDate(e.target.value)} required />
            </div>
            <div className="acct-field">
              <label>Particulars</label>
              <input value={particulars} onChange={(e) => setParticulars(e.target.value)} required placeholder="Description of the journal entry" />
            </div>
          </div>

          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--mswd-navy)', margin: '16px 0 8px' }}>
            Entry Lines
          </h3>

          <div style={{ overflowX: 'auto' }}>
            <table className="acct-table" style={{ marginBottom: 8 }}>
              <thead>
                <tr>
                  <th style={{ minWidth: 280 }}>Account</th>
                  <th style={{ width: 130 }}>Debit</th>
                  <th style={{ width: 130 }}>Credit</th>
                  <th style={{ minWidth: 160 }}>Description</th>
                  <th style={{ width: 40 }}></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, idx) => (
                  <tr key={idx}>
                    <td>
                      <select
                        value={line.chartOfAccountId}
                        onChange={(e) => updateLine(idx, 'chartOfAccountId', e.target.value)}
                        required
                        style={{ width: '100%', fontSize: 12, padding: '4px 6px' }}
                      >
                        <option value="">Select account...</option>
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>{a.accountCode} — {a.name}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={line.debitAmount}
                        onChange={(e) => updateLine(idx, 'debitAmount', e.target.value)}
                        style={{ width: '100%', textAlign: 'right', fontSize: 13, padding: '4px 6px' }}
                        placeholder="0.00"
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={line.creditAmount}
                        onChange={(e) => updateLine(idx, 'creditAmount', e.target.value)}
                        style={{ width: '100%', textAlign: 'right', fontSize: 13, padding: '4px 6px' }}
                        placeholder="0.00"
                      />
                    </td>
                    <td>
                      <input
                        value={line.description}
                        onChange={(e) => updateLine(idx, 'description', e.target.value)}
                        style={{ width: '100%', fontSize: 12, padding: '4px 6px' }}
                        placeholder="Optional"
                      />
                    </td>
                    <td>
                      {lines.length > 2 && (
                        <button type="button" className="acct-btn acct-btn--sm" onClick={() => removeLine(idx)}>×</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ fontWeight: 700 }}>
                  <td>Totals</td>
                  <td className="acct-text-right acct-text-mono">{formatPeso(totalDebit)}</td>
                  <td className="acct-text-right acct-text-mono">{formatPeso(totalCredit)}</td>
                  <td colSpan={2}>
                    {isBalanced ? (
                      <span style={{ color: '#067647', fontSize: 12 }}>Balanced</span>
                    ) : totalDebit > 0 || totalCredit > 0 ? (
                      <span style={{ color: '#b42318', fontSize: 12 }}>
                        Difference: {formatPeso(Math.abs(totalDebit - totalCredit))}
                      </span>
                    ) : null}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <button type="button" className="acct-btn acct-btn--sm" onClick={addLine} style={{ marginBottom: 16 }}>
            + Add Line
          </button>

          <div className="acct-form-actions">
            <Link to="/accounting/jev" className="acct-btn">Cancel</Link>
            <button type="submit" className="acct-btn acct-btn--primary" disabled={saving || !isBalanced}>
              {saving ? 'Saving...' : 'Create JEV'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  // ── Detail View ──
  if (!jev) return <div className="acct-page"><AccountingSubNav /><div className="acct-error">{error || 'JEV not found.'}</div></div>;

  return (
    <div className="acct-page">
      <AccountingSubNav />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Link to="/accounting/jev" style={{ color: 'var(--mswd-blue)', textDecoration: 'none', fontSize: 13 }}>
          &larr; Back to JEV List
        </Link>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>{jev.jevNumber}</h1>
        <span className={`acct-badge acct-badge--${jev.status}`}>
          {STATUS_LABELS[jev.status] || jev.status}
        </span>
      </div>

      {error && <div className="acct-error">{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16, marginBottom: 24 }}>
        <div><dt style={{ color: '#667085', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>Date</dt><dd style={{ margin: 0, fontWeight: 500 }}>{new Date(jev.jevDate).toLocaleDateString('en-PH')}</dd></div>
        <div><dt style={{ color: '#667085', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>Period</dt><dd style={{ margin: 0, fontWeight: 500 }}>{jev.accountingPeriod.name}</dd></div>
        <div><dt style={{ color: '#667085', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>Source</dt><dd style={{ margin: 0, fontWeight: 500 }}>{jev.sourceType}</dd></div>
        <div><dt style={{ color: '#667085', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>Created By</dt><dd style={{ margin: 0, fontWeight: 500 }}>{jev.creator?.username || '—'}</dd></div>
        {jev.responsibilityCenter && (
          <div><dt style={{ color: '#667085', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>Resp. Center</dt><dd style={{ margin: 0, fontWeight: 500 }}>{jev.responsibilityCenter.code}</dd></div>
        )}
        {jev.fundSource && (
          <div><dt style={{ color: '#667085', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>Fund Source</dt><dd style={{ margin: 0, fontWeight: 500 }}>{jev.fundSource.code} — {jev.fundSource.name}</dd></div>
        )}
        {jev.poster && (
          <div><dt style={{ color: '#667085', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>Posted By</dt><dd style={{ margin: 0, fontWeight: 500 }}>{jev.poster.username} on {new Date(jev.postedAt!).toLocaleDateString('en-PH')}</dd></div>
        )}
        {jev.voider && (
          <div><dt style={{ color: '#667085', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>Voided By</dt><dd style={{ margin: 0, fontWeight: 500 }}>{jev.voider.username}</dd></div>
        )}
      </div>

      <div style={{ background: '#f8f9fc', padding: '12px 16px', borderRadius: 8, marginBottom: 20, fontSize: 14 }}>
        <strong>Particulars:</strong> {jev.particulars}
      </div>

      {jev.voidReason && (
        <div style={{ background: '#fef3f2', padding: '12px 16px', borderRadius: 8, marginBottom: 20, fontSize: 13, color: '#b42318' }}>
          <strong>Void Reason:</strong> {jev.voidReason}
        </div>
      )}

      <div style={{ overflowX: 'auto', marginBottom: 24 }}>
        <table className="acct-table">
          <thead>
            <tr>
              <th>Account Code</th>
              <th>Account Name</th>
              <th>Description</th>
              <th className="acct-text-right">Debit</th>
              <th className="acct-text-right">Credit</th>
            </tr>
          </thead>
          <tbody>
            {jev.lines.map((line) => (
              <tr key={line.id}>
                <td className="acct-text-mono">{line.chartOfAccount.accountCode}</td>
                <td>{line.chartOfAccount.name}</td>
                <td style={{ color: '#667085', fontSize: 12 }}>{line.description || '—'}</td>
                <td className="acct-text-right acct-text-mono">
                  {Number(line.debitAmount) > 0 ? formatPeso(line.debitAmount) : ''}
                </td>
                <td className="acct-text-right acct-text-mono">
                  {Number(line.creditAmount) > 0 ? formatPeso(line.creditAmount) : ''}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 700 }}>
              <td colSpan={3}>Totals</td>
              <td className="acct-text-right acct-text-mono">{formatPeso(jev.totalDebit)}</td>
              <td className="acct-text-right acct-text-mono">{formatPeso(jev.totalCredit)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {jev.status === 'draft' && canCreate && (
          <button className="acct-btn acct-btn--primary" onClick={handleSubmit} disabled={saving}>
            Submit for Review
          </button>
        )}
        {jev.status === 'for_review' && canPost && (
          <button className="acct-btn acct-btn--primary" onClick={handlePost} disabled={saving}>
            Post JEV
          </button>
        )}
        {jev.status !== 'voided' && canVoid && (
          <button
            className="acct-btn"
            style={{ color: '#b42318', borderColor: 'rgba(180,35,24,0.3)' }}
            onClick={() => setShowVoidForm(!showVoidForm)}
            disabled={saving}
          >
            Void JEV
          </button>
        )}
      </div>

      {showVoidForm && (
        <div className="acct-form" style={{ marginTop: 16 }}>
          <div className="acct-field">
            <label>Reason for Voiding</label>
            <textarea
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              rows={3}
              required
              placeholder="Explain why this JEV is being voided..."
            />
          </div>
          <div className="acct-form-actions">
            <button type="button" className="acct-btn" onClick={() => setShowVoidForm(false)}>Cancel</button>
            <button
              type="button"
              className="acct-btn"
              style={{ color: '#b42318', borderColor: '#b42318' }}
              onClick={handleVoid}
              disabled={saving || !voidReason.trim()}
            >
              {saving ? 'Voiding...' : 'Confirm Void'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
