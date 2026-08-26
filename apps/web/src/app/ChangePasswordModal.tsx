import { useState } from 'react';

import { useAuth } from './auth';

/**
 * Self-service password change for the logged-in user. Opened from the user
 * menu in the header. Requires the current password server-side.
 */
export function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const { changePassword } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (next.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (next !== confirm) {
      setError('New password and confirmation do not match.');
      return;
    }
    setBusy(true);
    try {
      await changePassword(current, next);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change password.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(16,24,40,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
        padding: 16,
      }}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 12,
          width: 'min(420px, 100%)',
          padding: '20px 22px',
          boxShadow: '0 20px 48px rgba(16,24,40,0.28)',
        }}
      >
        <h2 style={{ margin: '0 0 4px', fontSize: 18, color: 'var(--mswd-navy, #10233f)' }}>
          Change password
        </h2>
        <p style={{ margin: '0 0 16px', color: '#667085', fontSize: 12.5 }}>
          Enter your current password, then choose a new one (at least 8 characters).
        </p>

        {done ? (
          <>
            <div
              style={{
                background: '#ecfdf3',
                border: '1px solid #6ce9a6',
                color: '#027a48',
                borderRadius: 8,
                padding: '10px 12px',
                fontSize: 13,
                marginBottom: 16,
              }}
            >
              Your password has been changed. Use it the next time you sign in.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" className="app-nav__btn" onClick={onClose}>
                Close
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={submit}>
            {error && (
              <div
                style={{
                  background: 'var(--mswd-badge-bg-red, #fef3f2)',
                  border: '1px solid #f3c6c1',
                  color: 'var(--mswd-red, #b42318)',
                  borderRadius: 8,
                  padding: '8px 12px',
                  fontSize: 13,
                  marginBottom: 12,
                }}
              >
                {error}
              </div>
            )}

            <label style={fieldStyle}>
              <span style={labelStyle}>Current password</span>
              <input
                type={show ? 'text' : 'password'}
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                autoComplete="current-password"
                autoFocus
                required
                style={inputStyle}
              />
            </label>
            <label style={fieldStyle}>
              <span style={labelStyle}>New password</span>
              <input
                type={show ? 'text' : 'password'}
                value={next}
                onChange={(e) => setNext(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
                style={inputStyle}
              />
            </label>
            <label style={fieldStyle}>
              <span style={labelStyle}>Confirm new password</span>
              <input
                type={show ? 'text' : 'password'}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
                style={inputStyle}
              />
            </label>

            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 12.5,
                color: '#475467',
                margin: '2px 0 16px',
                cursor: 'pointer',
              }}
            >
              <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
              Show passwords
            </label>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" className="app-nav__btn" onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <button
                type="submit"
                className="app-nav__btn app-nav__btn--logout"
                disabled={busy || !current || !next || !confirm}
                style={{
                  background: 'var(--mswd-navy, #10233f)',
                  color: '#fff',
                  borderColor: 'transparent',
                }}
              >
                {busy ? 'Saving…' : 'Change password'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

const fieldStyle: React.CSSProperties = { display: 'block', marginBottom: 12 };
const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: '#475467',
  marginBottom: 5,
};
const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  border: '1.5px solid var(--mswd-border, #d0d5dd)',
  borderRadius: 8,
  fontSize: 14,
  fontFamily: 'inherit',
  outline: 'none',
  boxSizing: 'border-box',
};
