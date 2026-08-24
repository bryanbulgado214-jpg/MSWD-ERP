import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import {
  AccountingApiError,
  addReminder,
  deleteReminder,
  getPendingActions,
  getWorkspace,
  saveWorkspaceNotes,
  updateReminder,
} from '../api';
import type { AccountingWorkspace, PendingActionItem, WorkspaceReminder } from '../types';

function peso(v: string | number) {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return isNaN(n) ? '' : n.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
function daysUntil(d: string) {
  const due = new Date(d);
  const now = new Date();
  const a = Date.UTC(due.getFullYear(), due.getMonth(), due.getDate());
  const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((a - b) / 86400000);
}
function whenLabel(n: number) {
  if (n < 0) return `${-n}d overdue`;
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  return `in ${n}d`;
}
function whenColor(n: number) {
  if (n < 0) return '#b42318';
  if (n <= 3) return '#b54708';
  return '#667085';
}

type DueItem =
  | { key: string; source: 'system'; title: string; dueDate: string }
  | { key: string; source: 'user'; id: string; title: string; dueDate: string; done: boolean };

export default function AccountantWorkspace() {
  const [pending, setPending] = useState<PendingActionItem[]>([]);
  const [ws, setWs] = useState<AccountingWorkspace | null>(null);
  const [notes, setNotes] = useState('');
  const [editingNotes, setEditingNotes] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);
  const [error, setError] = useState('');
  const [rTitle, setRTitle] = useState('');
  const [rDate, setRDate] = useState('');

  const loadWs = useCallback(async () => {
    const w = await getWorkspace();
    setWs(w);
  }, []);

  useEffect(() => {
    getPendingActions()
      .then((r) => setPending(r.items))
      .catch(() => {});
    loadWs().catch((e) =>
      setError(e instanceof AccountingApiError ? e.message : 'Failed to load workspace.'),
    );
  }, [loadWs]);

  function startEditNotes() {
    setNotes(ws?.notes ?? '');
    setNotesSaved(false);
    setEditingNotes(true);
  }

  async function saveNotes() {
    setSavingNotes(true);
    setError('');
    try {
      const r = await saveWorkspaceNotes(notes);
      setWs((w) => (w ? { ...w, notes: r.content, notesUpdatedAt: r.notesUpdatedAt } : w));
      setEditingNotes(false);
      setNotesSaved(true);
    } catch (e) {
      setError(e instanceof AccountingApiError ? e.message : 'Failed to save notes.');
    } finally {
      setSavingNotes(false);
    }
  }

  const dueItems: DueItem[] = useMemo(() => {
    if (!ws) return [];
    const sys: DueItem[] = ws.systemDueDates.map((s, i) => ({
      key: `sys-${i}`,
      source: 'system',
      title: s.label,
      dueDate: s.dueDate,
    }));
    const usr: DueItem[] = ws.reminders.map((r: WorkspaceReminder) => ({
      key: `r-${r.id}`,
      source: 'user',
      id: r.id,
      title: r.title,
      dueDate: r.dueDate,
      done: r.done,
    }));
    return [...sys, ...usr].sort(
      (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(),
    );
  }, [ws]);

  async function addR(e: React.FormEvent) {
    e.preventDefault();
    if (!rTitle.trim() || !rDate) return;
    try {
      await addReminder(rTitle.trim(), rDate);
      setRTitle('');
      setRDate('');
      await loadWs();
    } catch (e) {
      setError(e instanceof AccountingApiError ? e.message : 'Failed to add reminder.');
    }
  }
  async function run(fn: () => Promise<unknown>) {
    try {
      await fn();
      await loadWs();
    } catch (e) {
      setError(e instanceof AccountingApiError ? e.message : 'Action failed.');
    }
  }

  return (
    <div className="acct-ws">
      {error && <div className="acct-error">{error}</div>}

      {/* ── Pending Actions (pinned top) ── */}
      <section className="acct-panel">
        <h3 className="acct-panel__title">
          Pending Actions
          <span className={`acct-count${pending.length ? ' acct-count--on' : ''}`}>
            {pending.length}
          </span>
        </h3>
        {pending.length === 0 ? (
          <div className="acct-empty">Nothing needs your action right now.</div>
        ) : (
          <div className="acct-pending-list">
            {pending.map((it) => (
              <div key={`${it.type}-${it.id}`} className="acct-pending">
                <span className={`acct-pending__mod acct-pending__mod--${it.module}`}>
                  {it.module}
                </span>
                <div className="acct-pending__body">
                  <div className="acct-pending__label">
                    {it.label}
                    {it.createdBy ? ` — by ${it.createdBy}` : ''}
                  </div>
                  <div className="acct-pending__desc">{it.description}</div>
                </div>
                {peso(it.amount) && <span className="acct-pending__amt">{peso(it.amount)}</span>}
                <Link to={it.link} className="acct-link">
                  {it.actionLabel} →
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="acct-ws__cols">
        {/* ── Notes ── */}
        <section className="acct-panel">
          <h3 className="acct-panel__title">
            Notes
            <span style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                className="acct-btn acct-btn--sm"
                onClick={startEditNotes}
                disabled={editingNotes}
              >
                Edit
              </button>
              <button
                type="button"
                className="acct-btn acct-btn--sm acct-btn--primary"
                onClick={saveNotes}
                disabled={!editingNotes || savingNotes}
              >
                {savingNotes ? 'Saving…' : 'Save'}
              </button>
            </span>
          </h3>
          {notesSaved && (
            <div className="acct-notes-saved" role="status">
              <span>✓ Your notes have been saved.</span>
              <button
                type="button"
                className="acct-notes-saved__close"
                onClick={() => setNotesSaved(false)}
                aria-label="Dismiss"
              >
                ×
              </button>
            </div>
          )}
          <textarea
            className="acct-notes"
            value={editingNotes ? notes : (ws?.notes ?? '')}
            readOnly={!editingNotes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={
              editingNotes
                ? 'Jot down tasks, follow-ups, and reminders for yourself…'
                : 'No notes yet — click Edit to add some.'
            }
            rows={9}
          />
        </section>

        {/* ── Upcoming Due Dates ── */}
        <section className="acct-panel">
          <h3 className="acct-panel__title">Upcoming Due Dates</h3>
          <form onSubmit={addR} className="acct-reminder-form">
            <input
              value={rTitle}
              onChange={(e) => setRTitle(e.target.value)}
              placeholder="Add a reminder…"
              maxLength={200}
            />
            <input type="date" value={rDate} onChange={(e) => setRDate(e.target.value)} />
            <button
              type="submit"
              className="acct-btn acct-btn--sm acct-btn--primary"
              disabled={!rTitle.trim() || !rDate}
            >
              Add
            </button>
          </form>
          {dueItems.length === 0 ? (
            <div className="acct-empty">No upcoming due dates.</div>
          ) : (
            <ul className="acct-due-list">
              {dueItems.map((d) => {
                const n = daysUntil(d.dueDate);
                const done = d.source === 'user' && d.done;
                return (
                  <li key={d.key} className={`acct-due${done ? ' acct-due--done' : ''}`}>
                    {d.source === 'user' ? (
                      <input
                        type="checkbox"
                        checked={d.done}
                        onChange={() => run(() => updateReminder(d.id, { done: !d.done }))}
                        title="Mark done"
                      />
                    ) : (
                      <span className="acct-due__sys" title="System deadline">
                        ●
                      </span>
                    )}
                    <div className="acct-due__body">
                      <div className="acct-due__title">{d.title}</div>
                      <div className="acct-due__meta">
                        {fmtDate(d.dueDate)}
                        {!done && (
                          <span style={{ color: whenColor(n), fontWeight: 600 }}>
                            {' · '}
                            {whenLabel(n)}
                          </span>
                        )}
                        {d.source === 'system' && <span className="acct-due__badge">System</span>}
                      </div>
                    </div>
                    {d.source === 'user' && (
                      <button
                        type="button"
                        className="acct-due__del"
                        onClick={() => run(() => deleteReminder(d.id))}
                        title="Delete"
                      >
                        ×
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
