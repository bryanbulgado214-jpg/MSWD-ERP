import { useCallback, useEffect, useMemo, useState } from 'react';

import '../modules/accounting/pages/accounting.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

interface Reminder {
  id: string;
  title: string;
  dueDate: string;
  done: boolean;
}
interface SystemDueDate {
  label: string;
  dueDate: string;
  source: 'system';
}
interface Workspace {
  notes: string;
  notesUpdatedAt: string | null;
  reminders: Reminder[];
  systemDueDates: SystemDueDate[];
}

type DueItem =
  | { key: string; source: 'system'; title: string; dueDate: string }
  | { key: string; source: 'user'; id: string; title: string; dueDate: string; done: boolean };

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

async function req(path: string, method = 'GET', body?: unknown) {
  const token = localStorage.getItem('mswd_access_token');
  const res = await fetch(`${API_BASE_URL}/accounting/workspace${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) throw new Error(`Request failed (${res.status}).`);
  return res.status === 204 ? null : res.json();
}

/**
 * Personal Notes + Upcoming Due Dates, the same workspace the accountant sees on
 * the Accounting Dashboard, backed by /accounting/workspace (per-user). Dropped
 * onto the Cashiering Dashboard so the cashier gets the same to-dos & reminders.
 */
export function WorkspacePanel() {
  const [ws, setWs] = useState<Workspace | null>(null);
  const [notes, setNotes] = useState('');
  const [editingNotes, setEditingNotes] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);
  const [error, setError] = useState('');
  const [rTitle, setRTitle] = useState('');
  const [rDate, setRDate] = useState('');

  const loadWs = useCallback(async () => {
    const w = (await req('')) as Workspace;
    setWs(w);
  }, []);

  useEffect(() => {
    loadWs().catch((e) => setError(e instanceof Error ? e.message : 'Failed to load workspace.'));
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
      const r = (await req('/notes', 'PUT', { content: notes })) as {
        content: string;
        notesUpdatedAt: string;
      };
      setWs((w) => (w ? { ...w, notes: r.content, notesUpdatedAt: r.notesUpdatedAt } : w));
      setEditingNotes(false);
      setNotesSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save notes.');
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
    const usr: DueItem[] = ws.reminders.map((r) => ({
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
      await req('/reminders', 'POST', { title: rTitle.trim(), dueDate: rDate });
      setRTitle('');
      setRDate('');
      await loadWs();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add reminder.');
    }
  }
  async function run(fn: () => Promise<unknown>) {
    try {
      await fn();
      await loadWs();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed.');
    }
  }

  return (
    <div className="acct-ws" style={{ marginBottom: 20 }}>
      {error && <div className="acct-error">{error}</div>}
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
                        onChange={() =>
                          run(() => req(`/reminders/${d.id}`, 'PATCH', { done: !d.done }))
                        }
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
                        onClick={() => run(() => req(`/reminders/${d.id}`, 'DELETE'))}
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
