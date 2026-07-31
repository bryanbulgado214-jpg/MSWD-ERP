import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import {
  BudgetSummaryApiError,
  createBudgetHeader,
  listBudgetCycles,
  listBudgetVersionsForCycle,
  listFundSources,
  listResponsibilityCenters,
} from '../api';
import type { LookupItem } from '../api';
import type { BudgetCycleSummary, BudgetVersionSummary } from '../types';
import './budget-detail.css';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'loaded';
      cycles: BudgetCycleSummary[];
      versions: BudgetVersionSummary[];
      responsibilityCenters: LookupItem[];
      fundSources: LookupItem[];
    };

export function CreateBudgetHeaderPage() {
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [selectedCycleId, setSelectedCycleId] = useState('');
  const [selectedVersionId, setSelectedVersionId] = useState('');
  const [responsibilityCenterId, setResponsibilityCenterId] = useState('');
  const [fundSourceId, setFundSourceId] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [currencyCode, setCurrencyCode] = useState('PHP');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [cycles, rcs, fss] = await Promise.all([
          listBudgetCycles(),
          listResponsibilityCenters(),
          listFundSources(),
        ]);
        if (!cancelled) setState({ status: 'loaded', cycles, versions: [], responsibilityCenters: rcs, fundSources: fss });
      } catch (err) {
        if (!cancelled) setState({ status: 'error', message: err instanceof BudgetSummaryApiError ? err.message : 'Failed to load form data.' });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!selectedCycleId || state.status !== 'loaded') return;
    let cancelled = false;
    (async () => {
      try {
        const versions = await listBudgetVersionsForCycle(selectedCycleId);
        if (!cancelled) setState((s) => (s.status === 'loaded' ? { ...s, versions } : s));
      } catch {
        // non-fatal
      }
    })();
    return () => { cancelled = true; };
  }, [selectedCycleId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const created = await createBudgetHeader({
        budgetVersionId: selectedVersionId,
        responsibilityCenterId,
        fundSourceId,
        totalAmount: parseFloat(totalAmount),
        ...(currencyCode ? { currencyCode } : {}),
      });
      navigate(`/budgeting/budget-headers/${created.id}`);
    } catch (err) {
      setError(err instanceof BudgetSummaryApiError ? err.message : 'Something went wrong creating this budget.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="budget-detail">
      <Link className="budget-detail__back" to="/budgeting">← Back to Budgets</Link>
      <h1 className="budget-detail__heading">Create New Budget</h1>
      <p className="budget-detail__subheading">Create a new budget header for a responsibility center and fund source.</p>

      {state.status === 'loading' && <p className="budget-detail__status">Loading…</p>}
      {state.status === 'error' && <p className="budget-detail__status budget-detail__status--error">{state.message}</p>}

      {state.status === 'loaded' && (
        <section className="budget-detail__section">
          <div className="budget-detail__section-header">Budget Information</div>
          <div className="budget-detail__section-body">
            {error && <p className="budget-detail__banner budget-detail__banner--error">{error}</p>}

            <form onSubmit={handleSubmit}>
              <label className="budget-detail__field">
                <span>Budget Cycle</span>
                <select value={selectedCycleId} onChange={(e) => { setSelectedCycleId(e.target.value); setSelectedVersionId(''); }} required>
                  <option value="">Select a cycle…</option>
                  {state.cycles.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </label>

              <label className="budget-detail__field">
                <span>Budget Version</span>
                <select value={selectedVersionId} onChange={(e) => setSelectedVersionId(e.target.value)} required disabled={!selectedCycleId}>
                  <option value="">Select a version…</option>
                  {state.versions.map((v) => (
                    <option key={v.id} value={v.id}>{v.name} (v{v.versionNumber})</option>
                  ))}
                </select>
              </label>

              <label className="budget-detail__field">
                <span>Responsibility Center</span>
                <select value={responsibilityCenterId} onChange={(e) => setResponsibilityCenterId(e.target.value)} required>
                  <option value="">Select a responsibility center…</option>
                  {state.responsibilityCenters.map((rc) => (
                    <option key={rc.id} value={rc.id}>{rc.code} — {rc.name}</option>
                  ))}
                </select>
              </label>

              <label className="budget-detail__field">
                <span>Fund Source</span>
                <select value={fundSourceId} onChange={(e) => setFundSourceId(e.target.value)} required>
                  <option value="">Select a fund source…</option>
                  {state.fundSources.map((fs) => (
                    <option key={fs.id} value={fs.id}>{fs.code} — {fs.name}</option>
                  ))}
                </select>
              </label>

              <label className="budget-detail__field">
                <span>Total Amount</span>
                <input type="number" step="0.01" min="0" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} required />
              </label>

              <label className="budget-detail__field">
                <span>Currency Code</span>
                <input type="text" value={currencyCode} onChange={(e) => setCurrencyCode(e.target.value)} />
              </label>

              <div className="budget-detail__modal-actions">
                <Link to="/budgeting" className="budget-detail__action-button budget-detail__action-button--secondary">Cancel</Link>
                <button type="submit" className="budget-detail__action-button budget-detail__action-button--primary" disabled={saving || !selectedVersionId || !responsibilityCenterId || !fundSourceId || !totalAmount}>
                  {saving ? 'Creating…' : 'Create Budget'}
                </button>
              </div>
            </form>
          </div>
        </section>
      )}
    </div>
  );
}
