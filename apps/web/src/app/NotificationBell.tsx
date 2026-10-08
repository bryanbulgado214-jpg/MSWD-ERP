import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

interface Notif {
  id: string;
  title: string;
  body: string | null;
  linkUrl: string | null;
  isRead: boolean;
  createdAt: string;
}

function getToken(): string | null {
  return localStorage.getItem('mswd_access_token');
}

async function fetchUnreadCount(): Promise<number> {
  const token = getToken();
  if (!token) return 0;
  const res = await fetch(`${API_BASE_URL}/notifications/unread-count`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return 0;
  const data = await res.json();
  return data.count ?? 0;
}

async function fetchNotifications(limit = 10): Promise<Notif[]> {
  const token = getToken();
  if (!token) return [];
  const res = await fetch(`${API_BASE_URL}/notifications?limit=${limit}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.items ?? [];
}

async function markOneRead(id: string): Promise<void> {
  const token = getToken();
  if (!token) return;
  await fetch(`${API_BASE_URL}/notifications/${id}/read`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function markAllAsRead(): Promise<void> {
  const token = getToken();
  if (!token) return;
  await fetch(`${API_BASE_URL}/notifications/mark-all-read`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

type DesktopState = 'default' | 'granted' | 'denied' | 'unsupported';

// Poll frequently so new notifications land in near-real-time. (Browsers throttle
// background-tab timers, so a backgrounded tab updates a little slower — desktop
// notifications still fire; see the Web-Push note in the component.)
const POLL_MS = 8000;

export function NotificationBell() {
  const navigate = useNavigate();
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(false);
  const [toasts, setToasts] = useState<Notif[]>([]);
  const [desktop, setDesktop] = useState<DesktopState>('default');
  const ref = useRef<HTMLDivElement>(null);
  const seenIds = useRef<Set<string>>(new Set());
  const initialized = useRef(false);
  const navRef = useRef(navigate);
  navRef.current = navigate;

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setDesktop('unsupported');
      return;
    }
    setDesktop(window.Notification.permission as DesktopState);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const fireDesktop = useCallback((n: Notif) => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (window.Notification.permission !== 'granted') return;
    try {
      const d = new window.Notification(n.title, { tag: n.id, ...(n.body ? { body: n.body } : {}) });
      d.onclick = () => {
        window.focus();
        if (n.linkUrl) navRef.current(n.linkUrl);
        d.close();
      };
    } catch {
      /* some browsers throw if constructed outside a SW in certain states */
    }
  }, []);

  const showNew = useCallback(
    (n: Notif) => {
      setToasts((prev) => [n, ...prev.filter((t) => t.id !== n.id)].slice(0, 4));
      window.setTimeout(() => dismissToast(n.id), 7000);
      fireDesktop(n);
    },
    [dismissToast, fireDesktop],
  );

  const poll = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    const [cnt, list] = await Promise.all([fetchUnreadCount(), fetchNotifications(10)]);
    setCount(cnt);
    setNotifications(list);
    if (!initialized.current) {
      // Baseline on first load — don't pop toasts for notifications already there.
      list.forEach((n) => seenIds.current.add(n.id));
      initialized.current = true;
      return;
    }
    const fresh = list.filter((n) => !seenIds.current.has(n.id));
    fresh.forEach((n) => seenIds.current.add(n.id));
    // Oldest-first so the newest ends up on top of the toast stack.
    fresh
      .filter((n) => !n.isRead)
      .reverse()
      .forEach(showNew);
  }, [showNew]);

  useEffect(() => {
    poll().catch(() => {});
    const interval = window.setInterval(() => poll().catch(() => {}), POLL_MS);
    return () => window.clearInterval(interval);
  }, [poll]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function toggleDropdown() {
    if (!open) {
      setLoading(true);
      fetchNotifications(10)
        .then(setNotifications)
        .catch(() => {})
        .finally(() => setLoading(false));
    }
    setOpen(!open);
  }

  function handleClick(n: Notif) {
    if (!n.isRead) {
      markOneRead(n.id)
        .then(() => poll())
        .catch(() => {});
    }
    setOpen(false);
    if (n.linkUrl) navigate(n.linkUrl);
  }

  function handleMarkAllRead() {
    markAllAsRead()
      .then(() => {
        poll();
        setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      })
      .catch(() => {});
  }

  async function enableDesktop() {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    try {
      const res = await window.Notification.requestPermission();
      setDesktop(res as DesktopState);
    } catch {
      /* ignore */
    }
  }

  return (
    <>
      <div className="notif-bell" ref={ref}>
        <button type="button" className="notif-bell__btn" onClick={toggleDropdown} title="Notifications">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          {count > 0 && <span className="notif-bell__badge">{count > 99 ? '99+' : count}</span>}
        </button>

        {open && (
          <div className="notif-dropdown">
            <div className="notif-dropdown__header">
              <span className="notif-dropdown__title">Notifications</span>
              {count > 0 && (
                <button type="button" className="notif-dropdown__mark-all" onClick={handleMarkAllRead}>
                  Mark all read
                </button>
              )}
            </div>

            {desktop === 'default' && (
              <button type="button" className="notif-dropdown__enable" onClick={enableDesktop}>
                🔔 Enable desktop alerts
              </button>
            )}
            {desktop === 'denied' && (
              <div className="notif-dropdown__enable notif-dropdown__enable--muted">
                Desktop alerts are blocked in your browser settings.
              </div>
            )}

            {loading && <div className="notif-dropdown__empty">Loading...</div>}
            {!loading && notifications.length === 0 && (
              <div className="notif-dropdown__empty">No notifications yet.</div>
            )}
            {!loading && notifications.length > 0 && (
              <div className="notif-dropdown__list">
                {notifications.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    className={`notif-item${n.isRead ? '' : ' notif-item--unread'}`}
                    onClick={() => handleClick(n)}
                  >
                    {!n.isRead && <span className="notif-item__dot" />}
                    <div className="notif-item__content">
                      <div className="notif-item__title">{n.title}</div>
                      {n.body && <div className="notif-item__body">{n.body}</div>}
                      <div className="notif-item__time">{timeAgo(n.createdAt)}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Facebook-style corner toasts for notifications that arrive while you're here. */}
      {toasts.length > 0 && (
        <div className="notif-toasts">
          {toasts.map((t) => (
            <div
              key={t.id}
              className="notif-toast"
              role="button"
              tabIndex={0}
              onClick={() => {
                dismissToast(t.id);
                if (t.linkUrl) navigate(t.linkUrl);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  dismissToast(t.id);
                  if (t.linkUrl) navigate(t.linkUrl);
                }
              }}
            >
              <div className="notif-toast__title">{t.title}</div>
              {t.body && <div className="notif-toast__body">{t.body}</div>}
              <button
                type="button"
                className="notif-toast__close"
                aria-label="Dismiss"
                onClick={(e) => {
                  e.stopPropagation();
                  dismissToast(t.id);
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
