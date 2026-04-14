import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import styles from './Topbar.module.css';

export default function Topbar() {
  const { user, logout } = useAuth();
  const navigate         = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <header className={styles.topbar}>
      <div className={styles.left} />

      <div className={styles.right}>
        <span className={styles.username}>{user?.username}</span>
        <span className={styles.role}>{user?.role}</span>
        <button className={styles.logout} onClick={handleLogout}>
          Sign out
        </button>
      </div>
    </header>
  );
}
