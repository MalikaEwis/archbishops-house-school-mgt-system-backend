import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth, getRoleHome } from '../auth/AuthContext';
import styles from './Login.module.css';

export default function Login() {
  const { user, login } = useAuth();
  const navigate        = useNavigate();
  const location        = useLocation();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [busy, setBusy]         = useState(false);

  // If already authenticated, redirect immediately
  useEffect(() => {
    if (user) {
      const dest = location.state?.from?.pathname ?? getRoleHome(user.role);
      navigate(dest, { replace: true });
    }
  }, [user, navigate, location]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const loggedIn = await login(username.trim(), password);
      const dest = location.state?.from?.pathname ?? getRoleHome(loggedIn.role);
      navigate(dest, { replace: true });
    } catch (err) {
      const msg = err.response?.data?.message ?? 'Login failed. Please check your credentials.';
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.header}>
          <h1 className={styles.title}>Archbishop's House</h1>
          <p className={styles.subtitle}>School Management System</p>
        </div>

        <form onSubmit={handleSubmit} className={styles.form} noValidate>
          {error && <p className={styles.error}>{error}</p>}

          <div className={styles.field}>
            <label htmlFor="username" className={styles.label}>Username</label>
            <input
              id="username"
              type="text"
              className={styles.input}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
              required
              disabled={busy}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="password" className={styles.label}>Password</label>
            <input
              id="password"
              type="password"
              className={styles.input}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              disabled={busy}
            />
          </div>

          <button type="submit" className={styles.button} disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
