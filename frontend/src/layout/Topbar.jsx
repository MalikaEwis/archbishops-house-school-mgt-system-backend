import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import styles from './Topbar.module.css';

const ROLE_LABELS = {
  admin_private:       'Private Schools Admin',
  admin_international: 'International Schools Admin',
  admin_vested:        'Vested Schools Admin',
  principal:           'Principal',
  head_of_hr:          'Head of HR',
};

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
        <span className={styles.role}>
          {ROLE_LABELS[user?.role] ?? user?.role}
        </span>
        <div className={styles.divider} aria-hidden="true" />
        <button className={styles.logout} onClick={handleLogout}>
          Sign out
        </button>
      </div>
    </header>
  );
}
