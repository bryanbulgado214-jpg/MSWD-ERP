import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { BudgetSummaryApiError, createBudgetRelease, getBudgetHeader, getBudgetHeaderSummary } from '../api';
import { formatPeso } from '../format-peso';
import type { BudgetAmountSummary, BudgetHeaderListItem } from '../types';
import './budget-detail.css';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; header: BudgetHeaderListItem; summary: BudgetAmountSummary };

export function CreateBudgetReleasePage() {
  const { budgetHeaderId } = useParams<{ budgetHeaderId: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [releaseNumber, setReleaseNumber] = useState('');
  const [releaseDate, setReleaseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [releasedAmount, setReleasedAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!budgetHeaderId) {
      setState({ status: 'error', message: 'No budget selected.' });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [header, summary] = await Promise.all([
          getBudgetHeader(budgetHeaderId),
          getBudgetHeaderSummary(budgetHeaderId),
        ]);
        if (!cancelled) setState({ status: 'loaded', header, summary });
      } catch (err) {
        if (!cancelled) setState({ status: 'error', message: err instanceof BudgetSummaryApiError ? err.message : 'Failed to load budget.' });
      }
    })();
    return () => { cancelled = true; };
  }, [budgetHeaderId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!budgetHeaderId) return;
    setSaving(true);
    setError(null);
    try {
      await createBudgetRelease({
        budgetHeaderId,
        releaseNumber: releaseNumber.trim(),
        releaseDate,
        releasedAmount: parseFloat(releasedAmount),
      });
      navigate(`/budgeting/budget-headers/${budgetHeaderId}`);
    } catch (err) {
      setError(err instanceof BudgetSummaryApiError ? err.message : 'Something went wrong creating this release.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="budget-detail">
      <Link className="budget-detail__back" to={`/budgeting/budget-headers/${budgetHeaderId}`}>
        ← Back to Budget Detail
      </Link>
      <h1 className="budget-detail__heading">Create Budget Release</h1>
      <p className="budget-detail__subheading">Release a portion of the approved budget for spending.</p>

      {state.status === 'loading' && <p className="budget-detail__status">Loading…</p>}
      {state.status === 'error' && <p className="budget-detail__status budget-detail__status--error">{state.message}</p>}

      {state.status === 'loaded' && (
        <>
          <section className="budget-detail__section">
            <div className="budget-detail__section-header">Budget Summary</div>
            <div className="budget-detail__section-body">
              <dl className="budget-detail__info-grid">
                <div className="budget-detail__info-item">
                  <dt>Responsibility Center</dt>
                  <dd>{state.header.responsibilityCenter.name}</dd>
                </div>
                <div className="budget-detail__info-item">
                  <dt>Fund Source</dt>
                  <dd>{state.header.fundSource.name}</dd>
                </div>
                <div className="budget-detail__info-item">
                  <dt>Approved Amount</dt>
                  <dd className="budget-detail__amount">{formatPeso(state.summary.approvedAmount)}</dd>
                </div>
                <div className="budget-detail__info-item">
                  <dt>Already Released</dt>
                  <dd className="budget-detail__amount">{formatPeso(state.summary.releasedAmount)}</dd>
                </div>
                <div className="budget-detail__info-item">
                  <dt>Available</dt>
                  <dd className="budget-detail__amount">{formatPeso(state.summary.availableAmount)}</dd>
                </div>
              </dl>
            </div>
          </section>

          <section className="budget-detail__section">
            <div className="budget-detail__section-header">Release Details</div>
            <div className="budget-detail__section-body">
              {error && <p className="budget-detail__banner budget-detail__banner--error">{error}</p>}

              <form onSubmit={handleSubmit}>
                <label className="budget-detail__field">
                  <span>Release Number</span>
                  <input type="text" maxLength={30} value={releaseNumber} onChange={(e) => setReleaseNumber(e.target.value)} required />
                </label>

                <label className="budget-detail__field">
                  <span>Release Date</span>
                  <input type="date" value={releaseDate} onChange={(e) => setReleaseDate(e.target.value)} required />
                </label>

                <label className="budget-detail__field">
                  <span>Released Amount</span>
                  <input type="number" step="0.01" min="0" value={releasedAmount} onChange={(e) => setReleasedAmount(e.target.value)} required />
                </label>

                <div className="budget-detail__modal-actions">
                  <Link to={`/budgeting/budget-headers/${budgetHeaderId}`} className="budget-detail__action-button budget-detail__action-button--secondary">
                    Cancel
                  </Link>
                  <button type="submit" className="budget-detail__action-button budget-detail__action-button--primary" disabled={saving || !releaseNumber.trim() || !releasedAmount}>
                    {saving ? 'Creating…' : 'Create Release'}
                  </button>
                </div>
              </form>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
