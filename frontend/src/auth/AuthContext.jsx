import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import client from '../api/client';

const AuthContext = createContext(null);

/**
 * Maps a backend role string to the user's home route.
 * Used after login and in RoleGuard to redirect to the right section.
 */
export function getRoleHome(role) {
  switch (role) {
    case 'admin_private':       return '/private/teachers';
    case 'admin_international': return '/international/teachers';
    case 'admin_vested':        return '/vested/schools';
    case 'principal':
    case 'head_of_hr':          return '/my-school';
    default:                    return '/dashboard';
  }
}

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true); // true until we know auth state

  // On mount: if a token exists, validate it by fetching /api/auth/me.
  // This prevents a stale token from granting access after a password change.
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setLoading(false);
      return;
    }

    client.get('/auth/me')
      .then(({ data }) => setUser(data.data))
      .catch(() => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (username, password) => {
    const { data } = await client.post('/auth/login', { username, password });
    const { token, user: userData } = data.data;
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
    return userData; // caller uses userData.role to redirect
  }, []);

  const logout = useCallback(async () => {
    try {
      await client.post('/auth/logout');
    } catch {
      // ignore — we clear client state regardless
    }
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
