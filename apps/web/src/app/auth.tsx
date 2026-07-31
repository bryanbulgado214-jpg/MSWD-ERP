import { createContext, useCallback, useContext, useEffect, useState } from 'react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001';
const TOKEN_KEY = 'mswd_access_token';

interface AuthUser {
  username: string;
  sub: string;
  organizationId: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  permissions: Set<string>;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  hasPermission: (code: string) => boolean;
  hasAnyPermission: (...codes: string[]) => boolean;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  permissions: new Set(),
  loading: true,
  login: async () => {},
  logout: () => {},
  hasPermission: () => false,
  hasAnyPermission: () => false,
});

export function useAuth() {
  return useContext(AuthContext);
}

function decodePayload(token: string): AuthUser | null {
  try {
    const base64 = token.split('.')[1];
    if (!base64) return null;
    const json = atob(base64.replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(json);
    if (payload.exp && payload.exp * 1000 < Date.now()) return null;
    return { username: payload.username, sub: payload.sub, organizationId: payload.organizationId };
  } catch {
    return null;
  }
}

async function fetchPermissions(token: string): Promise<Set<string>> {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return new Set();
    const body = await response.json();
    return new Set(body.permissions as string[]);
  } catch {
    return new Set();
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      const decoded = decodePayload(token);
      if (decoded) {
        setUser(decoded);
        fetchPermissions(token).then((perms) => {
          setPermissions(perms);
          setLoading(false);
        });
        return;
      }
    }
    setLoading(false);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.message ?? 'Login failed');
    }
    const { accessToken } = await response.json();
    localStorage.setItem(TOKEN_KEY, accessToken);
    const decoded = decodePayload(accessToken);
    setUser(decoded);
    const perms = await fetchPermissions(accessToken);
    setPermissions(perms);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
    setPermissions(new Set());
  }, []);

  const hasPermission = useCallback((code: string) => permissions.has(code), [permissions]);
  const hasAnyPermission = useCallback((...codes: string[]) => codes.some((c) => permissions.has(c)), [permissions]);

  return (
    <AuthContext.Provider value={{ user, permissions, loading, login, logout, hasPermission, hasAnyPermission }}>
      {children}
    </AuthContext.Provider>
  );
}
