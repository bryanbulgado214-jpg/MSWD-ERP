import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getDepreciationRuns, createDepreciationRun } from '../api';
import type { DepreciationRun, DepreciationRunStatus } from '../types';
import { DEPR_RUN_STATUS_LABELS } from '../types';
import AssetSubNav from './AssetSubNav';
import '../asset.css';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatCurrency(val: string | number) {
  return Number(val).toLocaleString('en-PH', { minimumFractionDigits: 2 });
}

export default function DepreciationRunsPage() {
  const navigate = useNavigate();
  const [runs, setRuns] = useState<DepreciationRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [showForm, setShowForm] = useState(false);
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState('');

  function loadRuns() {
    setLoading(true);
    setError('');
    getDepreciationRuns(statusFilter || undefined)
      .then(setRuns)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadRuns(); }, [statusFilter]);

  async function handleCreate(e: { preventDefault(): void }) {
    e.preventDefault();
    setCreating(true);
    setFormError('');
    try {
      const run = await createDepreciationRun({ periodMonth: month, periodYear: year });
      setShowForm(false);
      navigate(`/assets/depreciation/${run.id}`);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to create run');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="am-page">
      <AssetSubNav />
      <div className="am-page__header">
        <h1>Depreciation Runs</h1>
        <div className="am-page__actions">
          <button type="button" className="am-btn am-btn--primary" onClick={() => { setShowForm(!showForm); setFormError(''); }}>
            {showForm ? 'Cancel' : '+ New Run'}
          </button>
        </div>
      </div>

      {error && <div className="am-error">{error}</div>}

      {showForm && (
        <div className="am-inline-form">
          <h2 style={{ margin: '0 0 1rem', fontSize: '1.1rem' }}>New Depreciation Run</h2>
          {formError && <div className="am-error">{formError}</div>}
          <form onSubmit={handleCreate} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div className="am-form__field">
              <label className="am-form__label">Month</label>
              <select className="am-select" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
                {MONTHS.map((m, i) => (
                  <option key={i} value={i + 1}>{m}</option>
                ))}
              </select>
            </div>
            <div className="am-form__field">
              <label className="am-form__label">Year</label>
              <input className="am-input" type="number" min="2020" max="2099" value={year} onChange={(e) => setYear(Number(e.target.value))} />
            </div>
            <button type="submit" className="am-btn am-btn--primary" disabled={creating}>
              {creating ? 'Creating...' : 'Create Run'}
            </button>
          </form>
        </div>
      )}

      <div className="am-filters">
        <select className="am-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="posted">Posted</option>
          <option value="voided">Voided</option>
        </select>
      </div>

      {loading ? (
        <div className="am-loading">Loading...</div>
      ) : runs.length === 0 ? (
        <div className="am-empty">No depreciation runs found.</div>
      ) : (
        <div className="am-table-wrap">
          <table className="am-table">
            <thead>
              <tr>
                <th>Run #</th>
                <th>Period</th>
                <th>Status</th>
                <th>Assets</th>
                <th>Total Depreciation</th>
                <th>Posted By</th>
                <th>JEV #</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id} onClick={() => navigate(`/assets/depreciation/${run.id}`)}>
                  <td>
                    <Link to={`/assets/depreciation/${run.id}`} className="am-link" onClick={(e) => e.stopPropagation()}>
                      {run.runNumber}
                    </Link>
                  </td>
                  <td>{MONTHS[(run.periodMonth - 1)] ?? run.periodMonth} {run.periodYear}</td>
                  <td>
                    <span className={`am-badge am-badge--status-${run.status}`}>
                      {DEPR_RUN_STATUS_LABELS[run.status as DepreciationRunStatus] ?? run.status}
                    </span>
                  </td>
                  <td>{run.assetCount}</td>
                  <td>{formatCurrency(run.totalDepreciation)}</td>
                  <td>{run.poster?.username ?? '—'}</td>
                  <td>
                    {run.jev ? (
                      <Link to={`/accounting/jev/${run.jev.id}`} className="am-link" onClick={(e) => e.stopPropagation()}>
                        {run.jev.jevNumber}
                      </Link>
                    ) : '—'}
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
