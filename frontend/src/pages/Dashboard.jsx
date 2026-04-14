import { useAuth } from '../auth/AuthContext';
import styles from './Dashboard.module.css';

const ROLE_DISPLAY = {
  admin_private:       'Private School Administrator',
  admin_international: 'International School Administrator',
  admin_vested:        'Vested School Administrator',
  principal:           'Principal',
  head_of_hr:          'Head of HR',
};

export default function Dashboard() {
  const { user } = useAuth();

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>
        Welcome, {user?.username}
      </h1>
      <p className={styles.role}>{ROLE_DISPLAY[user?.role] ?? user?.role}</p>
      {user?.school_type && (
        <p className={styles.meta}>School type: <strong>{user.school_type}</strong></p>
      )}
      <div className={styles.placeholder}>
        <p>Dashboard content coming soon.</p>
      </div>
    </div>
  );
}
