import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { useAuth } from '../../../app/auth';
import {
  AccountingApiError,
  approveJev,
  createJev,
  getChartOfAccounts,
  getJev,
  getOpenPeriods,
  postJev,
  reverseJev,
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
  approved: 'Approved',
  posted: 'Posted',
  voided: 'Voided',
  reversed: 'Reversed',
};

export default function JevDetailPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id;
  const navigate = useNavigate();
  const { permissions } = useAuth();

  const canCreate = permissions.has('accounting.jev.create');
  const canApprove = permissions.has('accounting.jev.approve');
  const canPost = permissions.has('accounting.jev.post');
  const canVoid = permissions.has('accounting.jev.void');
  const canReverse = permissions.has('accounting.jev.reverse');
  const canViewAudit = permissions.has('core.audit.read');

  const [jev, setJev] = useState<JevDetail | null>(null);
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
  const [periods, setPeriods] = useState<AccountingPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [showVoidForm, setShowVoidForm] = useState(false);
  const [reverseReason, setReverseReason] = useState('');
  const [showReverseForm, setShowReverseForm] = useState(false);

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

  useEffect(() => {
    loadRef();
  }, [loadRef]);

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
    if (!isBalanced) {
      setError('Debits and credits must balance.');
      return;
    }
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

  async function handleApprove() {
    if (!jev) return;
    setSaving(true);
    setError('');
    try {
      const result = await approveJev(jev.id, jev.version);
      setJev(result);
    } catch (e) {
      setError(e instanceof AccountingApiError ? e.message : 'Failed to approve.');
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

  async function handleReverse() {
    if (!jev) return;
    setSaving(true);
    setError('');
    try {
      // The reversal is a NEW, separate JEV. Navigate to it so the user
      // immediately sees the equal-and-opposite entry that was posted.
      const reversal = await reverseJev(jev.id, {
        expectedVersion: jev.version,
        ...(reverseReason.trim() ? { reason: reverseReason.trim() } : {}),
      });
      setShowReverseForm(false);
      setReverseReason('');
      navigate(`/accounting/jev/${reversal.id}`);
    } catch (e) {
      setError(e instanceof AccountingApiError ? e.message : 'Failed to reverse.');
    } finally {
      setSaving(false);
    }
  }

  if (loading)
    return (
      <div className="acct-page">
        <AccountingSubNav />
        <div className="acct-empty">Loading...</div>
      </div>
    );

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
              <input
                type="date"
                value={jevDate}
                onChange={(e) => setJevDate(e.target.value)}
                required
              />
            </div>
            <div className="acct-field">
              <label>Particulars</label>
              <input
                value={particulars}
                onChange={(e) => setParticulars(e.target.value)}
                required
                placeholder="Description of the journal entry"
              />
            </div>
          </div>

          <h3
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: 'var(--mswd-navy)',
              margin: '16px 0 8px',
            }}
          >
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
                        style={{
                          width: '100%',
                          maxWidth: 320,
                          boxSizing: 'border-box',
                          fontSize: 12,
                          padding: '4px 6px',
                        }}
                      >
                        <option value="">Select account...</option>
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.accountCode} — {a.name}
                          </option>
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
                        style={{
                          width: '100%',
                          textAlign: 'right',
                          fontSize: 13,
                          padding: '4px 6px',
                        }}
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
                        style={{
                          width: '100%',
                          textAlign: 'right',
                          fontSize: 13,
                          padding: '4px 6px',
                        }}
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
                        <button
                          type="button"
                          className="acct-btn acct-btn--sm"
                          onClick={() => removeLine(idx)}
                        >
                          ×
                        </button>
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

          <button
            type="button"
            className="acct-btn acct-btn--sm"
            onClick={addLine}
            style={{ marginBottom: 16 }}
          >
            + Add Line
          </button>

          <div className="acct-form-actions">
            <Link to="/accounting/jev" className="acct-btn">
              Cancel
            </Link>
            <button
              type="submit"
              className="acct-btn acct-btn--primary"
              disabled={saving || !isBalanced}
            >
              {saving ? 'Saving...' : 'Create JEV'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  // ── Detail View ──
  if (!jev)
    return (
      <div className="acct-page">
        <AccountingSubNav />
        <div className="acct-error">{error || 'JEV not found.'}</div>
      </div>
    );

  return (
    <div className="acct-page">
      <AccountingSubNav />
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <Link
          to="/accounting/jev"
          style={{ color: 'var(--mswd-blue)', textDecoration: 'none', fontSize: 13 }}
        >
          &larr; Back to JEV List
        </Link>
        {canViewAudit && (
          <Link
            to={`/admin/audit-trail?tableName=journal_entry_vouchers&recordId=${jev.id}`}
            style={{ color: 'var(--mswd-blue)', textDecoration: 'none', fontSize: 13 }}
            title="See who created, posted, or changed this JEV and when"
          >
            View audit history &rarr;
          </Link>
        )}
        <Link
          to={`/accounting/jev/${jev.id}/print`}
          style={{
            color: 'var(--mswd-blue)',
            textDecoration: 'none',
            fontSize: 13,
            marginLeft: 'auto',
          }}
          title="Print in the COA-prescribed Journal Entry Voucher form (Appendix 36)"
        >
          🖨 Print (COA JEV Form)
        </Link>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>{jev.jevNumber}</h1>
        <span className={`acct-badge acct-badge--${jev.status}`}>
          {STATUS_LABELS[jev.status] || jev.status}
        </span>
      </div>

      {error && <div className="acct-error">{error}</div>}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 16,
          marginBottom: 24,
        }}
      >
        <div>
          <dt
            style={{ color: '#667085', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}
          >
            Date
          </dt>
          <dd style={{ margin: 0, fontWeight: 500 }}>
            {new Date(jev.jevDate).toLocaleDateString('en-PH')}
          </dd>
        </div>
        <div>
          <dt
            style={{ color: '#667085', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}
          >
            Period
          </dt>
          <dd style={{ margin: 0, fontWeight: 500 }}>{jev.accountingPeriod.name}</dd>
        </div>
        <div>
          <dt
            style={{ color: '#667085', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}
          >
            Source
          </dt>
          <dd style={{ margin: 0, fontWeight: 500 }}>{jev.sourceType}</dd>
        </div>
        <div>
          <dt
            style={{ color: '#667085', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}
          >
            Created By
          </dt>
          <dd style={{ margin: 0, fontWeight: 500 }}>{jev.creator?.username || '—'}</dd>
        </div>
        {jev.responsibilityCenter && (
          <div>
            <dt
              style={{
                color: '#667085',
                fontSize: 11,
                fontWeight: 600,
                textTransform: 'uppercase',
              }}
            >
              Resp. Center
            </dt>
            <dd style={{ margin: 0, fontWeight: 500 }}>{jev.responsibilityCenter.code}</dd>
          </div>
        )}
        {jev.fundSource && (
          <div>
            <dt
              style={{
                color: '#667085',
                fontSize: 11,
                fontWeight: 600,
                textTransform: 'uppercase',
              }}
            >
              Fund Source
            </dt>
            <dd style={{ margin: 0, fontWeight: 500 }}>
              {jev.fundSource.code} — {jev.fundSource.name}
            </dd>
          </div>
        )}
        {jev.poster && (
          <div>
            <dt
              style={{
                color: '#667085',
                fontSize: 11,
                fontWeight: 600,
                textTransform: 'uppercase',
              }}
            >
              Posted By
            </dt>
            <dd style={{ margin: 0, fontWeight: 500 }}>
              {jev.poster.username} on {new Date(jev.postedAt!).toLocaleDateString('en-PH')}
            </dd>
          </div>
        )}
        {jev.voider && (
          <div>
            <dt
              style={{
                color: '#667085',
                fontSize: 11,
                fontWeight: 600,
                textTransform: 'uppercase',
              }}
            >
              Voided By
            </dt>
            <dd style={{ margin: 0, fontWeight: 500 }}>{jev.voider.username}</dd>
          </div>
        )}
      </div>

      <div
        style={{
          background: '#f8f9fc',
          padding: '12px 16px',
          borderRadius: 8,
          marginBottom: 20,
          fontSize: 14,
        }}
      >
        <strong>Particulars:</strong> {jev.particulars}
      </div>

      {jev.voidReason && (
        <div
          style={{
            background: '#fef3f2',
            padding: '12px 16px',
            borderRadius: 8,
            marginBottom: 20,
            fontSize: 13,
            color: '#b42318',
          }}
        >
          <strong>Void Reason:</strong> {jev.voidReason}
        </div>
      )}

      {jev.reversedBy && (
        <div
          style={{
            background: '#fffaeb',
            border: '1px solid #fedf89',
            padding: '12px 16px',
            borderRadius: 8,
            marginBottom: 20,
            fontSize: 13,
            color: '#b54708',
          }}
        >
          <strong>This entry was reversed.</strong> A linked equal-and-opposite entry{' '}
          <Link
            to={`/accounting/jev/${jev.reversedBy.id}`}
            style={{ color: '#b54708', fontWeight: 700 }}
          >
            {jev.reversedBy.jevNumber}
          </Link>{' '}
          was posted to correct it. The original is retained (immutable) for the audit trail.
        </div>
      )}

      {jev.reversalOf && (
        <div
          style={{
            background: '#eff8ff',
            border: '1px solid #b2ddff',
            padding: '12px 16px',
            borderRadius: 8,
            marginBottom: 20,
            fontSize: 13,
            color: '#175cd3',
          }}
        >
          <strong>Reversing entry.</strong> This JEV reverses{' '}
          <Link
            to={`/accounting/jev/${jev.reversalOf.id}`}
            style={{ color: '#175cd3', fontWeight: 700 }}
          >
            {jev.reversalOf.jevNumber}
          </Link>{' '}
          with equal-and-opposite amounts.
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
        {jev.status === 'for_review' && canApprove && (
          <button className="acct-btn acct-btn--primary" onClick={handleApprove} disabled={saving}>
            Approve JEV
          </button>
        )}
        {(jev.status === 'for_review' || jev.status === 'approved') && canPost && (
          <button className="acct-btn acct-btn--primary" onClick={handlePost} disabled={saving}>
            Post JEV
          </button>
        )}
        {jev.status === 'posted' && !jev.reversedBy && canReverse && (
          <button
            className="acct-btn"
            style={{ color: '#b54708', borderColor: 'rgba(181,71,8,0.3)' }}
            onClick={() => setShowReverseForm(!showReverseForm)}
            disabled={saving}
          >
            Reverse JEV
          </button>
        )}
        {jev.status !== 'voided' &&
          jev.status !== 'reversed' &&
          jev.status !== 'posted' &&
          canVoid && (
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

      {showReverseForm && (
        <div className="acct-form" style={{ marginTop: 16 }}>
          <p style={{ fontSize: 13, color: '#475467', margin: '0 0 12px' }}>
            Posting a reversal creates a new, linked JEV with the debits and credits swapped. The
            original entry stays in the ledger (immutable) and both net to zero — nothing is
            deleted.
          </p>
          <div className="acct-field">
            <label>Reason for Reversal (optional)</label>
            <textarea
              value={reverseReason}
              onChange={(e) => setReverseReason(e.target.value)}
              rows={2}
              placeholder="e.g. posted to the wrong account / duplicate entry"
            />
          </div>
          <div className="acct-form-actions">
            <button type="button" className="acct-btn" onClick={() => setShowReverseForm(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="acct-btn"
              style={{ color: '#fff', background: '#b54708', borderColor: '#b54708' }}
              onClick={handleReverse}
              disabled={saving}
            >
              {saving ? 'Reversing...' : 'Post Reversing Entry'}
            </button>
          </div>
        </div>
      )}

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
            <button type="button" className="acct-btn" onClick={() => setShowVoidForm(false)}>
              Cancel
            </button>
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
