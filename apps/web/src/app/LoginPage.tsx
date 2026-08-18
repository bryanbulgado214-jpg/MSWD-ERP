import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from './auth';
import './login.css';

const ROLE_HINTS: Record<string, string> = {
  'sbwd.admin': 'Administrator — full system access, user & role management',
  'sbwd.accountant': 'Accountant — prepares JEVs, views ledgers & statements',
  'sbwd.cashier': 'Cashier — disburses: assigns check #, prints, releases',
  'sbwd.gm': 'General Manager — dedicated check-void approver',
};

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>

          <button
            type="submit"
            className="login-button"
            disabled={submitting || !username || !password}
          >
            {submitting ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

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
      </div>
    </div>
  );
}
