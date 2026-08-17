import { useEffect, useState } from 'react';

import { AccountingSubNav } from './AccountingSubNav';

import './accounting.css';
import {
  getPeriodFiscalYears,
  createFiscalYear,
  closeFiscalYear,
  getPeriodList,
  lockPeriod,
  unlockPeriod,
  closePeriod,
  reopenPeriod,
} from '../api';
import type { FiscalYearDetail, PeriodDetail } from '../types';

export default function PeriodManagementPage() {
  const [fiscalYears, setFiscalYears] = useState<FiscalYearDetail[]>([]);
  const [selectedFY, setSelectedFY] = useState<FiscalYearDetail | null>(null);
  const [periods, setPeriods] = useState<PeriodDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showFYForm, setShowFYForm] = useState(false);
  const [fyYear, setFyYear] = useState(new Date().getFullYear() + 1);

  const loadFiscalYears = async () => {
    setLoading(true);
    try {
      const fy = await getPeriodFiscalYears();
      setFiscalYears(fy);
      const first = fy[0];
      if (first && !selectedFY) setSelectedFY(first);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFiscalYears();
  }, []);

  useEffect(() => {
    if (!selectedFY) {
      setPeriods([]);
      return;
    }
    getPeriodList(selectedFY.id)
      .then(setPeriods)
      .catch((err) => setError(err.message));
  }, [selectedFY?.id]);

  const handleCreateFY = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const fy = await createFiscalYear({
        year: fyYear,
        name: `FY${fyYear}`,
        startDate: `${fyYear}-01-01`,
        endDate: `${fyYear}-12-31`,
      });
      setShowFYForm(false);
      await loadFiscalYears();
      setSelectedFY(fy);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleCloseFY = async () => {
    if (!selectedFY) return;
    if (!confirm(`Close fiscal year ${selectedFY.name}? This cannot be undone.`)) return;
    setError('');
    try {
      const updated = await closeFiscalYear(selectedFY.id, selectedFY.version);
      setSelectedFY(updated);
      await loadFiscalYears();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handlePeriodAction = async (
    period: PeriodDetail,
    action: 'lock' | 'unlock' | 'close' | 'reopen',
  ) => {
    setError('');
    const actions = {
      lock: lockPeriod,
      unlock: unlockPeriod,
      close: closePeriod,
      reopen: reopenPeriod,
    };
    if (action === 'close' && !confirm(`Close ${period.name}? Posting will no longer be allowed.`))
      return;
    try {
      const updated = await actions[action](period.id, period.version);
      setPeriods((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    } catch (err: any) {
      setError(err.message);
    }
  };

  const openCount = periods.filter((p) => p.status === 'open').length;
  const closedCount = periods.filter((p) => p.status === 'closed').length;
  const lockedCount = periods.filter((p) => p.status === 'open' && p.lockedAt).length;

  return (
    <div className="acct-page">
      <AccountingSubNav />
      <h1>Period Management</h1>

      {error && <div className="acct-error">{error}</div>}

      <div className="acct-toolbar">
        <select
          value={selectedFY?.id ?? ''}
          onChange={(e) => {
            const fy = fiscalYears.find((f) => f.id === e.target.value);
            setSelectedFY(fy ?? null);
          }}
        >
          {fiscalYears.map((fy) => (
            <option key={fy.id} value={fy.id}>
              FY {fy.year} — {fy.name} ({fy.status})
            </option>
          ))}
        </select>

        {selectedFY && selectedFY.status === 'open' && (
          <button className="acct-btn" onClick={handleCloseFY}>
            Close Fiscal Year
          </button>
        )}

        <button className="acct-btn acct-btn--primary" onClick={() => setShowFYForm(!showFYForm)}>
          + New Fiscal Year
        </button>
      </div>

      {showFYForm && (
        <form className="acct-form" onSubmit={handleCreateFY}>
          <div className="acct-form-row">
            <div className="acct-field">
              <label>Year</label>
              <input
                type="number"
                min="2020"
                max="2099"
                value={fyYear}
                onChange={(e) => setFyYear(Number(e.target.value))}
                required
              />
            </div>
            <div className="acct-field" style={{ display: 'flex', alignItems: 'flex-end' }}>
              <div className="acct-form-actions" style={{ margin: 0 }}>
                <button type="button" className="acct-btn" onClick={() => setShowFYForm(false)}>
                  Cancel
                </button>
                <button type="submit" className="acct-btn acct-btn--primary">
                  Create FY{fyYear}
                </button>
              </div>
            </div>
          </div>
        </form>
      )}

      {selectedFY && (
        <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
          <div className="acct-form" style={{ flex: 1, padding: 12, textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--mswd-navy)' }}>
              {openCount}
            </div>
            <div style={{ fontSize: 12, color: '#667085' }}>Open</div>
          </div>
          <div className="acct-form" style={{ flex: 1, padding: 12, textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#a16207' }}>{lockedCount}</div>
            <div style={{ fontSize: 12, color: '#667085' }}>Locked</div>
          </div>
          <div className="acct-form" style={{ flex: 1, padding: 12, textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#067647' }}>{closedCount}</div>
            <div style={{ fontSize: 12, color: '#667085' }}>Closed</div>
          </div>
        </div>
      )}

      {loading && <div className="acct-empty">Loading...</div>}

      {!loading && periods.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="acct-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Period</th>
                <th>Date Range</th>
                <th>JEVs</th>
                <th>Status</th>
                <th>Locked</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {periods.map((p) => {
                const isOpen = p.status === 'open';
                const isLocked = !!p.lockedAt;
                const isClosed = p.status === 'closed';
                const fyIsClosed = selectedFY?.status === 'closed';

                return (
                  <tr key={p.id}>
                    <td>{p.periodNumber}</td>
                    <td style={{ fontWeight: 600 }}>{p.name}</td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 13 }}>
                      {new Date(p.startDate).toLocaleDateString()} —{' '}
                      {new Date(p.endDate).toLocaleDateString()}
                    </td>
                    <td className="acct-text-mono">{p._count.journalEntryVouchers}</td>
                    <td>
                      <span
                        className={`acct-badge ${isClosed ? 'acct-badge--closed' : 'acct-badge--active'}`}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td>
                      {isLocked && (
                        <span style={{ fontSize: 12, color: '#a16207' }}>
                          Locked by {p.locker?.username} on{' '}
                          {new Date(p.lockedAt!).toLocaleDateString()}
                        </span>
                      )}
                      {!isLocked && isOpen && (
                        <span style={{ fontSize: 12, color: '#667085' }}>Unlocked</span>
                      )}
                    </td>
                    <td>
                      {!fyIsClosed && (
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {isOpen && !isLocked && (
                            <button
                              className="acct-btn acct-btn--sm"
                              onClick={() => handlePeriodAction(p, 'lock')}
                            >
                              Lock
                            </button>
                          )}
                          {isOpen && isLocked && (
                            <button
                              className="acct-btn acct-btn--sm"
                              onClick={() => handlePeriodAction(p, 'unlock')}
                            >
                              Unlock
                            </button>
                          )}
                          {isOpen && (
                            <button
                              className="acct-btn acct-btn--sm"
                              onClick={() => handlePeriodAction(p, 'close')}
                            >
                              Close
                            </button>
                          )}
                          {isClosed && (
                            <button
                              className="acct-btn acct-btn--sm"
                              onClick={() => handlePeriodAction(p, 'reopen')}
                            >
                              Reopen
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
