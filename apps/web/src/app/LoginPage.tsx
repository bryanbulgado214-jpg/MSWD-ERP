import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from './auth';
import './login.css';

const ROLE_HINTS: Record<string, string> = {
  'demo.admin': 'Administrator — full system access, user & role management',
  'demo.accountant': 'Accountant — prepares JEVs, views ledgers & statements',
  'demo.teller': 'Teller — collects payments & issues OR (Collection screens)',
  'demo.cashier': 'Cashier — disburses: assigns check #, prints, releases',
  'demo.gm': 'General Manager — dedicated check-void approver',
};

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(username, password);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function quickLogin(user: string) {
    setSubmitting(true);
    setError(null);
    setUsername(user);
    setPassword('ChangeMe!2026');
    try {
      await login(user, 'ChangeMe!2026');
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  }

  // Password-less quick-login is a DEV convenience only. It is compiled OUT of
  // production builds entirely (import.meta.env.DEV is false there), so the live
  // deployment never shows it. Even in dev, only expose it on localhost / a
  // private LAN — never over a public tunnel / public IP, where anyone with the
  // URL could otherwise sign in as an admin with a single click.
  const host = window.location.hostname;
  const showQuickLogin =
    import.meta.env.DEV &&
    (host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host));

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <img src="/aquabooks-logo.png" alt="AquaBooks" className="login-logo" />
          <p className="login-subtitle">AquaBooks by Officient</p>
        </div>

        {error && <p className="login-error">{error}</p>}

        <form onSubmit={handleSubmit}>
          <label className="login-field">
            <span>Username</span>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
              required
            />
          </label>

          <label className="login-field">
            <span>Password</span>
            <div className="login-input-wrap">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="login-eye"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                title={showPassword ? 'Hide password' : 'Show password'}
                tabIndex={-1}
              >
                {showPassword ? (
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </label>

          <button
            type="submit"
            className="login-button"
            disabled={submitting || !username || !password}
          >
            {submitting ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        {showQuickLogin && (
          <div className="login-quick">
            <p className="login-quick-label">Quick login (dev only)</p>
            <div className="login-quick-buttons">
              {Object.entries(ROLE_HINTS).map(([user, hint]) => (
                <button
                  key={user}
                  type="button"
                  className="login-quick-btn"
                  disabled={submitting}
                  onClick={() => quickLogin(user)}
                >
                  <strong>{user}</strong>
                  <span>{hint}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
