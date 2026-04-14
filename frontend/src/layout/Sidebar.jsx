import { NavLink } from 'react-router-dom';
import { useAuth, getRoleHome } from '../auth/AuthContext';
import styles from './Sidebar.module.css';

const ROLE_LABELS = {
  admin_private:       'Private Schools',
  admin_international: 'International Schools',
  admin_vested:        'Vested Schools',
  principal:           'My School',
  head_of_hr:          'My School',
};

const NAV_BY_ROLE = {
  admin_private: [
    { label: 'Teachers',   to: '/private/teachers' },
  ],
  admin_international: [
    { label: 'Teachers',   to: '/international/teachers' },
  ],
  admin_vested: [
    { label: 'Schools',    to: '/vested/schools' },
  ],
  principal: [
    { label: 'My School',  to: '/my-school' },
  ],
  head_of_hr: [
    { label: 'My School',  to: '/my-school' },
  ],
};

export default function Sidebar() {
  const { user } = useAuth();
  const navItems = NAV_BY_ROLE[user?.role] ?? [];
  const section  = ROLE_LABELS[user?.role] ?? 'Dashboard';

  return (
    <aside className={styles.sidebar}>
      <div className={styles.brand}>
        <span className={styles.brandShort}>AHS</span>
        <span className={styles.brandFull}>Archbishop's House</span>
      </div>

      <div className={styles.section}>{section}</div>

      <nav className={styles.nav}>
        {navItems.map(({ label, to }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              [styles.link, isActive ? styles.active : ''].join(' ')
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
