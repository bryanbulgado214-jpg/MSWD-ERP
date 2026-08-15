import { useEffect, useState } from 'react';

import { useAuth } from '../../../app/auth';
import { getPositions, createPosition, updatePosition, HrApiError } from '../api';
import type { Position } from '../types';

import HrSubNav from './HrSubNav';
import './hr.css';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; data: Position[] };

export default function PositionListPage() {
  const { hasPermission } = useAuth();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [sg, setSg] = useState('');
  const [step, setStep] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  function load() {
    setState({ status: 'loading' });
    getPositions()
      .then((data) => setState({ status: 'loaded', data }))
      .catch((err) =>
        setState({ status: 'error', message: err instanceof HrApiError ? err.message : 'Failed.' }),
      );
  }

  useEffect(() => {
    load();
  }, []);

  function startNew() {
    setEditingId(null);
    setCode('');
    setTitle('');
    setSg('');
    setStep('');
    setFormError('');
    setShowForm(true);
  }

  function startEdit(p: Position) {
    setEditingId(p.id);
    setCode(p.code);
    setTitle(p.title);
    setSg(p.salaryGrade !== null ? String(p.salaryGrade) : '');
    setStep(p.salaryStep !== null ? String(p.salaryStep) : '');
    setFormError('');
    setShowForm(true);
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      if (editingId) {
        await updatePosition(editingId, {
          title,
          ...(sg ? { salaryGrade: Number(sg) } : {}),
          ...(step ? { salaryStep: Number(step) } : {}),
        });
      } else {
        await createPosition({
          code,
          title,
          ...(sg ? { salaryGrade: Number(sg) } : {}),
          ...(step ? { salaryStep: Number(step) } : {}),
        });
      }
      setShowForm(false);
      load();
    } catch (err) {
      setFormError(err instanceof HrApiError ? err.message : 'Failed.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="hr-page">
      <HrSubNav />
      <div className="hr-toolbar">
        <h2 style={{ margin: 0 }}>Positions</h2>
        {hasPermission('hr.employee.manage') && (
          <button type="button" className="hr-btn hr-btn--primary" onClick={startNew}>
            + New Position
          </button>
        )}
      </div>

      {showForm && (
        <form className="hr-form" onSubmit={handleSubmit} style={{ marginBottom: 20 }}>
          {formError && <div className="hr-error">{formError}</div>}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '120px 1fr 100px 100px',
              gap: '12px',
              alignItems: 'end',
            }}
          >
            <div className="hr-field">
              <label>Code *</label>
              <input
                required
                value={code}
                onChange={(ev) => setCode(ev.target.value)}
                disabled={!!editingId}
              />
            </div>
            <div className="hr-field">
              <label>Title *</label>
              <input required value={title} onChange={(ev) => setTitle(ev.target.value)} />
            </div>
            <div className="hr-field">
              <label>SG</label>
              <input type="number" value={sg} onChange={(ev) => setSg(ev.target.value)} />
            </div>
            <div className="hr-field">
              <label>Step</label>
              <input type="number" value={step} onChange={(ev) => setStep(ev.target.value)} />
            </div>
          </div>
          <div className="hr-form-actions">
            <button type="button" className="hr-btn" onClick={() => setShowForm(false)}>
              Cancel
            </button>
            <button type="submit" className="hr-btn hr-btn--primary" disabled={saving}>
              {saving ? 'Saving...' : editingId ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      )}

      {state.status === 'loading' && <p>Loading...</p>}
      {state.status === 'error' && <div className="hr-error">{state.message}</div>}
      {state.status === 'loaded' && state.data.length === 0 && (
        <div className="hr-empty">No positions found.</div>
      )}
      {state.status === 'loaded' && state.data.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="hr-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Title</th>
                <th>SG</th>
                <th>Step</th>
                <th>Employees</th>
                <th>Status</th>
                {hasPermission('hr.employee.manage') && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {state.data.map((p) => (
                <tr key={p.id}>
                  <td className="hr-text-mono">{p.code}</td>
                  <td>{p.title}</td>
                  <td>{p.salaryGrade ?? '--'}</td>
                  <td>{p.salaryStep ?? '--'}</td>
                  <td>{p._count.employees}</td>
                  <td>
                    <span className={`hr-badge hr-badge--${p.isActive ? 'active' : 'resigned'}`}>
                      {p.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  {hasPermission('hr.employee.manage') && (
                    <td>
                      <button
                        type="button"
                        className="hr-btn"
                        style={{ padding: '2px 8px', fontSize: '11px' }}
                        onClick={() => startEdit(p)}
                      >
                        Edit
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
