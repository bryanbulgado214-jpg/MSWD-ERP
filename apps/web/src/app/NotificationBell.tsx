import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

interface Notification {
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

async function fetchNotifications(limit = 10): Promise<Notification[]> {
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

export function NotificationBell() {
  const navigate = useNavigate();
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const refreshCount = useCallback(() => {
    fetchUnreadCount()
      .then(setCount)
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshCount();
    const interval = setInterval(refreshCount, 30000);
    return () => clearInterval(interval);
  }, [refreshCount]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
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

  function handleClick(n: Notification) {
    if (!n.isRead) {
      markOneRead(n.id)
        .then(refreshCount)
        .catch(() => {});
    }
    setOpen(false);
    if (n.linkUrl) {
      navigate(n.linkUrl);
    }
  }

  function handleMarkAllRead() {
    markAllAsRead()
      .then(() => {
        refreshCount();
        setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      })
      .catch(() => {});
  }

  return (
    <div className="notif-bell" ref={ref}>
      <button
        type="button"
        className="notif-bell__btn"
        onClick={toggleDropdown}
        title="Notifications"
      >
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
              <button
                type="button"
                className="notif-dropdown__mark-all"
                onClick={handleMarkAllRead}
              >
                Mark all read
              </button>
            )}
          </div>

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
  );
}
